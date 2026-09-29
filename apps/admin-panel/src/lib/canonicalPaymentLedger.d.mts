export type CanonicalPaymentRow = {
    id?: string;
    amount?: unknown;
    amountPaid?: unknown;
    paidAmount?: unknown;
    rentPaid?: unknown;
    recordType?: unknown;
    transactionType?: unknown;
    type?: unknown;
    status?: unknown;
    paymentStatus?: unknown;
    verificationState?: unknown;
    paymentVerified?: unknown;
    verified?: unknown;
    propertyId?: unknown;
    propertyName?: unknown;
    assetId?: unknown;
    assetName?: unknown;
    category?: unknown;
};

export type CanonicalPaymentSummary = {
    totalRevenue: number | null;
    expenses: number | null;
    netProfit: number | null;
    margin: number | null;
    pendingAmount: number | null;
    ledgerComplete: boolean;
    pendingComplete: boolean;
    creditCount: number;
    debitCount: number;
    pendingCount: number;
    propertyRows: Array<{ name: string; revenue: number; opex: number }>;
    expenseBreakdown: Array<{ label: string; amount: number }>;
};

export function summarizeCanonicalPaymentLedger(rows: CanonicalPaymentRow[]): CanonicalPaymentSummary;
export function isVerifiedCanonicalPayment(row: CanonicalPaymentRow): boolean;
export function formatAedLedgerMoney(value: number | null): string;
