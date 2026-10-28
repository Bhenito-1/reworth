/**
 * City-scoped community chips. Prefer communitiesForCity(city).
 */

export const LAGOS_COMMUNITIES = [
  "Lekki Ph1",
  "Ikoyi",
  "VI",
  "Oniru",
  "VGC",
  "Chevron",
  "Ajah",
  "Other Lagos",
] as const;

export const ABUJA_COMMUNITIES = [
  "Maitama",
  "Asokoro",
  "Wuse",
  "Garki",
  "Jabi",
  "Guzape",
  "Other Abuja",
] as const;

export const IBADAN_COMMUNITIES = [
  "Bodija",
  "UI",
  "Ring Road",
  "Iwo Road",
  "Challenge",
  "Other Ibadan",
] as const;

export const PORT_HARCOURT_COMMUNITIES = [
  "GRA Port Harcourt",
  "Old GRA",
  "Rumuola",
  "Ada George",
  "Trans Amadi",
  "Other PH",
] as const;

export const OGUN_COMMUNITIES = [
  "Abeokuta",
  "Sango-Ota",
  "Ifo",
  "Sagamu",
  "Ijebu-Ode",
  "Other Ogun",
] as const;

export const OSUN_COMMUNITIES = [
  "Osogbo",
  "Ile-Ife",
  "Iwo",
  "Ede",
  "Ikire",
  "Other Osun",
] as const;

export const ONDO_COMMUNITIES = [
  "Akure",
  "Ondo Town",
  "Ore",
  "Owo",
  "Okitipupa",
  "Other Ondo",
] as const;

export const EKITI_COMMUNITIES = [
  "Ado-Ekiti",
  "Ikere-Ekiti",
  "Ikole",
  "Iye",
  "Omuo",
  "Other Ekiti",
] as const;

export const EDO_COMMUNITIES = [
  "Benin City",
  "GRA Benin",
  "Ugbowo",
  "Sakponba",
  "Auchi",
  "Other Edo",
] as const;

export const KANO_COMMUNITIES = [
  "Nassarawa",
  "Fagge",
  "Gwale",
  "Tarauni",
  "Dala",
  "Other Kano",
] as const;

/** Union of all pilot communities (onboarding / legacy selects). */
export const COMMUNITIES = [
  ...LAGOS_COMMUNITIES,
  ...OGUN_COMMUNITIES,
  ...IBADAN_COMMUNITIES,
  ...OSUN_COMMUNITIES,
  ...ONDO_COMMUNITIES,
  ...EKITI_COMMUNITIES,
  ...EDO_COMMUNITIES,
  ...ABUJA_COMMUNITIES,
  ...PORT_HARCOURT_COMMUNITIES,
  ...KANO_COMMUNITIES,
] as const;

export type Community = (typeof COMMUNITIES)[number];

const DISPLAY_NAMES: Record<string, string> = {
  lagos: "Lagos",
  ogun: "Ogun",
  ibadan: "Ibadan",
  oyo: "Ibadan",
  osun: "Osun",
  ondo: "Ondo",
  ekiti: "Ekiti",
  edo: "Edo",
  abuja: "Abuja",
  "port-harcourt": "Port Harcourt",
  ph: "Port Harcourt",
  kano: "Kano",
};

export function normalizeCityKey(city?: string | null): string {
  if (!city) return "lagos";
  const key = city
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/_/g, "-");
  if (key === "oyo") return "ibadan";
  if (key === "ph" || key === "portharcourt") return "port-harcourt";
  return key;
}

export function cityDisplayName(cityKey?: string | null): string {
  const key = normalizeCityKey(cityKey);
  if (DISPLAY_NAMES[key]) return DISPLAY_NAMES[key];
  if (!cityKey) return "Lagos";
  return cityKey.charAt(0).toUpperCase() + cityKey.slice(1);
}

/** Human community labels for a region key or display name. */
export function communitiesForCity(city?: string | null): readonly string[] {
  const key = normalizeCityKey(city);
  switch (key) {
    case "abuja":
      return ABUJA_COMMUNITIES;
    case "ibadan":
      return IBADAN_COMMUNITIES;
    case "port-harcourt":
      return PORT_HARCOURT_COMMUNITIES;
    case "ogun":
      return OGUN_COMMUNITIES;
    case "osun":
      return OSUN_COMMUNITIES;
    case "ondo":
      return ONDO_COMMUNITIES;
    case "ekiti":
      return EKITI_COMMUNITIES;
    case "edo":
      return EDO_COMMUNITIES;
    case "kano":
      return KANO_COMMUNITIES;
    default:
      return LAGOS_COMMUNITIES;
  }
}
