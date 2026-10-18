/**
 * Config-driven cities (GET /regions). Consumer list = SW + Abuja + PH pilot.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch } from "./api";

const PREFERRED_CITY_KEY = "reworth_preferred_city";

export type RegionCity = {
  city: string;
  key: string;
  displayName: string;
  status?: "pilot" | "supply" | "disabled" | string;
  timezone?: string;
  communities?: string[];
};

export type RegionArea = {
  key: string;
  label: string;
};

export type RegionDetail = RegionCity & {
  areas?: RegionArea[];
  logistics?: {
    baseFeeKobo?: number;
    perKmKobo?: number;
  };
  pspEnabled?: boolean;
};

function normalize(raw: unknown): RegionCity | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const city =
    typeof o.city === "string"
      ? o.city
      : typeof o.key === "string"
        ? o.key
        : "";
  if (!city) return null;
  return {
    city,
    key: typeof o.key === "string" ? o.key : city,
    displayName:
      typeof o.displayName === "string" ? o.displayName : city,
    status: typeof o.status === "string" ? o.status : undefined,
    communities: Array.isArray(o.communities)
      ? (o.communities as string[])
      : undefined,
  };
}

function asCities(res: unknown): RegionCity[] {
  if (!res) return [];
  if (Array.isArray(res)) {
    return res.map(normalize).filter(Boolean) as RegionCity[];
  }
  if (typeof res === "object") {
    const o = res as { items?: unknown[]; cities?: unknown[] };
    const list = o.items ?? o.cities ?? [];
    return list.map(normalize).filter(Boolean) as RegionCity[];
  }
  return [];
}

/** Pilot cities for pickers (SW + Abuja + PH). */
export async function listRegions(): Promise<RegionCity[]> {
  try {
    const res = await apiFetch<unknown>("/regions");
    return asCities(res);
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404) return [];
    throw err;
  }
}

export async function getRegion(key: string): Promise<RegionDetail | null> {
  try {
    const res = await apiFetch<RegionDetail & { found?: boolean }>(
      `/regions/${encodeURIComponent(key)}`,
    );
    if (!res || res.found === false) return null;
    return res;
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 404) return null;
    throw err;
  }
}

export async function getPreferredCityKey(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PREFERRED_CITY_KEY);
  } catch {
    return null;
  }
}

export async function setPreferredCityKey(cityKey: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFERRED_CITY_KEY, cityKey);
  } catch {
    /* ignore */
  }
}

/** Human labels for sell/profile chips from region community codes. */
export function communityLabelsForCity(cityKey: string): string[] {
  const key = cityKey
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/_/g, "-");
  const normalized =
    key === "oyo"
      ? "ibadan"
      : key === "ph" || key === "portharcourt"
        ? "port-harcourt"
        : key;
  switch (normalized) {
    case "abuja":
      return [
        "Maitama",
        "Asokoro",
        "Wuse",
        "Garki",
        "Jabi",
        "Guzape",
        "Other Abuja",
      ];
    case "ibadan":
      return [
        "Bodija",
        "UI",
        "Ring Road",
        "Iwo Road",
        "Challenge",
        "Other Ibadan",
      ];
    case "port-harcourt":
      return [
        "GRA Port Harcourt",
        "Old GRA",
        "Rumuola",
        "Ada George",
        "Trans Amadi",
        "Other PH",
      ];
    case "ogun":
      return [
        "Abeokuta",
        "Sango-Ota",
        "Ifo",
        "Sagamu",
        "Ijebu-Ode",
        "Other Ogun",
      ];
    case "osun":
      return [
        "Osogbo",
        "Ile-Ife",
        "Iwo",
        "Ede",
        "Ikire",
        "Other Osun",
      ];
    case "ondo":
      return [
        "Akure",
        "Ondo Town",
        "Ore",
        "Owo",
        "Okitipupa",
        "Other Ondo",
      ];
    case "ekiti":
      return [
        "Ado-Ekiti",
        "Ikere-Ekiti",
        "Ikole",
        "Iye",
        "Omuo",
        "Other Ekiti",
      ];
    case "edo":
      return [
        "Benin City",
        "GRA Benin",
        "Ugbowo",
        "Sakponba",
        "Auchi",
        "Other Edo",
      ];
    case "kano":
      return [
        "Nassarawa",
        "Fagge",
        "Gwale",
        "Tarauni",
        "Dala",
        "Other Kano",
      ];
    default:
      return [
        "Lekki Ph1",
        "Ikoyi",
        "VI",
        "Oniru",
        "VGC",
        "Chevron",
        "Ajah",
        "Other Lagos",
      ];
  }
}

export function regionLabel(city: RegionCity): string {
  return city.displayName || city.key || city.city;
}

/** Map region JSON community codes → mobile chip labels (ADR-011). */
const COMMUNITY_CODE_TO_CHIP: Record<string, string> = {
  LEKKI_PH1: "Lekki Ph1",
  IKOYI: "Ikoyi",
  VI: "VI",
  ONIRU: "Oniru",
  VGC: "VGC",
  CHEVRON: "Chevron",
  AJAH: "Ajah",
  OTHER_LAGOS: "Other Lagos",
  MAITAMA: "Maitama",
  ASOKORO: "Asokoro",
  WUSE: "Wuse",
  GARKI: "Garki",
  JABI: "Jabi",
  GUZAPE: "Guzape",
  OTHER_ABUJA: "Other Abuja",
  BODIJA: "Bodija",
  UI: "UI",
  RING_ROAD: "Ring Road",
  IWO_ROAD: "Iwo Road",
  CHALLENGE: "Challenge",
  OTHER_IBADAN: "Other Ibadan",
  GRA_PH: "GRA Port Harcourt",
  OLD_GRA: "Old GRA",
  RUMUOLA: "Rumuola",
  ADA_GEORGE: "Ada George",
  TRANS_AMADI: "Trans Amadi",
  OTHER_PH: "Other PH",
  ABEOKUTA: "Abeokuta",
  SANGO_OTA: "Sango-Ota",
  IFO: "Ifo",
  SAGAMU: "Sagamu",
  IJEBU_ODE: "Ijebu-Ode",
  OTHER_OGUN: "Other Ogun",
  OSOGBO: "Osogbo",
  ILE_IFE: "Ile-Ife",
  IWO: "Iwo",
  EDE: "Ede",
  IKIRE: "Ikire",
  OTHER_OSUN: "Other Osun",
  AKURE: "Akure",
  ONDO_TOWN: "Ondo Town",
  ORE: "Ore",
  OWO: "Owo",
  OKITIPUPA: "Okitipupa",
  OTHER_ONDO: "Other Ondo",
  ADO_EKITI: "Ado-Ekiti",
  IKERE: "Ikere-Ekiti",
  IKOLE: "Ikole",
  IYE: "Iye",
  OMUO: "Omuo",
  OTHER_EKITI: "Other Ekiti",
  BENIN_CITY: "Benin City",
  GRA_BENIN: "GRA Benin",
  UGBOWO: "Ugbowo",
  SAKPONBA: "Sakponba",
  AUCHI: "Auchi",
  OTHER_EDO: "Other Edo",
  NASSARAWA: "Nassarawa",
  FAGGE: "Fagge",
  GWALE: "Gwale",
  TARAUNI: "Tarauni",
  DALA: "Dala",
  OTHER_KANO: "Other Kano",
};

/** Resolve locate API code/label to a chip string for preferredCommunity. */
export function communityChipFromLocate(
  cityKey: string,
  code?: string,
  apiLabel?: string,
): string {
  const chips = communityLabelsForCity(cityKey);
  if (code && COMMUNITY_CODE_TO_CHIP[code] && chips.includes(COMMUNITY_CODE_TO_CHIP[code])) {
    return COMMUNITY_CODE_TO_CHIP[code];
  }
  if (apiLabel && chips.includes(apiLabel)) return apiLabel;
  if (apiLabel) {
    const soft = apiLabel.toLowerCase();
    const fuzzy = chips.find(
      (c) =>
        soft.includes(c.toLowerCase()) ||
        c.toLowerCase().includes(soft.split(/\s+/)[0] ?? ""),
    );
    if (fuzzy) return fuzzy;
  }
  return chips[0] ?? apiLabel ?? code ?? "";
}
