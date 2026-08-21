/**
 * Canonical AED minor-unit arithmetic for Owner quote, activation, and approval paths.
 * Values are parsed as decimal text and rounded to integer fils/cents before arithmetic,
 * avoiding IEEE-754 half-cent drift such as 10000.30 * 15% => 1500.04.
 */
const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;

function toScaledInteger(value: unknown, scale: number): number {
  const raw = typeof value === "number"
    ? (Number.isFinite(value) ? String(value) : "")
    : String(value ?? "").trim();
  const match = DECIMAL_PATTERN.exec(raw);
  if (!match) throw new RangeError("AED amount must be a finite decimal value.");

  const negative = match[1] === "-";
  const whole = match[2] || "0";
  const fraction = match[3] || "";
  const exponent = Number(match[4] || 0);
  if (!Number.isSafeInteger(exponent)) throw new RangeError("AED amount exponent is invalid.");

  const digits = `${whole}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
  const decimalIndex = whole.length + exponent;
  const targetIndex = decimalIndex + scale;

  let kept: string;
  let firstDiscarded = "0";
  if (targetIndex <= 0) {
    kept = "0";
    firstDiscarded = targetIndex === 0 ? (digits[0] || "0") : "0";
  } else if (targetIndex >= digits.length) {
    kept = `${digits}${"0".repeat(targetIndex - digits.length)}`;
  } else {
    kept = digits.slice(0, targetIndex);
    firstDiscarded = digits[targetIndex] || "0";
  }

  let scaled = BigInt(kept || "0");
  if (firstDiscarded >= "5") scaled += 1n;
  if (negative && scaled !== 0n) scaled = -scaled;

  const numeric = Number(scaled);
  if (!Number.isSafeInteger(numeric)) throw new RangeError("AED amount exceeds the supported range.");
  return numeric;
}

export function toAedCents(value: unknown): number {
  return toScaledInteger(value, 2);
}

export function fromAedCents(cents: number): number {
  if (!Number.isSafeInteger(cents)) throw new RangeError("AED cents must be a safe integer.");
  const amount = cents / 100;
  return Object.is(amount, -0) ? 0 : amount;
}

export function normalizeAedMoney(value: unknown): number {
  return fromAedCents(toAedCents(value));
}

/**
 * Calculate a percentage from integer AED cents and round the resulting
 * fractional cent half-away-from-zero. Example: AED 10,000.30 * 15% = AED 1,500.05.
 */
export function percentageOfAed(value: unknown, numerator: number, denominator = 100): number {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError("AED percentage ratio must use safe integer terms and a positive denominator.");
  }

  const cents = toAedCents(value);
  const negative = (cents < 0) !== (numerator < 0);
  const absoluteCents = BigInt(Math.abs(cents));
  const absoluteNumerator = BigInt(Math.abs(numerator));
  const divisor = BigInt(denominator);
  const product = absoluteCents * absoluteNumerator;
  let quotient = product / divisor;
  const remainder = product % divisor;
  if (remainder * 2n >= divisor) quotient += 1n;
  if (negative && quotient !== 0n) quotient = -quotient;

  const resultCents = Number(quotient);
  if (!Number.isSafeInteger(resultCents)) throw new RangeError("AED percentage result exceeds the supported range.");
  return fromAedCents(resultCents);
}

export function formatAedMoney(value: unknown): string {
  const amount = normalizeAedMoney(value);
  return `AED ${amount.toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
