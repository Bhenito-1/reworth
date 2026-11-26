export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatProposalDeliveryDate(
  iso: string | null | undefined,
): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-NG", { dateStyle: "medium" });
}

export function dateInputToIso(date: string): string {
  return new Date(date).toISOString();
}

/** Prefill a date input from an API datetime, clamped to today or later. */
export function proposalDateInput(iso: string | null | undefined): string {
  if (!iso) return todayIso();
  const day = iso.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= todayIso() ? day : todayIso();
}