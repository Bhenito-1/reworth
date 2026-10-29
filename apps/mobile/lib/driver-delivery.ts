import { apiFetch } from "./api";
import type { DeliveryShipmentStatus } from "./delivery";

export type DriverAssignment = {
  orderId: string;
  shipmentId: string;
  status: DeliveryShipmentStatus;
  providerRef: string | null;
  etaFrom: string | null;
  etaTo: string | null;
  listingTitle: string | null;
  community: string | null;
  city: string | null;
  orderStatus: string;
};

export type DriverMilestoneResult = {
  accepted: boolean;
  reason?: string;
  currentStatus?: string;
  orderId: string;
  shipmentId?: string;
  status?: string;
  duplicate?: boolean;
};

const NEXT: Partial<Record<DeliveryShipmentStatus, DeliveryShipmentStatus>> = {
  ASSIGNED: "PICKED_UP",
  PICKED_UP: "IN_TRANSIT",
  IN_TRANSIT: "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "DELIVERED",
};

export function nextMilestone(
  status: DeliveryShipmentStatus,
): DeliveryShipmentStatus | null {
  return NEXT[status] ?? null;
}

export async function listDriverAssignments(
  token: string,
): Promise<DriverAssignment[]> {
  return apiFetch<DriverAssignment[]>("/driver/assignments", { token });
}

export async function submitDriverMilestone(
  token: string,
  orderId: string,
  body: {
    status: DeliveryShipmentStatus;
    failureReason?: string;
    occurredAt?: string;
    note?: string;
  },
  idempotencyKey: string,
): Promise<DriverMilestoneResult> {
  return apiFetch<DriverMilestoneResult>(
    `/driver/shipments/${orderId}/milestones`,
    {
      method: "POST",
      token,
      body,
      headers: { "Idempotency-Key": idempotencyKey },
    },
  );
}

export function newIdempotencyKey(orderId: string, status: string): string {
  return `drv-${orderId.slice(0, 8)}-${status}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
