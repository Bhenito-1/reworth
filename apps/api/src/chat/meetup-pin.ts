/**
 * ADR-011 Phase C — private meetup pin protocol (chat SYSTEM body).
 * Visible only to conversation participants; never on public browse.
 */

export const MEETUP_PIN_KIND = 'MEETUP_PIN' as const;

export type MeetupPinPayload = {
  v: 1;
  kind: typeof MEETUP_PIN_KIND;
  lat: number;
  lng: number;
  label: string;
};

export function encodeMeetupPin(input: {
  lat: number;
  lng: number;
  label?: string;
}): string {
  const payload: MeetupPinPayload = {
    v: 1,
    kind: MEETUP_PIN_KIND,
    lat: input.lat,
    lng: input.lng,
    label: (input.label?.trim() || 'Meetup point').slice(0, 80),
  };
  return JSON.stringify(payload);
}

export function parseMeetupPin(body: string | null | undefined): MeetupPinPayload | null {
  if (!body?.trim().startsWith('{')) return null;
  try {
    const raw = JSON.parse(body) as Partial<MeetupPinPayload>;
    if (raw?.kind !== MEETUP_PIN_KIND || raw.v !== 1) return null;
    if (
      typeof raw.lat !== 'number' ||
      typeof raw.lng !== 'number' ||
      !Number.isFinite(raw.lat) ||
      !Number.isFinite(raw.lng) ||
      raw.lat < -90 ||
      raw.lat > 90 ||
      raw.lng < -180 ||
      raw.lng > 180
    ) {
      return null;
    }
    return {
      v: 1,
      kind: MEETUP_PIN_KIND,
      lat: raw.lat,
      lng: raw.lng,
      label:
        typeof raw.label === 'string' && raw.label.trim()
          ? raw.label.trim().slice(0, 80)
          : 'Meetup point',
    };
  } catch {
    return null;
  }
}

export function meetupPinPreview(body: string | null | undefined): string | null {
  const pin = parseMeetupPin(body);
  if (!pin) return null;
  return `Meetup pin · ${pin.label}`;
}
