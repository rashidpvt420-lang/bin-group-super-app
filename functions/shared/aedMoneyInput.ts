/**
 * Strict AED input parsing for money that a person enters or confirms (rent, payment evidence,
 * received amounts). AED is exact to the fils (2 decimals): an input with sub-fils precision such
 * as 7083.385 is REJECTED, never silently rounded.
 *
 * Computed amounts (e.g. 15% of an annual value) keep using normalizeAedMoney in ./aedMoney, which
 * is intentionally left byte-identical because scripts/run-frozen-release-evidence.mjs pins its Git
 * blob for the frozen release.
 */
export class AedMoneyInputError extends RangeError {
  constructor(readonly reason: "NOT_A_NUMBER" | "SUB_FILS" | "OUT_OF_RANGE", message: string) {
    super(message);
    this.name = "AedMoneyInputError";
  }
}

const DECIMAL = /^-?\d+(?:\.\d+)?$/;

export function parseExactAedAmount(value: unknown): number {
  let decimalText: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new AedMoneyInputError("NOT_A_NUMBER", "AED amount must be a finite number.");
    // Shortest round-trip representation: 7083.38 -> "7083.38", 7083.385 -> "7083.385".
    decimalText = Object.is(value, -0) ? "0" : String(value);
    if (/e/i.test(decimalText)) {
      // Exponent form only occurs below 1e-6 (always sub-fils unless zero) or at/above 1e21.
      throw new AedMoneyInputError(Math.abs(value) < 1 ? "SUB_FILS" : "OUT_OF_RANGE", "AED amount is outside the supported fils precision.");
    }
  } else if (typeof value === "string") {
    decimalText = value.trim();
    if (!DECIMAL.test(decimalText)) throw new AedMoneyInputError("NOT_A_NUMBER", "AED amount must be a decimal number.");
  } else {
    throw new AedMoneyInputError("NOT_A_NUMBER", "AED amount must be a number.");
  }
  const [whole, fraction = ""] = decimalText.replace(/^-/, "").split(".");
  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) {
    throw new AedMoneyInputError("SUB_FILS", "AED amounts are exact to the fils (at most 2 decimals); sub-fils amounts are rejected, not rounded.");
  }
  const fils = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  if (!Number.isSafeInteger(fils)) throw new AedMoneyInputError("OUT_OF_RANGE", "AED amount exceeds the supported range.");
  const signed = decimalText.startsWith("-") ? -fils : fils;
  return signed === 0 ? 0 : signed / 100;
}
