/**
 * Row presentation for the admin /transactions ledger.
 * Totals stay in summarizeCanonicalPaymentLedger; this only labels a row.
 */

const EXPENSE_TYPES = new Set(['DEBIT', 'EXPENSE', 'COST', 'OPEX']);
const REJECTED_STATUSES = new Set(['REJECTED', 'FAILED', 'CANCELLED', 'CANCELED', 'VOID']);
const MONEY_FIELDS = ['amount', 'amountPaid', 'paidAmount', 'rentPaid'];

const normalize = (value) => String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');

const typeTokens = (row) => [
    normalize(row.recordType),
    normalize(row.transactionType),
    normalize(row.type),
].filter(Boolean);

const isExpense = (row) => typeTokens(row).some((token) => EXPENSE_TYPES.has(token));

const isRejected = (row) => REJECTED_STATUSES.has(normalize(row.paymentStatus || row.verificationState || row.status));

export function canonicalTransactionAmount(row) {
    for (const field of MONEY_FIELDS) {
        const raw = row?.[field];
        if (raw === undefined || raw === null || raw === '') continue;
        const parsed = typeof raw === 'number' ? raw : Number(String(raw).trim());
        if (!Number.isFinite(parsed)) return null;
        return Math.round(parsed * 100) / 100;
    }
    return null;
}

export function presentCanonicalTransaction(row) {
    const source = row || {};
    const amount = canonicalTransactionAmount(source);
    const description = String(
        source.description ||
        [source.tenantName, source.propertyName, source.unitNumber].filter(Boolean).join(' · ') ||
        source.recordType ||
        source.transactionType ||
        'Payment',
    ).trim();
    const category = String(source.category || source.recordType || source.paymentMethod || 'N/A').trim();
    let direction = 'pending';
    if (isExpense(source)) direction = 'debit';
    else if (isRejected(source)) direction = 'rejected';
    else if (source.paymentVerified === true || source.verified === true) direction = 'credit';
    else if (source.paymentVerified === false || source.verified === false) direction = 'pending';
    else {
        const status = normalize(source.paymentStatus || source.verificationState || source.status);
        if (['SUCCEEDED', 'APPROVED', 'VERIFIED', 'RECONCILED', 'PAID'].includes(status)) direction = 'credit';
    }

    return { description, category, amount, direction };
}
