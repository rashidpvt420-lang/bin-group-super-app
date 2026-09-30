/**
 * Half-up (half away from zero) fils rounding: the same rule as normalizeAedMoney in
 * functions/shared/aedMoney.ts (kept in step by tests/launch/aed-money-round-half-up.test.mjs),
 * so an invoice rounds exactly like the quote, deposit and contract.
 */
export function roundAed(value) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return 0;
  const decimal = Number(Math.abs(amount).toPrecision(15));
  const [mantissa, exponent] = decimal.toExponential().split("e");
  const fils = Math.round(Number(`${mantissa}e${Number(exponent) + 2}`));
  const normalized = (amount < 0 ? -fils : fils) / 100;
  if (!Number.isFinite(normalized)) return 0;
  return Object.is(normalized, -0) ? 0 : normalized;
}

/** UAE VAT is 5 percent, rounded to the fils. Whole-dirham rounding is not valid. */
export function uaeVatAmount(netAmount) {
  const net = roundAed(netAmount);
  return roundAed(net * 0.05);
}

export function aedTotalWithVat(netAmount) {
  const net = roundAed(netAmount);
  const vat = uaeVatAmount(net);
  return { net, vat, total: roundAed(net + vat) };
}
