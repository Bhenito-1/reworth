/**
 * Phase 5 — Orders, payments & disputes API helpers.
 * Shapes match OrdersController + PaymentsController + DisputesController.
 */

import { apiFetch } from "./api";

/** Every swap charges ₦500 per person, separate from that person's delivery fee. */
export const SWAP_FEE_KOBO = 50_000;

export type FulfilmentMethod = "PICKUP" | "MEET_POINT" | "DELIVERY";

export type OrderStatus =
  | "CREATED"
  | "PAYMENT_PENDING"
  | "FUNDED"
  | "IN_AUTHENTICATION"
  | "SHIPPED"
  | "HANDED_OVER"
  | "DELIVERED"
  | "RECEIVED"
  | "COMPLETED"
  | "CANCELLED"
  | "DISPUTE_HOLD"
  | "REFUND_REQUESTED"
  | "REFUND_ISSUED";

export type DisputeReason =
  | "NEVER_RECEIVED"
  | "MATERIALLY_DIFFERENT"
  | "COUNTERFEIT"
  | "UNDISCLOSED_DAMAGE"
  | "INCORRECT_PRODUCT";

export type DisputeStatus =
  | "OPENED"
  | "AWAITING_SELLER"
  | "AWAITING_ADMIN"
  | "RESOLVED";

export type DisputeResolution =
  | "FULL_REFUND"
  | "PARTIAL_REFUND"
  | "RELEASE_TO_SELLER"
  | "CANCEL";

export type AddressDisclosureDto = {
  id: string;
  createdAt: string;
  addressSnapshot: string;
};

export type MeetPointSummary = {
  id: string;
  community: string;
  name: string;
  landmark: string;
  lat: number;
  lng: number;
};

export type OrderDto = {
  id: string;
  listingId: string;
  listingTitle?: string | null;
  buyerId: string;
  sellerId: string;
  offerId: string | null;
  orderIntentId: string | null;
  amountKobo: number;
  protectionFeeKobo: number;
  deliveryFeeKobo: number;
  swapFeeKobo?: number;
  totalKobo: number;
  quantity?: number;
  unitPriceKobo?: number;
  fulfilmentMethod: FulfilmentMethod | string;
  status: OrderStatus | string;
  confirmationStatus?: "PENDING" | "CONFIRMED" | "REJECTED" | string;
  rejectionReason?: string | null;
  sellerNote?: string | null;
  deliveryDate?: string | null;
  swapProposalId?: string | null;
  swapListingAId?: string | null;
  swapListingBId?: string | null;
  transactionType?: string;
  swap?: {
    deliveryOn: string | null;
    youReceive: { id: string; title: string; imageUrl: string | null };
    youSend: { id: string; title: string; imageUrl: string | null };
    cancellable?: boolean;
    payableOrderId?: string | null;
  } | null;
  buyerProtection: boolean;
  coverageEndsAt: string | null;
  autoReleaseAt: string | null;
  fundedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  meetPointId?: string | null;
  meetPoint?: MeetPointSummary | null;
  addressDisclosure?: AddressDisclosureDto | null;
};

export type OrderEvent = {
  id: string;
  orderId: string;
  type: string;
  actorUserId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
};

export type OrderDetail = OrderDto & { events: OrderEvent[] };

export type PaymentDto = {
  id: string;
  orderId: string;
  provider: string;
  reference: string;
  amountKobo: number;
  status: string;
  checkoutUrl?: string;
  createdAt: string;
  updatedAt: string;
};

export type DisputeEvidence = {
  id: string;
  disputeId: string;
  uploaderId: string;
  text: string | null;
  imageKey: string | null;
  createdAt: string;
};

export type DisputeLinkedInspection = {
  id: string;
  status?: string;
  completedAt?: string | null;
  conditionScore?: number | null;
  listingId?: string;
};

export type DisputeDto = {
  id: string;
  orderId: string;
  openerId: string;
  reason: DisputeReason | string;
  status: DisputeStatus | string;
  detail: string | null;
  sellerResponse: string | null;
  sellerRespondBy: string | null;
  resolution: DisputeResolution | string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  evidence?: DisputeEvidence[];
  order?: OrderDto;
  /** Phase 2.4 — linked vehicle inspection when present. */
  inspection?: DisputeLinkedInspection | null;
  linkedInspection?: DisputeLinkedInspection | null;
};

/** Client-side preview matching API order-fees (2.5%, cap ₦5,000). */
export function computeProtectionFeeKobo(
  amountKobo: number,
  pct = 0.025,
  capKobo = 500_000,
): number {
  if (amountKobo < 0) return 0;
  return Math.min(Math.ceil(amountKobo * pct), capKobo);
}

export function computeOrderTotalKobo(input: {
  amountKobo: number;
  protectionFeeKobo: number;
  deliveryFeeKobo?: number;
}): number {
  return (
    input.amountKobo +
    input.protectionFeeKobo +
    (input.deliveryFeeKobo ?? 0)
  );
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

const DELIVERED_STATUSES = new Set(["DELIVERED", "RECEIVED", "COMPLETED"]);

export function isCancelledOrder(order: {
  status: string;
  confirmationStatus?: string | null;
}): boolean {
  return order.status === "CANCELLED" || order.confirmationStatus === "REJECTED";
}

export function isDeliveredOrder(order: { status: string }): boolean {
  return DELIVERED_STATUSES.has(order.status);
}

function orderTime(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** Ongoing orders first, then delivered orders with the newest date first. */
export function sortMyOrders<
  T extends {
    status: string;
    createdAt: string;
    updatedAt: string;
    completedAt?: string | null;
  },
>(orders: T[]): T[] {
  const ongoing = orders.filter((order) => !isDeliveredOrder(order));
  const delivered = orders.filter((order) => isDeliveredOrder(order));
  ongoing.sort((a, b) => orderTime(b.createdAt) - orderTime(a.createdAt));
  delivered.sort(
    (a, b) =>
      orderTime(b.completedAt || b.updatedAt || b.createdAt) -
      orderTime(a.completedAt || a.updatedAt || a.createdAt),
  );
  return [...ongoing, ...delivered];
}

/** First word capital, remaining words lower. `PAYMENT_PENDING` → `Payment pending`. */
export function sentenceCaseLabel(value: string): string {
  const words = value.trim().replace(/_/g, " ").toLowerCase();
  if (!words) return "";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function orderStatusLabel(status: string): string {
  switch (status) {
    case "CREATED":
      return "Order placed";
    case "PAYMENT_PENDING":
      return "Awaiting payment";
    case "FUNDED":
      return "Paid — held in escrow";
    case "IN_AUTHENTICATION":
      return "In authentication";
    case "SHIPPED":
      return "Out for delivery";
    case "HANDED_OVER":
      return "Handed over";
    case "DELIVERED":
      return "Delivered";
    case "RECEIVED":
      return "Receipt confirmed";
    case "COMPLETED":
      return "Completed — funds released";
    case "CANCELLED":
      return "Cancelled";
    case "DISPUTE_HOLD":
      return "On hold — dispute";
    case "REFUND_REQUESTED":
      return "Refund requested";
    case "REFUND_ISSUED":
      return "Refund issued";
    default:
      return sentenceCaseLabel(status);
  }
}

export function fulfilmentLabel(method: string): string {
  switch (method) {
    case "PICKUP":
      return "Pickup";
    case "MEET_POINT":
      return "Meet point";
    case "DELIVERY":
      return "Delivery";
    default:
      return sentenceCaseLabel(method);
  }
}

export function disputeReasonLabel(reason: string): string {
  switch (reason) {
    case "NEVER_RECEIVED":
      return "Never received";
    case "MATERIALLY_DIFFERENT":
      return "Materially different";
    case "COUNTERFEIT":
      return "Counterfeit";
    case "UNDISCLOSED_DAMAGE":
      return "Undisclosed damage";
    case "INCORRECT_PRODUCT":
      return "Incorrect product";
    default:
      return sentenceCaseLabel(reason);
  }
}

export function disputeStatusLabel(status: string): string {
  switch (status) {
    case "OPENED":
      return "Opened";
    case "AWAITING_SELLER":
      return "Awaiting seller";
    case "AWAITING_ADMIN":
      return "Awaiting admin";
    case "RESOLVED":
      return "Resolved";
    default:
      return sentenceCaseLabel(status);
  }
}

export function paymentStatusFromOrder(order: OrderDto): string {
  switch (order.status) {
    case "PAYMENT_PENDING":
    case "CREATED":
      return "Awaiting payment";
    case "FUNDED":
    case "IN_AUTHENTICATION":
    case "SHIPPED":
    case "HANDED_OVER":
    case "DELIVERED":
    case "RECEIVED":
    case "COMPLETED":
      return "Paid";
    case "CANCELLED":
      return "Cancelled";
    case "DISPUTE_HOLD":
      return "On hold";
    case "REFUND_REQUESTED":
      return "Refund requested";
    case "REFUND_ISSUED":
      return "Refunded";
    default:
      return order.fundedAt ? "Paid" : "Unknown";
  }
}

export function refundStatusFromOrder(order: OrderDto): string {
  if (order.status === "REFUND_ISSUED") return "Issued";
  if (order.status === "REFUND_REQUESTED") return "Requested";
  if (order.status === "DISPUTE_HOLD") return "On hold (dispute)";
  return "None";
}

export function disputeIdFromEvents(events: OrderEvent[]): string | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const ev = events[i];
    if (ev.type !== "DISPUTE_OPENED" || !ev.payload) continue;
    const id = ev.payload.disputeId;
    if (typeof id === "string") return id;
  }
  return null;
}

export function isMockPsp(payment: PaymentDto): boolean {
  return (
    payment.provider === "mock-psp" ||
    Boolean(payment.checkoutUrl?.includes("mock-psp"))
  );
}

export function createOrder(
  token: string,
  body: {
    listingId: string;
    fulfilmentMethod: FulfilmentMethod;
    offerId?: string;
    orderIntentId?: string;
    buyNow?: boolean;
    quantity?: number;
    meetPointId?: string;
    toLat?: number;
    toLng?: number;
  },
): Promise<OrderDto> {
  return apiFetch<OrderDto>("/orders", { method: "POST", token, body });
}

export function listOrders(token: string): Promise<OrderDto[]> {
  return apiFetch<OrderDto[]>("/orders", { token });
}

export function getOrder(token: string, orderId: string): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/orders/${orderId}`, { token });
}

export function markHandedOver(
  token: string,
  orderId: string,
): Promise<OrderDto> {
  return apiFetch<OrderDto>(`/orders/${orderId}/handed-over`, {
    method: "POST",
    token,
  });
}

export function confirmReceipt(
  token: string,
  orderId: string,
): Promise<OrderDto> {
  return apiFetch<OrderDto>(`/orders/${orderId}/confirm-receipt`, {
    method: "POST",
    token,
  });
}

export function cancelOrder(token: string, orderId: string): Promise<OrderDto> {
  return apiFetch<OrderDto>(`/orders/${orderId}/cancel`, {
    method: "POST",
    token,
  });
}

export function confirmOrder(
  token: string,
  orderId: string,
  body: { deliveryDate: string; sellerNote?: string },
): Promise<OrderDto> {
  return apiFetch<OrderDto>(`/orders/${orderId}/confirm`, {
    method: "POST",
    token,
    body,
  });
}

export function rejectOrder(
  token: string,
  orderId: string,
  reason: string,
): Promise<OrderDto> {
  return apiFetch<OrderDto>(`/orders/${orderId}/reject`, {
    method: "POST",
    token,
    body: { reason },
  });
}

export function initiatePayment(
  token: string,
  body: { orderId: string; idempotencyKey: string },
): Promise<PaymentDto> {
  return apiFetch<PaymentDto>("/payments/initiate", {
    method: "POST",
    token,
    body,
  });
}

export function getPayment(token: string, paymentId: string): Promise<PaymentDto> {
  return apiFetch<PaymentDto>(`/payments/${paymentId}`, { token });
}

/** Mock PSP only — no auth required by API. */
export function simulateMockPspCharge(body: {
  reference: string;
  event?: string;
}): Promise<unknown> {
  return apiFetch("/webhooks/mock-psp", {
    method: "POST",
    body: { reference: body.reference, event: body.event ?? "charge.success" },
  });
}

export function openDispute(
  token: string,
  orderId: string,
  body: { reason: DisputeReason; detail?: string },
): Promise<DisputeDto> {
  return apiFetch<DisputeDto>(`/orders/${orderId}/disputes`, {
    method: "POST",
    token,
    body,
  });
}

export function getDispute(token: string, disputeId: string): Promise<DisputeDto> {
  return apiFetch<DisputeDto>(`/disputes/${disputeId}`, { token });
}

export function addDisputeEvidence(
  token: string,
  disputeId: string,
  body: { text?: string; imageKey?: string },
): Promise<DisputeEvidence> {
  return apiFetch<DisputeEvidence>(`/disputes/${disputeId}/evidence`, {
    method: "POST",
    token,
    body,
  });
}

export function sellerRespondDispute(
  token: string,
  disputeId: string,
  body: { text: string },
): Promise<DisputeDto> {
  return apiFetch<DisputeDto>(`/disputes/${disputeId}/response`, {
    method: "POST",
    token,
    body,
  });
}

export const DISPUTE_REASONS: { value: DisputeReason; label: string }[] = [
  { value: "NEVER_RECEIVED", label: "Never received" },
  { value: "MATERIALLY_DIFFERENT", label: "Materially different" },
  { value: "COUNTERFEIT", label: "Counterfeit" },
  { value: "UNDISCLOSED_DAMAGE", label: "Undisclosed damage" },
  { value: "INCORRECT_PRODUCT", label: "Incorrect product" },
];
