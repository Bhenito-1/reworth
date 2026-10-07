/**
 * Room scan (PRD §53) — photo → detect → drafts.
 */

import { apiFetch } from "./api";

export type RoomScanItem = {
  id: string;
  label: string;
  selected?: boolean;
  condition?: string;
};

export type RoomScan = {
  id: string;
  status: string;
  city?: string;
  items?: RoomScanItem[];
};

export type RoomScanDraft = {
  listingId: string;
  title?: string;
};

export async function createRoomScan(
  token: string,
  body: { photoKeys: string[]; city?: string },
): Promise<RoomScan> {
  return apiFetch("/room-scans", { method: "POST", token, body });
}

export async function getRoomScan(
  token: string,
  scanId: string,
): Promise<RoomScan> {
  return apiFetch(`/room-scans/${scanId}`, { token });
}

export async function startRoomScanDetect(
  token: string,
  scanId: string,
): Promise<RoomScan> {
  return apiFetch(`/room-scans/${scanId}/detect`, { method: "POST", token });
}

export async function createRoomScanDrafts(
  token: string,
  scanId: string,
): Promise<{ roomScan: RoomScan; drafts: RoomScanDraft[] }> {
  return apiFetch(`/room-scans/${scanId}/create-drafts`, {
    method: "POST",
    token,
  });
}

export async function patchRoomScanItems(
  token: string,
  scanId: string,
  items: Array<{ id: string; selected?: boolean; condition?: string }>,
): Promise<RoomScan> {
  return apiFetch(`/room-scans/${scanId}/items`, {
    method: "PATCH",
    token,
    body: { items },
  });
}

export async function pollRoomScanUntilReady(
  token: string,
  scanId: string,
  opts?: { intervalMs?: number; maxAttempts?: number },
): Promise<RoomScan> {
  const intervalMs = opts?.intervalMs ?? 1200;
  const maxAttempts = opts?.maxAttempts ?? 40;
  let last: RoomScan | null = null;
  for (let i = 0; i < maxAttempts; i++) {
    last = await getRoomScan(token, scanId);
    const status = last.status;
    if (
      status === "READY" ||
      status === "DRAFTS_CREATED" ||
      status === "FAILED" ||
      status === "CANCELLED"
    ) {
      return last;
    }
    await new Promise<void>((r) => setTimeout(r, intervalMs));
  }
  return last!;
}
