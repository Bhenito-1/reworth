/**
 * Device push token registration + notification deep-link listeners.
 * Uses expo-notifications when available; otherwise registers a mock token in __DEV__.
 */

import { Platform } from "react-native";
import { apiFetch } from "./api";
import { parseDeepLink } from "./notifications";

export type PushRoute =
  | { kind: "order" | "dispute" | "chat" | "listing"; id: string }
  | { kind: "moving_sale"; id: string }
  | { kind: "community"; id: string }
  | { kind: "bundle"; id: string }
  | { kind: "storefront"; id: string }
  | { kind: "other" };

type NotificationSubscription = { remove: () => void };

function deepLinkFromPayload(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (typeof record.deepLink === "string") return record.deepLink;
  if (typeof record.url === "string") return record.url;
  return null;
}

export function routeFromPushData(data: unknown): PushRoute | null {
  const deepLink = deepLinkFromPayload(data);
  if (deepLink) {
    const parsed = parseDeepLink(deepLink);
    if (!parsed) return null;
    if (parsed.kind === "other") {
      // Extended paths not in the core chat/order parser
      const path = deepLink.replace(/^reworth:\/\//i, "/").replace(/^\/+/, "/");
      const moving = path.match(/^\/moving-sales\/([\w-]+)/i);
      if (moving) return { kind: "moving_sale", id: moving[1] };
      const community = path.match(/^\/communities\/([\w-]+)/i);
      if (community) return { kind: "community", id: community[1] };
      return { kind: "other" };
    }
    if (parsed.id) {
      return { kind: parsed.kind, id: parsed.id };
    }
  }
  return null;
}

/**
 * Register for permission + persist Expo push token on the API.
 */
export async function registerDevicePushToken(token: string): Promise<void> {
  let pushToken: string | null = null;
  let platform = Platform.OS;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require("expo-notifications") as {
      getPermissionsAsync: () => Promise<{ status: string }>;
      requestPermissionsAsync: () => Promise<{ status: string }>;
      getExpoPushTokenAsync: (opts?: {
        projectId?: string;
      }) => Promise<{ data: string }>;
      setNotificationHandler: (handler: {
        handleNotification: () => Promise<{
          shouldShowAlert: boolean;
          shouldPlaySound: boolean;
          shouldSetBadge: boolean;
        }>;
      }) => void;
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Constants = require("expo-constants") as {
      expoConfig?: { extra?: { eas?: { projectId?: string } } };
      easConfig?: { projectId?: string };
    };

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== "granted") {
      return;
    }

    const projectId =
      Constants.easConfig?.projectId ??
      Constants.expoConfig?.extra?.eas?.projectId;
    const result = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    pushToken = result.data;
  } catch {
    if (__DEV__) {
      pushToken = `ExponentPushToken[dev-mock-${Platform.OS}]`;
      platform = Platform.OS;
    }
  }

  if (!pushToken) return;

  await apiFetch("/devices/push-token", {
    method: "POST",
    token,
    body: { token: pushToken, platform },
  });
}

/**
 * Listen for notification taps (and cold-start last response).
 * Returns an unsubscribe function.
 */
export function setupPushListeners(
  onRoute: (route: PushRoute) => void,
): () => void {
  const subs: NotificationSubscription[] = [];

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require("expo-notifications") as {
      addNotificationResponseReceivedListener: (
        listener: (response: {
          notification: { request: { content: { data?: unknown } } };
        }) => void,
      ) => NotificationSubscription;
      getLastNotificationResponseAsync: () => Promise<{
        notification: { request: { content: { data?: unknown } } };
      } | null>;
    };

    subs.push(
      Notifications.addNotificationResponseReceivedListener((response) => {
        const route = routeFromPushData(
          response.notification.request.content.data,
        );
        if (route && route.kind !== "other") onRoute(route);
      }),
    );

    void Notifications.getLastNotificationResponseAsync().then((last) => {
      if (!last) return;
      const route = routeFromPushData(last.notification.request.content.data);
      if (route && route.kind !== "other") onRoute(route);
    });
  } catch {
    /* expo-notifications unavailable (web / incomplete install) */
  }

  return () => {
    for (const s of subs) s.remove();
  };
}
