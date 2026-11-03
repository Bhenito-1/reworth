import { apiFetch } from "./api";
import type { DeliveryShipmentStatus } from "./delivery";

export type DriverStop = {
  line?: string | null;
  area?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export type DriverAssignment = {
  orderId: string;
  shipmentId: string;
  status: DeliveryShipmentStatus;
  accepted?: boolean;
  providerRef: string | null;
  etaFrom: string | null;
  etaTo: string | null;
  distanceKm?: number | null;
  listingTitle: string | null;
  community: string | null;
  city: string | null;
  sellerName?: string | null;
  dropoffArea?: string | null;
  pickup?: DriverStop | null;
  dropoff?: DriverStop | null;
  sellerPhone?: string | null;
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

export const MILESTONE_LABEL: Record<string, string> = {
  PICKED_UP: "Collected",
  IN_TRANSIT: "On the way",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
};

export function milestoneButtonLabel(status: string): string {
  return MILESTONE_LABEL[status] ?? status.replace(/_/g, " ");
}

export async function acceptDriverRun(token: string, orderId: string) {
  return apiFetch<DriverMilestoneResult>(
    `/driver/shipments/${orderId}/accept`,
    { method: "POST", token },
  );
}

export async function declineDriverRun(token: string, orderId: string) {
  return apiFetch<DriverMilestoneResult>(
    `/driver/shipments/${orderId}/decline`,
    { method: "POST", token },
  );
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
