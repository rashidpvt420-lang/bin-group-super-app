export function roundAed(value) {
  const amount = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(amount)) return 0;
  const normalized = Math.round(amount * 100) / 100;
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
