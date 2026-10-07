/**
 * Phase 6 — Notification engine API helpers.
 * Shapes match NotificationsController + DevicesController.
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

/** Payment / delivery / dispute — IN_APP cannot be disabled. */
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
  userId: string;
  category: string;
  channel: NotificationChannel | string;
  title: string;
  body: string;
  deepLink: string | null;
  readAt: string | null;
  createdAt: string;
  meta: Record<string, unknown> | null;
};

export type NotificationPreference = {
  id: string;
  userId: string;
  category: string;
  channel: NotificationChannel | string;
  enabled: boolean;
};

export function categoryLabel(category: string): string {
  switch (category) {
    case "NEW_MESSAGE":
      return "New messages";
    case "NEW_OFFER":
      return "New offers";
    case "COUNTEROFFER":
      return "Counteroffers";
    case "OFFER_ACCEPTED":
      return "Offer accepted";
    case "OFFER_REJECTED":
      return "Offer rejected";
    case "ITEM_SOLD":
      return "Item sold";
    case "ITEM_SAVED":
      return "Item saved";
    case "PRICE_DROP":
      return "Price drops";
    case "SAVED_SEARCH_MATCH":
      return "Saved search matches";
    case "PAYMENT_RECEIVED":
      return "Payment received";
    case "PAYMENT_RELEASED":
      return "Payment released";
    case "DELIVERY_UPDATE":
      return "Delivery updates";
    case "VERIFICATION_UPDATE":
      return "Verification";
    case "DISPUTE_UPDATE":
      return "Disputes";
    default:
      return category.replace(/_/g, " ").toLowerCase();
  }
}

export function channelLabel(channel: string): string {
  switch (channel) {
    case "IN_APP":
      return "In-app";
    case "PUSH":
      return "Push";
    case "EMAIL":
      return "Email";
    default:
      return channel;
  }
}

/**
 * Map API deepLink (`reworth://orders/x`, `/orders/x`, absolute URL) to an
 * in-app path for Next.js navigation.
 */
export function deepLinkToPath(deepLink: string | null | undefined): string | null {
  if (!deepLink) return null;
  const raw = deepLink.trim();
  if (!raw) return null;

  let path = raw;
  if (raw.startsWith("reworth://")) {
    path = "/" + raw.slice("reworth://".length).replace(/^\/+/, "");
  } else if (/^https?:\/\//i.test(raw)) {
    try {
      path = new URL(raw).pathname;
    } catch {
      return null;
    }
  } else if (!raw.startsWith("/")) {
    path = `/${raw}`;
  }

  const known =
    /^\/(orders|disputes|chats|listings|notifications|account|checkout|search|my|sell|selling|settings)(\/|$)/;
  if (!known.test(path)) {
    // Still allow /orders/:id style even if not in list above
    if (!/^\/[a-z][\w-]*(\/[\w-]+)*\/?$/i.test(path)) return null;
  }
  return path;
}

export function unreadNotificationCount(
  token: string,
): Promise<{ count: number }> {
  return apiFetch<{ count: number }>("/notifications/unread-count", {
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
  return apiFetch<AppNotification[]>(
    `/notifications${qs ? `?${qs}` : ""}`,
    { token, cache: "no-store" },
  );
}

export function markNotificationRead(
  token: string,
  id: string,
): Promise<AppNotification> {
  return apiFetch<AppNotification>(`/notifications/${id}/read`, {
    method: "POST",
    token,
  });
}

export function markAllNotificationsRead(
  token: string,
): Promise<{ updated: number }> {
  return apiFetch<{ updated: number }>("/notifications/read-all", {
    method: "POST",
    token,
    cache: "no-store",
  });
}

export function clearNotifications(
  token: string,
): Promise<{ deleted: number }> {
  return apiFetch<{ deleted: number }>("/notifications", {
    method: "DELETE",
    token,
    cache: "no-store",
  });
}

export function getNotificationPreferences(
  token: string,
): Promise<NotificationPreference[]> {
  return apiFetch<NotificationPreference[]>("/notifications/preferences", {
    token,
  });
}

export function patchNotificationPreference(
  token: string,
  body: {
    category: NotificationCategory | string;
    channel: NotificationChannel;
    enabled: boolean;
  },
): Promise<NotificationPreference> {
  return apiFetch<NotificationPreference>("/notifications/preferences", {
    method: "PATCH",
    token,
    body,
  });
}

export function registerPushToken(
  token: string,
  body: { token: string; platform: string },
): Promise<unknown> {
  return apiFetch("/devices/push-token", {
    method: "POST",
    token,
    body,
  });
}
