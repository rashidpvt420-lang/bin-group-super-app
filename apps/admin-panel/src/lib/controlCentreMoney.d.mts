export function summarizeControlCentreMoney(
    payments: Array<Record<string, unknown>>,
    contracts: Array<Record<string, unknown>>,
    options?: { paymentsTruncated?: boolean },
): {
    collected: number | null;
    outstanding: number | null;
    projectedAnnualRent: number | null;
    activeContracts: number;
    recordedAnnualValues: number;
    verifiedPaymentCount: number;
    pendingAmount: number | null;
};
