/** Human-readable driving distance for checkout receipts (e.g. `5km`, `5.4km`). */
export function formatDeliveryKm(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "";
  if (km < 1) {
    const tenth = Math.max(0.1, Math.round(km * 10) / 10);
    return `${tenth}km`;
  }
  const rounded = Math.round(km * 10) / 10;
  return Number.isInteger(rounded)
    ? `${rounded}km`
    : `${rounded.toFixed(1)}km`;
}

export function deliveryLineLabel(
  km: number | null | undefined,
  prefix = "Delivery",
  handling?: "bulky" | "parcel" | null,
): string {
  const base =
    handling === "bulky"
      ? "Van delivery"
      : handling === "parcel"
        ? "Bike parcel"
        : prefix;
  if (km == null || !Number.isFinite(km)) return base;
  return `${base} (${formatDeliveryKm(km)})`;
}

export function cartDeliveryTotalLabel(
  _sellers: { distanceKm: number | null }[],
): string {
  return "Delivery";
}
