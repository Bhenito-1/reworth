import { Platform } from "react-native";
import { apiFetch } from "./api";
import type { PriceIntelligence, PublicListing } from "./types";

function configuredWebOrigin(): string {
  const raw = (
    process.env.EXPO_PUBLIC_WEB_URL ??
    process.env.NEXT_PUBLIC_WEB_URL ??
    ""
  ).trim();
  return raw.replace(/\/$/, "");
}

/**
 * Public listing page. Uses EXPO_PUBLIC_WEB_URL when set (the deployed site).
 * On the website itself, uses that site's address. Local app builds use the
 * local web app until the public address is configured.
 */
export function listingShareUrl(id: string): string {
  const path = `/listings/${encodeURIComponent(id)}`;
  const configured = configuredWebOrigin();
  if (configured) return `${configured}${path}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = window.location.origin.replace(/\/$/, "");
    const localApp = /localhost:8081|127\.0\.0\.1:8081/.test(origin);
    if (!localApp) return `${origin}${path}`;
  }
  return `http://localhost:3000${path}`;
}

export function listingShareLinks(id: string, title: string) {
  const url = listingShareUrl(id);
  const text = `${title} on ReWorth`;
  const encoded = encodeURIComponent(`${text} ${url}`);
  return {
    url,
    message: `${text}\n${url}`,
    whatsapp: `https://wa.me/?text=${encoded}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    x: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
  };
}

export function listingDeepLink(id: string): string {
  return `reworth://listings/${encodeURIComponent(id)}`;
}

export async function createListing(
  token: string,
  body: Record<string, unknown> = {},
): Promise<PublicListing> {
  return apiFetch<PublicListing>("/listings", {
    method: "POST",
    token,
    body,
  });
}

export async function getListing(
  id: string,
  token?: string | null,
): Promise<PublicListing> {
  return apiFetch<PublicListing>(`/listings/${id}`, { token });
}

export type MineListing = {
  id: string;
  title: string;
  status: string;
  priceKobo: number;
  updatedAt: string;
  reviewState: string;
  reviewLabel: string;
  reviewNote: string | null;
  canRemove?: boolean;
  hasAcceptedOrder?: boolean;
};

export async function listMine(
  token: string,
): Promise<{ items: MineListing[] }> {
  return apiFetch<{ items: MineListing[] }>("/listings/mine", { token });
}

export async function removeListing(token: string, id: string) {
  return apiFetch(`/listings/${id}`, { method: "DELETE", token });
}

export async function browseListings(
  token?: string | null,
): Promise<PublicListing[]> {
  return apiFetch<PublicListing[]>("/listings?limit=30", { token });
}

export async function patchListing(
  id: string,
  token: string,
  body: Record<string, unknown>,
): Promise<PublicListing> {
  return apiFetch<PublicListing>(`/listings/${id}`, {
    method: "PATCH",
    token,
    body,
  });
}

export async function publishListing(
  id: string,
  token: string,
): Promise<PublicListing> {
  return apiFetch<PublicListing>(`/listings/${id}/publish`, {
    method: "POST",
    token,
  });
}

export async function appealListing(
  id: string,
  token: string,
  reason: string,
): Promise<{ id: string; status: string }> {
  return apiFetch(`/listings/${id}/appeal`, {
    method: "POST",
    token,
    body: { reason },
  });
}

export async function assistListing(
  id: string,
  token: string,
  imageKeys?: string[],
): Promise<{
  draft: {
    title: string;
    description: string;
    brand?: string;
    suggestedCondition: string;
    suggestedCategory: string;
    suggestedPriceNaira: number;
  };
}> {
  return apiFetch(`/listings/${id}/assist`, {
    method: "POST",
    token,
    body: imageKeys ? { imageKeys } : {},
  });
}

export async function getPriceIntelligence(
  id: string,
): Promise<PriceIntelligence> {
  return apiFetch(`/listings/${id}/price-intelligence`);
}

export async function attachListingImages(
  id: string,
  token: string,
  images: { key: string; sortOrder: number }[],
): Promise<{ listing: PublicListing }> {
  return apiFetch(`/listings/${id}/images`, {
    method: "POST",
    token,
    body: { images },
  });
}

/** Authenticated multipart upload — stores bytes and marks image READY. */
export async function uploadListingPhotoDirect(
  token: string,
  listingId: string,
  file: {
    uri: string;
    name: string;
    type: string;
    /** Real file from the web photo picker. A `{ uri, name, type }` object is not a file in the browser. */
    file?: Blob;
  },
  sortOrder: number,
): Promise<{ key: string; status: string }> {
  const form = new FormData();
  const name = file.name || "photo.jpg";
  if (Platform.OS === "web") {
    const blob =
      file.file && file.file.size > 0 ? file.file : await blobFromUri(file.uri);
    form.append("file", namedFile(blob, name));
  } else {
    form.append("file", {
      uri: file.uri,
      name,
      type: file.type || "image/jpeg",
    } as unknown as Blob);
  }
  form.append("listingId", listingId);
  form.append("sortOrder", String(sortOrder));

  const image = await apiFetch<{ originalKey: string; status: string }>(
    "/media/direct",
    {
      method: "POST",
      token,
      body: form,
    },
  );
  return { key: image.originalKey, status: image.status };
}

function namedFile(blob: Blob, name: string): Blob {
  const FileCtor = (
    globalThis as {
      File?: new (
        bits: Blob[],
        filename: string,
        options?: { type?: string },
      ) => Blob;
    }
  ).File;
  if (!FileCtor) return blob;
  return new FileCtor([blob], name, {
    type: blob.type && blob.type !== "application/octet-stream"
      ? blob.type
      : "image/jpeg",
  });
}

async function blobFromUri(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error("Could not read that photo. Add it again.");
  }
  const blob = await response.blob();
  if (!blob.size) {
    throw new Error("That photo was empty. Add it again.");
  }
  return blob;
}

export async function presignMedia(
  token: string,
  listingId: string,
  fileName: string,
  contentType: string,
  contentLength: number,
): Promise<{ uploadUrl: string; key: string }> {
  return apiFetch("/media/presign", {
    method: "POST",
    token,
    body: { listingId, fileName, contentType, contentLength },
  });
}

export async function completeMedia(
  token: string,
  listingId: string,
  key: string,
  sortOrder: number,
  opts?: { inlineBase64?: string; contentType?: string },
): Promise<unknown> {
  return apiFetch("/media/complete", {
    method: "POST",
    token,
    body: {
      listingId,
      key,
      sortOrder,
      ...(opts?.inlineBase64
        ? {
            inlineBase64: opts.inlineBase64,
            contentType: opts.contentType ?? "image/jpeg",
          }
        : {}),
    },
  });
}
