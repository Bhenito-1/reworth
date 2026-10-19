/**
 * Phase 3.1 — Room scan (PRD §53). Aligns with RoomScanController.
 */

import { apiFetch } from "./api";
import type { RoomScan, RoomScanDraft, RoomScanItem } from "./types";

export async function createRoomScan(
  token: string,
  body: { photoKeys: string[]; city?: string },
): Promise<RoomScan> {
  return apiFetch<RoomScan>("/room-scans", {
    method: "POST",
    token,
    body,
  });
}

export async function getRoomScan(
  token: string,
  scanId: string,
): Promise<RoomScan> {
  return apiFetch<RoomScan>(`/room-scans/${scanId}`, { token });
}

export async function startRoomScanDetect(
  token: string,
  scanId: string,
): Promise<RoomScan> {
  return apiFetch<RoomScan>(`/room-scans/${scanId}/detect`, {
    method: "POST",
    token,
  });
}

export async function updateRoomScanItems(
  token: string,
  scanId: string,
  items: Array<{
    id: string;
    selected?: boolean;
    condition?: string;
  }>,
): Promise<RoomScan> {
  return apiFetch<RoomScan>(`/room-scans/${scanId}/items`, {
    method: "PATCH",
    token,
    body: { items },
  });
}

export async function createRoomScanDrafts(
  token: string,
  scanId: string,
): Promise<{ roomScan: RoomScan; drafts: RoomScanDraft[]; idempotent?: boolean }> {
  return apiFetch(`/room-scans/${scanId}/create-drafts`, {
    method: "POST",
    token,
  });
}

export async function listRoomScanDrafts(
  token: string,
  scanId: string,
): Promise<RoomScanDraft[]> {
  return apiFetch(`/room-scans/${scanId}/drafts`, { token });
}

export async function publishRoomScanDrafts(
  token: string,
  scanId: string,
  listingIds: string[],
): Promise<unknown> {
  return apiFetch(`/room-scans/${scanId}/publish`, {
    method: "POST",
    token,
    body: { listingIds },
  });
}

/** Poll until READY / DRAFTS_CREATED / FAILED / CANCELLED or timeout. */
export async function pollRoomScanUntilReady(
  token: string,
  scanId: string,
  opts?: { intervalMs?: number; maxAttempts?: number },
): Promise<RoomScan> {
  const intervalMs = opts?.intervalMs ?? 1200;
  const maxAttempts = opts?.maxAttempts ?? 40;
  let last: RoomScan | null = null;
  for (let i = 0; i < maxAttempts; i++) {
    last = await getRoomScan(token, scanId);
    const status = last.status;
    if (
      status === "READY" ||
      status === "DRAFTS_CREATED" ||
      status === "FAILED" ||
      status === "CANCELLED"
    ) {
      return last;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last!;
}

export async function uploadPlatformPhoto(
  token: string,
  file: File,
  _opts?: { listingId?: string },
): Promise<{ key: string; previewUrl: string; publicUrl?: string }> {
  const form = new FormData();
  form.append("file", file);

  const stored = await apiFetch<{ key: string; publicUrl: string }>(
    "/media/store",
    {
      method: "POST",
      token,
      body: form,
    },
  );

  return {
    key: stored.key,
    previewUrl: URL.createObjectURL(file),
    publicUrl: stored.publicUrl,
  };
}

export function selectedItems(scan: RoomScan): RoomScanItem[] {
  return (scan.items ?? []).filter((i) => i.selected);
}
