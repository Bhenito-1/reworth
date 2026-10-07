/**
 * Escrow order lifecycle — human stages for buyer/seller/admin.
 * Maps OrderStatus (+ optional delivery shipment) to a linear journey:
 * placed → payment confirmed → shipped → delivered → buyer confirmed → completed (funds released).
 */

export type OrderLifecycleStageId =
  | "placed"
  | "payment_confirmed"
  | "shipped"
  | "delivered"
  | "buyer_confirmed"
  | "completed"
  | "cancelled"
  | "dispute"
  | "refund";

export type OrderLifecycleStage = {
  id: OrderLifecycleStageId;
  label: string;
  description: string;
  /** reached | current | upcoming | skipped */
  state: "reached" | "current" | "upcoming" | "skipped";
};

export type EscrowSnapshot = {
  held: boolean;
  released: boolean;
  refunded: boolean;
  label: string;
  paymentStatus: string | null;
  payoutStatus: string | null;
};

const HAPPY_PATH: OrderLifecycleStageId[] = [
  "placed",
  "payment_confirmed",
  "shipped",
  "delivered",
  "buyer_confirmed",
  "completed",
];

export function orderStatusLabel(status: string): string {
  switch (status) {
    case "CREATED":
      return "Order placed";
    case "PAYMENT_PENDING":
      return "Awaiting payment";
    case "FUNDED":
      return "Payment confirmed (in escrow)";
    case "IN_AUTHENTICATION":
      return "In authentication";
    case "SHIPPED":
      return "Shipped / out for delivery";
    case "HANDED_OVER":
      return "Handed over";
    case "DELIVERED":
      return "Delivered — confirm receipt";
    case "RECEIVED":
      return "Buyer confirmed receipt";
    case "COMPLETED":
      return "Completed — funds released";
    case "CANCELLED":
      return "Cancelled";
    case "DISPUTE_HOLD":
      return "Dispute hold";
    case "REFUND_REQUESTED":
      return "Refund requested";
    case "REFUND_ISSUED":
      return "Refund issued";
    default:
      return status;
  }
}

/** Map raw order status → primary lifecycle stage id. */
export function stageIdFromOrderStatus(status: string): OrderLifecycleStageId {
  switch (status) {
    case "CREATED":
    case "PAYMENT_PENDING":
      return "placed";
    case "FUNDED":
    case "IN_AUTHENTICATION":
      return "payment_confirmed";
    case "SHIPPED":
    case "HANDED_OVER":
      return "shipped";
    case "DELIVERED":
      return "delivered";
    case "RECEIVED":
      return "buyer_confirmed";
    case "COMPLETED":
      return "completed";
    case "CANCELLED":
      return "cancelled";
    case "DISPUTE_HOLD":
      return "dispute";
    case "REFUND_REQUESTED":
    case "REFUND_ISSUED":
      return "refund";
    default:
      return "placed";
  }
}

export function buildOrderLifecycle(input: {
  status: string;
  fulfilmentMethod?: string | null;
  deliveryStatus?: string | null;
}): OrderLifecycleStage[] {
  const current = stageIdFromOrderStatus(input.status);
  const terminal =
    current === "cancelled" ||
    current === "dispute" ||
    current === "refund";

  if (terminal) {
    return [
      {
        id: current,
        label: orderStatusLabel(input.status),
        description: describeStage(current, input.fulfilmentMethod),
        state: "current",
      },
    ];
  }

  // Delivery shipment can advance "shipped" display while order still FUNDED
  let effective = current;
  if (
    effective === "payment_confirmed" &&
    input.deliveryStatus &&
    ["PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(
      input.deliveryStatus,
    )
  ) {
    effective = "shipped";
  }
  if (
    (effective === "payment_confirmed" || effective === "shipped") &&
    input.deliveryStatus === "DELIVERED" &&
    input.status !== "RECEIVED" &&
    input.status !== "COMPLETED"
  ) {
    effective = "delivered";
  }

  const idx = HAPPY_PATH.indexOf(effective);

  return HAPPY_PATH.map((id, i) => {
    let state: OrderLifecycleStage["state"] = "upcoming";
    if (i < idx) state = "reached";
    else if (i === idx) state = "current";
    return {
      id,
      label: stageLabel(id),
      description: describeStage(id, input.fulfilmentMethod),
      state,
    };
  });
}

export function buildEscrowSnapshot(input: {
  orderStatus: string;
  paymentStatus?: string | null;
  payoutStatus?: string | null;
}): EscrowSnapshot {
  const pay = input.paymentStatus ?? null;
  const payout = input.payoutStatus ?? null;
  const released =
    pay === "RELEASED" ||
    input.orderStatus === "COMPLETED" ||
    Boolean(payout);
  const refunded =
    pay === "REFUNDED" ||
    pay === "PARTIALLY_REFUNDED" ||
    input.orderStatus === "REFUND_ISSUED";
  const held =
    !released &&
    !refunded &&
    (pay === "SUCCESS" ||
      ["FUNDED", "IN_AUTHENTICATION", "SHIPPED", "HANDED_OVER", "DELIVERED", "RECEIVED", "DISPUTE_HOLD"].includes(
        input.orderStatus,
      ));

  let label = "No payment yet";
  if (refunded) label = "Refunded to buyer";
  else if (released) label = "Released to seller";
  else if (held) label = "Held in escrow";
  else if (pay === "PENDING") label = "Payment pending";
  else if (pay === "FAILED") label = "Payment failed";

  return {
    held,
    released,
    refunded,
    label,
    paymentStatus: pay,
    payoutStatus: payout,
  };
}

function stageLabel(id: OrderLifecycleStageId): string {
  switch (id) {
    case "placed":
      return "Order placed";
    case "payment_confirmed":
      return "Payment confirmed";
    case "shipped":
      return "Shipped / out for delivery";
    case "delivered":
      return "Delivered";
    case "buyer_confirmed":
      return "Buyer confirmed receipt";
    case "completed":
      return "Completed — funds released";
    case "cancelled":
      return "Cancelled";
    case "dispute":
      return "Dispute hold";
    case "refund":
      return "Refund";
    default:
      return id;
  }
}

function describeStage(
  id: OrderLifecycleStageId,
  fulfilmentMethod?: string | null,
): string {
  switch (id) {
    case "placed":
      return "Buyer created the order.";
    case "payment_confirmed":
      return "Buyer paid; funds held in escrow until confirmation.";
    case "shipped":
      return fulfilmentMethod === "DELIVERY"
        ? "Item is with the courier / out for delivery."
        : "Seller handed over or dispatched the item.";
    case "delivered":
      return "Marked delivered — waiting for the buyer to confirm receipt.";
    case "buyer_confirmed":
      return "Buyer confirmed they received the item.";
    case "completed":
      return "Escrow released to the seller; order complete.";
    case "cancelled":
      return "Order was cancelled before completion.";
    case "dispute":
      return "Funds held while a dispute is resolved.";
    case "refund":
      return "Payment refunded (full or partial).";
    default:
      return "";
  }
}
