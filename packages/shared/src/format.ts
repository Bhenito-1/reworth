import { LOCALE_NG } from "./locale.js";

/**
 * Format an amount as Nigerian Naira.
 * Pass `amountKobo` for kobo (1/100 NGN), or `amountNaira` for whole naira.
 */
export function formatNgn(options: {
  amountKobo?: number;
  amountNaira?: number;
}): string {
  const naira =
    options.amountKobo !== undefined
      ? options.amountKobo / 100
      : (options.amountNaira ?? 0);

  return new Intl.NumberFormat(LOCALE_NG, {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(naira);
}

/** Convert naira to kobo (integer). */
export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}

/** Convert kobo to naira. */
export function koboToNaira(kobo: number): number {
  return kobo / 100;
}
