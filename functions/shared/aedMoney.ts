/**
 * Canonical AED-fils normalization for Owner quote, activation, and approval paths.
 * Invalid values are rejected by callers; this utility never coerces them to zero.
 *
 * Rounding rule: half-up (half away from zero) to 2 decimal places, applied to the decimal
 * value the amount represents. `Math.round(x * 100) / 100` rounded on the binary value, so
 * 15% of AED 1,828.50 (274.275, held in binary as 274.27499999999998) became 274.27 instead
 * of 274.28. The amount is first reduced to 15 significant digits to drop binary noise left
 * by earlier arithmetic, then shifted by two decimal places in exponent notation (exact),
 * rounded, and divided back to fils.
 */
const AED_SIGNIFICANT_DIGITS = 15;

function roundHalfUpToFils(amount: number): number {
  const magnitude = Math.abs(amount);
  const decimal = Number(magnitude.toPrecision(AED_SIGNIFICANT_DIGITS));
  const [mantissa, exponent] = decimal.toExponential().split("e");
  const fils = Math.round(Number(`${mantissa}e${Number(exponent) + 2}`));
  return (amount < 0 ? -fils : fils) / 100;
}

export function normalizeAedMoney(value: unknown): number {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) throw new RangeError("AED amount must be finite.");
  const normalized = roundHalfUpToFils(amount);
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
