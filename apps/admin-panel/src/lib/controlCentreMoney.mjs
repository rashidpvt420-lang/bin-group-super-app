/**
 * Production control-centre money.
 * Collected cash is the verified payment_transactions ledger. Passport
 * rentCollectedTotal / rentOutstandingTotal / annualRentTotal are not sources:
 * owner activation never writes them.
 */

import { summarizeCanonicalPaymentLedger } from './canonicalPaymentLedger.mjs';

const REJECTED = new Set(['REJECTED', 'FAILED', 'CANCELLED', 'CANCELED', 'VOID']);
const ACTIVE_CONTRACT = new Set(['ACTIVE', 'ACTIVATED', 'APPROVED', 'SIGNED']);
const RENT_TYPES = new Set([
    'OWNER_RENT_PAYMENT',
    'TENANT_RENT_PAYMENT_PROOF',
    'RENT_COLLECTION',
    'RENT_PAYMENT_PROOF',
]);

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

const firstPresent = (row, fields) => {
    for (const field of fields) {
        const raw = row?.[field];
        if (raw === undefined || raw === null || raw === '') continue;
        return { present: true, fils: filsFrom(raw) };
    }
    return { present: false, fils: null };
};

const isRentRow = (row) => [
    normalize(row?.recordType),
    normalize(row?.transactionType),
    normalize(row?.paymentType),
].some((token) => RENT_TYPES.has(token));

const isRejected = (row) => REJECTED.has(normalize(row?.paymentStatus || row?.verificationState || row?.status));

const recordedBalanceFils = (row) => {
    const explicit = firstPresent(row, ['balance']);
    if (explicit.present) return explicit;
    const due = firstPresent(row, ['rentDue', 'amountDue']);
    const paid = firstPresent(row, ['rentPaid', 'amountPaid', 'amount']);
    if (!due.present || !paid.present) return { present: false, fils: null };
    if (due.fils === null || paid.fils === null) return { present: true, fils: null };
    return { present: true, fils: Math.max(0, due.fils - paid.fils) };
};

const nested = (row, path) => path.split('.').reduce((current, key) => (
    current && typeof current === 'object' ? current[key] : undefined
), row);

const annualValueFils = (contract) => {
    const candidates = [
        contract?.annualRent,
        contract?.annualRentTotal,
        nested(contract, 'quoteSnapshot.annualContractValue'),
        nested(contract, 'paymentSchedule.annualContractValue'),
        nested(contract, 'billingSummary.annualContractValue'),
        nested(contract, 'quote.annualTotal'),
        contract?.annualContractValue,
        contract?.annualFee,
    ];
    for (const raw of candidates) {
        if (raw === undefined || raw === null || raw === '') continue;
        return filsFrom(raw);
    }
    return undefined;
};

const isActiveContract = (contract) => ACTIVE_CONTRACT.has(
    normalize(contract?.status || contract?.activationStatus || contract?.contractStatus),
);

const aed = (fils) => fils / 100;

export function summarizeControlCentreMoney(payments, contracts, options = {}) {
    const rows = Array.isArray(payments) ? payments : [];
    const ledger = summarizeCanonicalPaymentLedger(rows);
    const truncated = options.paymentsTruncated === true;

    let outstandingFils = 0;
    let outstandingComplete = !truncated;
    rows.forEach((row) => {
        if (!isRentRow(row) || isRejected(row)) return;
        const balance = recordedBalanceFils(row);
        if (!balance.present) return;
        if (balance.fils === null) {
            outstandingComplete = false;
            return;
        }
        outstandingFils += balance.fils;
    });

    const active = (Array.isArray(contracts) ? contracts : []).filter(isActiveContract);
    let projectedFils = 0;
    let projectedComplete = true;
    let recordedAnnualValues = 0;
    active.forEach((contract) => {
        const fils = annualValueFils(contract);
        if (fils === undefined || fils === null) {
            projectedComplete = false;
            return;
        }
        recordedAnnualValues += 1;
        projectedFils += fils;
    });

    return {
        collected: truncated ? null : ledger.totalRevenue,
        outstanding: outstandingComplete ? aed(outstandingFils) : null,
        projectedAnnualRent: projectedComplete ? aed(projectedFils) : null,
        activeContracts: active.length,
        recordedAnnualValues,
        verifiedPaymentCount: ledger.creditCount,
        pendingAmount: truncated || !ledger.pendingComplete ? null : ledger.pendingAmount,
    };
}
