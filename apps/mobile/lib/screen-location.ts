import { Platform } from "react-native";

/** Screens a browser refresh should restore. Home is the default when the query is empty. */
export type ScreenView =
  | "home"
  | "discover"
  | "sell"
  | "listings"
  | "chats"
  | "saved"
  | "orders"
  | "cart"
  | "updates"
  | "account";

export type ScreenLocation = {
  view: ScreenView;
  listingId?: string;
  chatId?: string;
  orderId?: string;
  search?: boolean;
  checkoutListingId?: string;
};

const VIEWS = new Set<string>([
  "home",
  "discover",
  "sell",
  "listings",
  "chats",
  "saved",
  "orders",
  "cart",
  "updates",
  "account",
]);

function canUseLocation(): boolean {
  return Platform.OS === "web" && typeof window !== "undefined";
}

export function readScreenLocation(): ScreenLocation | null {
  if (!canUseLocation()) return null;
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  if (!view || !VIEWS.has(view)) return null;
  return {
    view: view as ScreenView,
    listingId: params.get("listing") || undefined,
    chatId: params.get("chat") || undefined,
    orderId: params.get("order") || undefined,
    search: params.get("search") === "1" || undefined,
    checkoutListingId: params.get("checkout") || undefined,
  };
}

export function writeScreenLocation(loc: ScreenLocation): void {
  if (!canUseLocation()) return;
  const params = new URLSearchParams();
  const bareHome =
    loc.view === "home" &&
    !loc.listingId &&
    !loc.chatId &&
    !loc.orderId &&
    !loc.search &&
    !loc.checkoutListingId;
  if (!bareHome) params.set("view", loc.view);
  if (loc.listingId) params.set("listing", loc.listingId);
  if (loc.chatId) params.set("chat", loc.chatId);
  if (loc.orderId) params.set("order", loc.orderId);
  if (loc.search) params.set("search", "1");
  if (loc.checkoutListingId) params.set("checkout", loc.checkoutListingId);
  const path = window.location.pathname || "/";
  const qs = params.toString();
  const next = qs ? `${path}?${qs}` : path;
  const current = `${path}${window.location.search}`;
  if (current === next) return;
  window.history.replaceState(window.history.state, "", next);
}

export function clearScreenLocation(): void {
  if (!canUseLocation()) return;
  const path = window.location.pathname || "/";
  if (!window.location.search) return;
  window.history.replaceState(window.history.state, "", path);
}
