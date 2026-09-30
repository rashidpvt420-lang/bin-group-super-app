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

/**
 * BIN GROUP (issuer) VAT registration. Until the company TRN is verified against the FTA
 * register, invoices must not charge VAT: quotes, contracts and the 15% mobilisation deposit
 * are issued with VAT 0 / NOT_APPLIED, and an invoice must match them. Set trnVerified to true
 * together with the verified 15-digit TRN only in a reviewed change after verification.
 */
export const BIN_GROUP_VAT_REGISTRATION = Object.freeze({ trnVerified: false, trn: null });

export function isVerifiedVatRegistration(registration) {
  return registration?.trnVerified === true
    && typeof registration.trn === "string"
    && /^\d{15}$/.test(registration.trn);
}

/**
 * Invoice totals. VAT at 5% is added only for a verified issuer TRN; otherwise the invoice
 * total equals the net (quoted) amount and the VAT treatment is NOT_APPLIED.
 */
export function invoiceTotals(netAmount, registration = BIN_GROUP_VAT_REGISTRATION) {
  if (!isVerifiedVatRegistration(registration)) {
    const net = roundAed(netAmount);
    return { net, vat: 0, total: net, vatApplied: false, vatTreatment: "NOT_APPLIED" };
  }
  return { ...aedTotalWithVat(netAmount), vatApplied: true, vatTreatment: "STANDARD_RATED_5" };
}
