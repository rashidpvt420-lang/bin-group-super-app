// Pure policy shared by the protected handlers and executable regression tests.
export const DESIGN_PAYMENT_WORKFLOW = 'DESIGN_CASH_CHEQUE_V1';
export const DESIGN_PAYMENT_METHODS = ['CASH', 'CHEQUE'] as const;

export function designDeposit(finalTotal: unknown): number {
  const value = Number(finalTotal);
  if (!Number.isFinite(value) || value <= 0 || value > 100_000_000) throw new Error('A positive server-approved design quote is required.');
  const deposit = Math.round(Math.round(value * 100) * 15 / 100) / 100;
  if (deposit <= 0) throw new Error('The design deposit must be at least one fils.');
  return deposit;
}

export function designPaymentTerms(design: Record<string, any>, quoteRecord: Record<string, any>) {
  const quote = design.quote || {};
  const canonical = quoteRecord.quote || {};
  if (!/^[a-f0-9]{64}$/.test(String(quote.quoteHash || '')) || quote.quoteHash !== quoteRecord.quoteHash ||
      quote.quoteHash !== canonical.quoteHash || Number(quote.finalTotal) !== Number(canonical.finalTotal) ||
      quote.currency !== 'AED') throw new Error('The design quote does not match its canonical server record.');
  const amount = designDeposit(quote.finalTotal);
  // Older whole-dirham quotes need re-quotation, not a silent amount change.
  if (Number(quote.mobilizationAmount) !== amount || Number(canonical.mobilizationAmount) !== amount) {
    throw new Error('This design quote needs a cent-precise replacement before collecting payment.');
  }
  const tenantRequest = design.role === 'tenant';
  const ownerId = String(design.ownerId || '');
  if (tenantRequest && (design.approvalStatus !== 'OWNER_APPROVED' ||
      design.ownerActionBy !== ownerId || !ownerId ||
      !['APPROVE', 'TAKEOVER'].includes(design.ownerAction) ||
      design.approvedQuoteHash !== quote.quoteHash)) {
    throw new Error('The property owner must approve this exact design quote and its payer.');
  }
  if (!tenantRequest && (design.role !== 'owner' || !ownerId || ownerId !== design.userId)) {
    throw new Error('The design is not bound to its owner.');
  }
  const payerRole = tenantRequest && design.ownerAction !== 'TAKEOVER' ? 'tenant' : 'owner';
  const payerId = String(payerRole === 'owner' ? ownerId : design.tenantId || design.userId || '');
  if (!payerId || (design.payerId && design.payerId !== payerId)) throw new Error('The approved design payer is inconsistent.');
  return { amount, quoteTotal: Number(quote.finalTotal), quoteHash: String(quote.quoteHash), payerId, payerRole };
}

export function assertDesignPaymentBinding(payment: Record<string, any>, terms: ReturnType<typeof designPaymentTerms>, config: { version: string; configHash: string }, method: string) {
  if (payment.workflowVersion !== DESIGN_PAYMENT_WORKFLOW || payment.payerId !== terms.payerId ||
      payment.payerRole !== terms.payerRole || Number(payment.amount) !== terms.amount || payment.currency !== 'AED' ||
      payment.quoteHash !== terms.quoteHash || payment.method !== method ||
      !DESIGN_PAYMENT_METHODS.includes(method as 'CASH' | 'CHEQUE') ||
      payment.paymentConfigVersion !== config.version || payment.paymentConfigHash !== config.configHash) {
    throw new Error('Payment evidence is not bound to the current approved quote, payer, method, and payment policy.');
  }
}
