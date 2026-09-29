export function canonicalTransactionAmount(row: Record<string, unknown> | null | undefined): number | null;

export function presentCanonicalTransaction(row: Record<string, unknown> | null | undefined): {
    description: string;
    category: string;
    amount: number | null;
    direction: 'credit' | 'debit' | 'pending' | 'rejected';
};
