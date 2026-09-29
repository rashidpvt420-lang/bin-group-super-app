/**
 * Admin financial totals for the canonical payment_transactions ledger.
 * Amounts are summed in fils so fractional dirhams do not drift, and a missing
 * amount invalidates the dependent total instead of becoming zero.
 */

const REFUND_TYPES = new Set(['SLA_CREDIT', 'REFUND', 'CREDIT', 'REFUND_PENDING', 'REFUNDED']);
const EXPENSE_TYPES = new Set(['DEBIT', 'EXPENSE', 'COST', 'OPEX']);
const VERIFIED_STATUSES = new Set(['SUCCEEDED', 'APPROVED', 'VERIFIED', 'RECONCILED', 'PAID']);
const REJECTED_STATUSES = new Set(['REJECTED', 'FAILED', 'CANCELLED', 'CANCELED', 'VOID']);
const MONEY_FIELDS = ['amount', 'amountPaid', 'paidAmount', 'rentPaid'];

const normalize = (value) => String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');

const filsFrom = (value) => {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return null;
        return Math.round(value * 100);
    }
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
    return Math.round(parsed * 100);
};

const aedFromFils = (fils) => fils / 100;

const moneyFrom = (row) => {
    for (const field of MONEY_FIELDS) {
        const raw = row[field];
        if (raw === undefined || raw === null || raw === '') continue;
        return { present: true, fils: filsFrom(raw) };
    }
    return { present: false, fils: null };
};

const typeTokens = (row) => [
    normalize(row.recordType),
    normalize(row.transactionType),
    normalize(row.type),
].filter(Boolean);

const isRefund = (row) => typeTokens(row).some((token) => REFUND_TYPES.has(token) || token.includes('REFUND'));

const isExpense = (row) => typeTokens(row).some((token) => EXPENSE_TYPES.has(token));

const ledgerStatus = (row) => normalize(row.paymentStatus || row.verificationState || row.status);

export const isVerifiedCanonicalPayment = (row) => {
    if (isRefund(row) || isExpense(row)) return false;
    if (row.paymentVerified === true || row.verified === true) return true;
    if (row.paymentVerified === false || row.verified === false) return false;
    const explicitStatus = normalize(row.paymentStatus || row.verificationState);
    if (explicitStatus) return VERIFIED_STATUSES.has(explicitStatus);
    return VERIFIED_STATUSES.has(normalize(row.status));
};

const isPendingCanonicalPayment = (row) => {
    if (isVerifiedCanonicalPayment(row) || isRefund(row) || isExpense(row)) return false;
    const status = ledgerStatus(row);
    if (!status || REJECTED_STATUSES.has(status)) return false;
    return status.startsWith('PENDING') || status === 'PAYMENT_REQUESTED' || status === 'REVIEW_REQUIRED' || status === 'PARTIAL';
};

const addFils = (rows, predicate) => {
    let fils = 0;
    let count = 0;
    let complete = true;
    rows.forEach((row) => {
        if (!predicate(row)) return;
        count += 1;
        const money = moneyFrom(row);
        if (!money.present || money.fils === null) {
            complete = false;
            return;
        }
        fils += money.fils;
    });
    return { fils, count, complete };
};

export function summarizeCanonicalPaymentLedger(rows) {
    const revenue = addFils(rows, isVerifiedCanonicalPayment);
    const expenses = addFils(rows, isExpense);
    const pending = addFils(rows, isPendingCanonicalPayment);
    const ledgerComplete = revenue.complete && expenses.complete;
    const totalRevenue = revenue.complete ? aedFromFils(revenue.fils) : null;
    const expenseTotal = expenses.count === 0
        ? null
        : expenses.complete
            ? aedFromFils(expenses.fils)
            : null;
    const netProfit = totalRevenue !== null && expenseTotal !== null ? aedFromFils(revenue.fils - expenses.fils) : null;
    const margin = totalRevenue !== null && netProfit !== null && totalRevenue > 0
        ? (netProfit / totalRevenue) * 100
        : null;

    const assets = new Map();
    if (ledgerComplete) {
        rows.forEach((row) => {
            const verified = isVerifiedCanonicalPayment(row);
            const expense = isExpense(row);
            if (!verified && !expense) return;
            const money = moneyFrom(row);
            if (money.fils === null) return;
            const key = String(row.propertyId || row.assetId || row.propertyName || row.assetName || '').trim();
            if (!key) return;
            const name = String(row.propertyName || row.assetName || row.propertyId || row.assetId || 'Property not recorded');
            const current = assets.get(key) || { name, revenueFils: 0, opexFils: 0 };
            if (verified) current.revenueFils += money.fils;
            if (expense) current.opexFils += money.fils;
            assets.set(key, current);
        });
    }

    const categories = new Map();
    if (expenses.complete) {
        rows.forEach((row) => {
            if (!isExpense(row)) return;
            const money = moneyFrom(row);
            if (money.fils === null) return;
            const category = String(row.category || 'Uncategorized').trim() || 'Uncategorized';
            categories.set(category, (categories.get(category) || 0) + money.fils);
        });
    }

    return {
        totalRevenue,
        expenses: expenseTotal,
        netProfit,
        margin,
        pendingAmount: pending.complete ? aedFromFils(pending.fils) : null,
        ledgerComplete,
        pendingComplete: pending.complete,
        creditCount: revenue.count,
        debitCount: expenses.count,
        pendingCount: pending.count,
        propertyRows: [...assets.values()]
            .map((row) => ({
                name: row.name,
                revenue: aedFromFils(row.revenueFils),
                opex: aedFromFils(row.opexFils),
            }))
            .sort((left, right) => (right.revenue - right.opex) - (left.revenue - left.opex))
            .slice(0, 20),
        expenseBreakdown: [...categories.entries()]
            .map(([label, fils]) => ({ label, amount: aedFromFils(fils) }))
            .sort((left, right) => right.amount - left.amount)
            .slice(0, 10),
    };
}

export function formatAedLedgerMoney(value) {
    if (value === null) return 'N/A';
    return `AED ${value.toLocaleString('en-AE', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}
