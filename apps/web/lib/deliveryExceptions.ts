/**
 * Delivery journey D4 — exception copy & dispute eligibility.
 */

import type { DisputeReason } from "./orders";
import type { DeliveryShipment } from "./delivery";

export type DeliveryExceptionKind =
  | "failed"
  | "seller_delay"
  | "buyer_unreachable"
  | "item_issue"
  | "corridor_unavailable";

export type DeliveryExceptionCopy = {
  kind: DeliveryExceptionKind;
  title: string;
  body: string;
  buyerActions: string[];
  sellerActions: string[];
  suggestedDisputeReason: DisputeReason | null;
};

export const DELIVERY_DISPUTE_HINTS: {
  value: DisputeReason;
  label: string;
  hint: string;
}[] = [
  {
    value: "NEVER_RECEIVED",
    label: "Never received / no-show",
    hint: "Rider or seller did not complete handover.",
  },
  {
    value: "MATERIALLY_DIFFERENT",
    label: "Not as described",
    hint: "Item does not match the listing.",
  },
  {
    value: "UNDISCLOSED_DAMAGE",
    label: "Arrived damaged",
    hint: "Damage that was not disclosed before pay.",
  },
  {
    value: "INCORRECT_PRODUCT",
    label: "Wrong item",
    hint: "Different product than ordered.",
  },
  {
    value: "COUNTERFEIT",
    label: "Counterfeit concern",
    hint: "Authenticity looks wrong.",
  },
];

export function classifyDeliveryException(
  shipment: DeliveryShipment | null | undefined,
  orderStatus?: string | null,
): DeliveryExceptionCopy | null {
  if (!shipment) return null;

  if (shipment.status === "FAILED") {
    const reason = shipment.failureReason?.toLowerCase() ?? "";
    if (/unreachable|no.?answer|buyer|not home|attempt/.test(reason)) {
      return {
        kind: "buyer_unreachable",
        title: "Couldn’t complete delivery",
        body:
          shipment.failureReason?.trim() ||
          "The rider could not reach you. ReWorth can reattempt (usually 1–2 tries) or you can arrange a safe meetup.",
        buyerActions: [
          "Stay available for a reattempt window",
          "Or switch to a safe meetup with the seller",
          "Open a dispute if money should stay protected",
        ],
        sellerActions: [
          "Wait for reattempt or meetup confirmation",
          "Do not release the item outside ReWorth",
        ],
        suggestedDisputeReason: "NEVER_RECEIVED",
      };
    }
    if (/seller|pickup|not ready|no.?show|collect/.test(reason)) {
      return {
        kind: "seller_delay",
        title: "Collection from seller failed",
        body:
          shipment.failureReason?.trim() ||
          "The rider could not collect the item. The seller needs to confirm ready, or you can switch to meetup / cancel with refund path.",
        buyerActions: [
          "Wait while we nudge the seller",
          "Ask to switch to a safe meetup",
          "Cancel / dispute if the wait is too long",
        ],
        sellerActions: [
          "Mark the item ready and accessible",
          "Reply with a new pickup window",
        ],
        suggestedDisputeReason: "NEVER_RECEIVED",
      };
    }
    if (/corridor|area|unavailable|out of range/.test(reason)) {
      return {
        kind: "corridor_unavailable",
        title: "Delivery not available for this corridor",
        body:
          shipment.failureReason?.trim() ||
          "Platform delivery isn’t available for this route right now. A safe meetup is usually the fastest fix.",
        buyerActions: [
          "Switch to a safe meetup",
          "Or cancel for a refund path",
        ],
        sellerActions: ["Offer a meet point near your community"],
        suggestedDisputeReason: null,
      };
    }
    return {
      kind: "failed",
      title: "Delivery needs attention",
      body:
        shipment.failureReason?.trim() ||
        "Something went wrong with delivery. Your payment stays protected until this is resolved.",
      buyerActions: [
        "Open a dispute if the item or money is at risk",
        "Keep chat on ReWorth for a clear record",
      ],
      sellerActions: [
        "Respond quickly with facts and photos",
        "Do not settle off-platform",
      ],
      suggestedDisputeReason: "NEVER_RECEIVED",
    };
  }

  if (
    shipment.status === "DELIVERED" &&
    orderStatus &&
    ["DELIVERED", "HANDED_OVER", "SHIPPED"].includes(orderStatus)
  ) {
    return {
      kind: "item_issue",
      title: "Check the item, then confirm",
      body: "If anything looks wrong — damage, wrong item, or not as described — open a dispute before you confirm. Confirming releases payment.",
      buyerActions: [
        "Confirm receipt if it looks right",
        "Or open a dispute with photos",
      ],
      sellerActions: ["Wait for the buyer to confirm or raise an issue"],
      suggestedDisputeReason: "MATERIALLY_DIFFERENT",
    };
  }

  return null;
}

export function canOpenDeliveryDispute(input: {
  isBuyer: boolean;
  hasOpenDispute: boolean;
  orderStatus: string;
  shipmentStatus?: string | null;
}): boolean {
  if (!input.isBuyer || input.hasOpenDispute) return false;
  if (input.shipmentStatus === "FAILED") return true;
  if (
    ["DELIVERED", "HANDED_OVER", "SHIPPED", "RECEIVED", "COMPLETED"].includes(
      input.orderStatus,
    )
  ) {
    return true;
  }
  if (
    ["FUNDED", "IN_AUTHENTICATION"].includes(input.orderStatus) &&
    input.shipmentStatus &&
    ["ASSIGNED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(
      input.shipmentStatus,
    )
  ) {
    return true;
  }
  return false;
}
