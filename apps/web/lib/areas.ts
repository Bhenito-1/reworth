import type { RegionArea } from "./region";

export type AreaChoice = {
  value: string;
  label: string;
};

/** Stored community strings already used by Lagos search and listings. */
const LAGOS_STORED: Record<string, AreaChoice> = {
  LEKKI_PH1: { value: "Lekki Ph1", label: "Lekki Ph1" },
  IKOYI: { value: "Ikoyi", label: "Ikoyi" },
  VI: { value: "VI", label: "VI" },
  ONIRU: { value: "Oniru", label: "Oniru" },
  VGC: { value: "VGC", label: "VGC" },
  CHEVRON: { value: "Chevron", label: "Chevron" },
  AJAH: { value: "Ajah", label: "Ajah" },
  OTHER_LAGOS: { value: "Other Lagos", label: "Other Lagos" },
};

export const FALLBACK_STATES = [{ key: "lagos", displayName: "Lagos" }] as const;

export const FALLBACK_AREAS: Record<string, { key: string; label: string }[]> = {
  lagos: [
    { key: "LEKKI_PH1", label: "Lekki Phase 1" },
    { key: "IKOYI", label: "Ikoyi" },
    { key: "VI", label: "Victoria Island" },
    { key: "ONIRU", label: "Oniru" },
    { key: "VGC", label: "VGC" },
    { key: "CHEVRON", label: "Chevron" },
    { key: "AJAH", label: "Ajah" },
    { key: "OTHER_LAGOS", label: "Other Lagos" },
  ],
};

/** Areas for a selected state. Lagos keeps the names buyers already search by. */
export function areaChoices(
  stateKey: string,
  areas: RegionArea[],
): AreaChoice[] {
  return areas.map((area) => {
    if (stateKey === "lagos" && LAGOS_STORED[area.key]) {
      return LAGOS_STORED[area.key];
    }
    const label = area.label?.trim() || area.key;
    return { value: label, label };
  });
}
