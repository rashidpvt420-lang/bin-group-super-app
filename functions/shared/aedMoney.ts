/**
 * Canonical AED-cent normalization for Owner quote, activation, and approval paths.
 * Invalid values are rejected by callers; this utility never coerces them to zero.
 */
export function normalizeAedMoney(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) throw new RangeError("AED amount must be finite.");
  const normalized = Math.round(amount * 100) / 100;
  if (!Number.isFinite(normalized)) throw new RangeError("AED amount exceeds the supported range.");
  return Object.is(normalized, -0) ? 0 : normalized;
}

export function formatAedMoney(value: unknown): string {
  const amount = normalizeAedMoney(value);
  return `AED ${amount.toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
