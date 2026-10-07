/**
 * Phase 6 — Mobile notification helpers.
 */

import { apiFetch } from "./api";

export const NOTIFICATION_CATEGORIES = [
  "NEW_MESSAGE",
  "NEW_OFFER",
  "COUNTEROFFER",
  "OFFER_ACCEPTED",
  "OFFER_REJECTED",
  "ITEM_SOLD",
  "ITEM_SAVED",
  "PRICE_DROP",
  "SAVED_SEARCH_MATCH",
  "PAYMENT_RECEIVED",
  "PAYMENT_RELEASED",
  "DELIVERY_UPDATE",
  "VERIFICATION_UPDATE",
  "DISPUTE_UPDATE",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];
export type NotificationChannel = "IN_APP" | "PUSH" | "EMAIL";

export const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  "IN_APP",
  "PUSH",
  "EMAIL",
];

export const CRITICAL_CATEGORIES = new Set<string>([
  "PAYMENT_RECEIVED",
  "PAYMENT_RELEASED",
  "DELIVERY_UPDATE",
  "DISPUTE_UPDATE",
]);

export function isCriticalCategory(category: string): boolean {
  return (
    CRITICAL_CATEGORIES.has(category) || category.startsWith("PAYMENT_")
  );
}

export type AppNotification = {
  id: string;
  category: string;
  channel: string;
  title: string;
  body: string;
  deepLink: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPreference = {
  id: string;
  category: string;
  channel: string;
  enabled: boolean;
};

export function categoryLabel(category: string): string {
  return category.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Parse reworth:// or path deep links for in-app routing. */
export function parseDeepLink(
  deepLink: string | null | undefined,
): {
  kind:
    | "order"
    | "dispute"
    | "chat"
    | "listing"
    | "selling"
    | "moving_sale"
    | "community"
    | "bundle"
    | "storefront"
    | "other";
  id?: string;
} | null {
  if (!deepLink) return null;
  let path = deepLink.trim();
  try {
    if (/^https?:\/\//i.test(path)) {
      const u = new URL(path);
      path = u.pathname + u.search;
    }
  } catch {
    /* keep path */
  }
  if (path.startsWith("reworth://")) {
    path = "/" + path.slice("reworth://".length).replace(/^\/+/, "");
  }
  if (!path.startsWith("/")) path = `/${path}`;

  const storefront = path.match(/^\/u\/([\w.-]+)/i) || path.match(/^\/@([\w.-]+)/);
  if (storefront) return { kind: "storefront", id: storefront[1] };

  const bundle = path.match(/^\/ask\/bundles\/([\w-]+)/i);
  if (bundle) return { kind: "bundle", id: bundle[1] };

  const moving = path.match(/^\/moving-sales\/([\w-]+)/i);
  if (moving) return { kind: "moving_sale", id: moving[1] };
  const community = path.match(/^\/communities\/([\w-]+)/i);
  if (community) return { kind: "community", id: community[1] };

  const m =
    path.match(/^\/orders\/([\w-]+)/i) ||
    path.match(/^\/disputes\/([\w-]+)/i) ||
    path.match(/^\/chats\/([\w-]+)/i) ||
    path.match(/^\/listings\/([\w-]+)/i);
  if (/^\/selling\/?$/i.test(path)) return { kind: "selling" };
  const selling = path.match(/^\/selling\/([\w-]+)/i);
  if (selling) return { kind: "selling", id: selling[1] };
  if (!m) return { kind: "other" };
  if (/orders/i.test(path)) return { kind: "order", id: m[1] };
  if (/disputes/i.test(path)) return { kind: "dispute", id: m[1] };
  if (/chats/i.test(path)) return { kind: "chat", id: m[1] };
  if (/listings/i.test(path)) return { kind: "listing", id: m[1] };
  return { kind: "other" };
}

export function unreadNotificationCount(
  token: string,
): Promise<{ count: number }> {
  return apiFetch("/notifications/unread-count", {
    token,
    cache: "no-store",
  });
}

export function listNotifications(
  token: string,
  opts?: { category?: string; unread?: boolean },
): Promise<AppNotification[]> {
  const q = new URLSearchParams();
  if (opts?.category) q.set("category", opts.category);
  if (opts?.unread === true) q.set("unread", "true");
  if (opts?.unread === false) q.set("unread", "false");
  const qs = q.toString();
  return apiFetch(`/notifications${qs ? `?${qs}` : ""}`, {
    token,
    cache: "no-store",
  });
}

export function markNotificationRead(
  token: string,
  id: string,
): Promise<AppNotification> {
  return apiFetch(`/notifications/${id}/read`, { method: "POST", token });
}

export function clearNotifications(
  token: string,
): Promise<{ deleted: number }> {
  return apiFetch(`/notifications`, {
    method: "DELETE",
    token,
    cache: "no-store",
  });
}

export function markAllNotificationsRead(
  token: string,
): Promise<{ updated: number }> {
  return apiFetch(`/notifications/read-all`, {
    method: "POST",
    token,
    cache: "no-store",
  });
}

export function getNotificationPreferences(
  token: string,
): Promise<NotificationPreference[]> {
  return apiFetch(`/notifications/preferences`, { token });
}

export function patchNotificationPreference(
  token: string,
  body: { category: string; channel: NotificationChannel; enabled: boolean },
): Promise<NotificationPreference> {
  return apiFetch(`/notifications/preferences`, {
    method: "PATCH",
    token,
    body,
  });
}
