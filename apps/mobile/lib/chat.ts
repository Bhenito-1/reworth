/**
 * Phase 4 — Chat + Offers helpers (mobile).
 */

import { apiFetch } from "./api";

export type OfferStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REJECTED"
  | "COUNTERED"
  | "WITHDRAWN"
  | "EXPIRED";

  export type MessageType =
  | "TEXT"
  | "IMAGE"
  | "LISTING_CARD"
  | "OFFER_CARD"
  | "SWAP_PROPOSAL_CARD"
  | "SYSTEM";

export type ConversationListItem = {
  id: string;
  listingId: string;
  listingTitle: string;
  listingThumb: string | null;
  buyerId: string;
  sellerId: string;
  counterpart: { id: string; displayName: string };
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  muted?: boolean;
  activeOffer: {
    id: string;
    amountKobo: number;
    status: OfferStatus | string;
  } | null;
  createdAt: string;
};

export type Conversation = {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  lastMessageAt: string | null;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  type: MessageType | string;
  body: string | null;
  imageKey: string | null;
  offerId: string | null;
  listingCardId: string | null;
  clientMsgId: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  scamWarning: boolean;
  createdAt: string;
  sender?: { id: string; displayName: string };
};

export type OfferDto = {
  id: string;
  listingId: string;
  conversationId: string | null;
  buyerId: string;
  sellerId: string;
  amountKobo: number;
  note: string | null;
  status: OfferStatus | string;
  parentOfferId: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AcceptOfferResponse = {
  offer: OfferDto;
  orderIntent: {
    id: string;
    reservedUntil: string;
    amountKobo: number;
  };
};

export function conversationThumbUrl(thumb: string | null): string | null {
  if (!thumb) return null;
  if (/^https?:\/\//i.test(thumb)) return thumb;
  return null;
}

export function offerStatusLabel(status: string): string {
  switch (status) {
    case "PENDING":
      return "Pending";
    case "ACCEPTED":
      return "Accepted";
    case "REJECTED":
      return "Rejected";
    case "COUNTERED":
      return "Countered";
    case "WITHDRAWN":
      return "Withdrawn";
    case "EXPIRED":
      return "Expired";
    default:
      return status;
  }
}

export function listConversations(
  token: string,
): Promise<ConversationListItem[]> {
  return apiFetch<ConversationListItem[]>("/conversations", { token });
}

export function createConversation(
  token: string,
  listingId: string,
): Promise<Conversation> {
  return apiFetch<Conversation>("/conversations", {
    method: "POST",
    token,
    body: { listingId },
  });
}

export function listMessages(
  token: string,
  conversationId: string,
  opts?: { after?: string; limit?: number },
): Promise<ChatMessage[]> {
  const q = new URLSearchParams();
  if (opts?.after) q.set("after", opts.after);
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  const qs = q.toString();
  return apiFetch<ChatMessage[]>(
    `/conversations/${conversationId}/messages${qs ? `?${qs}` : ""}`,
    { token },
  );
}

export function postMessage(
  token: string,
  conversationId: string,
  body: {
    type: MessageType;
    body?: string;
    clientMsgId?: string;
  },
): Promise<ChatMessage> {
  return apiFetch<ChatMessage>(`/conversations/${conversationId}/messages`, {
    method: "POST",
    token,
    body,
  });
}

export function markConversationRead(
  token: string,
  conversationId: string,
  messageIds?: string[],
): Promise<unknown> {
  return apiFetch(`/conversations/${conversationId}/read`, {
    method: "POST",
    token,
    body: { messageIds },
  });
}

export function markConversationDelivered(
  token: string,
  conversationId: string,
  messageIds?: string[],
): Promise<unknown> {
  return apiFetch(`/conversations/${conversationId}/delivered`, {
    method: "POST",
    token,
    body: { messageIds },
  });
}

export function muteConversation(
  token: string,
  conversationId: string,
): Promise<unknown> {
  return apiFetch(`/conversations/${conversationId}/mute`, {
    method: "POST",
    token,
    body: {},
  });
}

export function unmuteConversation(
  token: string,
  conversationId: string,
): Promise<unknown> {
  return apiFetch(`/conversations/${conversationId}/mute`, {
    method: "DELETE",
    token,
  });
}

export function blockUser(token: string, userId: string): Promise<unknown> {
  return apiFetch(`/users/${userId}/block`, { method: "POST", token });
}

export function reportUser(
  token: string,
  userId: string,
  body: { reason: string; detail?: string; conversationId?: string },
): Promise<unknown> {
  return apiFetch(`/users/${userId}/report`, {
    method: "POST",
    token,
    body,
  });
}

export function createOffer(
  token: string,
  listingId: string,
  body: { amountKobo: number; note?: string; conversationId?: string },
): Promise<OfferDto> {
  return apiFetch<OfferDto>(`/listings/${listingId}/offers`, {
    method: "POST",
    token,
    body,
  });
}

export function listOffers(
  token: string,
  listingId: string,
): Promise<OfferDto[]> {
  return apiFetch<OfferDto[]>(`/listings/${listingId}/offers`, { token });
}

export function acceptOffer(
  token: string,
  offerId: string,
): Promise<AcceptOfferResponse> {
  return apiFetch<AcceptOfferResponse>(`/offers/${offerId}/accept`, {
    method: "POST",
    token,
  });
}

export function rejectOffer(token: string, offerId: string): Promise<OfferDto> {
  return apiFetch<OfferDto>(`/offers/${offerId}/reject`, {
    method: "POST",
    token,
  });
}

export function counterOffer(
  token: string,
  offerId: string,
  body: { amountKobo: number; note?: string },
): Promise<OfferDto> {
  return apiFetch<OfferDto>(`/offers/${offerId}/counter`, {
    method: "POST",
    token,
    body,
  });
}

export function withdrawOffer(
  token: string,
  offerId: string,
): Promise<OfferDto> {
  return apiFetch<OfferDto>(`/offers/${offerId}`, {
    method: "DELETE",
    token,
  });
}

export function clientMsgId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}
