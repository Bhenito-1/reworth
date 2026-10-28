/**
 * Pure, table-driven risk rule helpers (PRD §32).
 * Side-effect-free predicates used by RiskEngineService and unit tests.
 */

export type RiskRuleCode =
  | 'DUPLICATE_IMAGE'
  | 'LOW_PRICE'
  | 'RAPID_LISTING'
  | 'REPORTED_USER'
  | 'DEVICE_FINGERPRINT'
  | 'REPEATED_CANCEL'
  | 'SUSPICIOUS_PAYMENT'
  | 'OFF_PLATFORM_CHAT'
  | 'LOCATION_JUMP'
  | 'THRESHOLDS';

export const DEFAULT_RULE_WEIGHTS: Record<Exclude<RiskRuleCode, 'THRESHOLDS'>, number> = {
  DUPLICATE_IMAGE: 30,
  LOW_PRICE: 25,
  RAPID_LISTING: 20,
  REPORTED_USER: 15,
  DEVICE_FINGERPRINT: 15,
  REPEATED_CANCEL: 15,
  SUSPICIOUS_PAYMENT: 20,
  OFF_PLATFORM_CHAT: 15,
  LOCATION_JUMP: 10,
};

export const DEFAULT_THRESHOLDS = { medium: 40, high: 70 } as const;

/** Each approved listing lowers a seller's stored score by this much. */
export const RISK_RELIEF_ON_APPROVAL = 20;

/** Stored score after an admin approves a listing. Never goes below 0. */
export function riskScoreAfterApproval(current: number): number {
  if (!Number.isFinite(current) || current <= 0) return 0;
  return Math.max(0, current - RISK_RELIEF_ON_APPROVAL);
}

export type FiredRule = {
  code: Exclude<RiskRuleCode, 'THRESHOLDS'>;
  weight: number;
  detail: Record<string, unknown>;
};

export function levelFromScore(
  score: number,
  thresholds: { medium: number; high: number } = DEFAULT_THRESHOLDS,
): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (score >= thresholds.high) return 'HIGH';
  if (score >= thresholds.medium) return 'MEDIUM';
  return 'LOW';
}

export function riskLevelRank(level: 'LOW' | 'MEDIUM' | 'HIGH'): number {
  if (level === 'HIGH') return 2;
  if (level === 'MEDIUM') return 1;
  return 0;
}

export function maxRiskLevel(
  a: 'LOW' | 'MEDIUM' | 'HIGH',
  b: 'LOW' | 'MEDIUM' | 'HIGH',
): 'LOW' | 'MEDIUM' | 'HIGH' {
  return riskLevelRank(a) >= riskLevelRank(b) ? a : b;
}

/** LOW_PRICE: price < 30% of estimateLowKobo */
export function firesLowPrice(
  priceKobo: number,
  estimateLowKobo: number,
): boolean {
  if (estimateLowKobo <= 0 || priceKobo <= 0) return false;
  const threshold = Math.round(estimateLowKobo * 0.3);
  return priceKobo < threshold;
}

/** RAPID_LISTING: >5 listings in last hour */
export function firesRapidListing(listingsLastHour: number): boolean {
  return listingsLastHour > 5;
}

/** REPORTED_USER: open reports OR ≥2 reports in 30d */
export function firesReportedUser(input: {
  openReports: number;
  reportsLast30d: number;
}): boolean {
  return input.openReports > 0 || input.reportsLast30d >= 2;
}

/** DEVICE_FINGERPRINT: same fingerprint used by ≥3 distinct users */
export function firesDeviceFingerprint(distinctUsersSharing: number): boolean {
  return distinctUsersSharing >= 3;
}

/** REPEATED_CANCEL: cancelled orders ≥3 in 30d */
export function firesRepeatedCancel(cancelledLast30d: number): boolean {
  return cancelledLast30d >= 3;
}

/** SUSPICIOUS_PAYMENT: device <24h AND amount > 50_000_000 kobo */
export function firesSuspiciousPayment(input: {
  deviceAgeMs: number | null;
  amountKobo: number;
  hasChargebackFlag?: boolean;
}): boolean {
  if (input.hasChargebackFlag) return true;
  if (input.deviceAgeMs == null) return false;
  const dayMs = 24 * 60 * 60 * 1000;
  return input.deviceAgeMs < dayMs && input.amountKobo > 50_000_000;
}

/** OFF_PLATFORM_CHAT: recent RiskEvents kind starting with CHAT_SCAN_ */
export function firesOffPlatformChat(chatScanEventCount: number): boolean {
  return chatScanEventCount > 0;
}

/** LOCATION_JUMP: listing community ≠ preferredCommunity when both set */
export function firesLocationJump(input: {
  listingCommunity: string | null | undefined;
  preferredCommunity: string | null | undefined;
}): boolean {
  const listing = (input.listingCommunity ?? '').trim();
  const preferred = (input.preferredCommunity ?? '').trim();
  if (!listing || !preferred) return false;
  return listing.toLowerCase() !== preferred.toLowerCase();
}

export function sumFiredWeights(fired: FiredRule[]): number {
  return fired.reduce((acc, r) => acc + r.weight, 0);
}
