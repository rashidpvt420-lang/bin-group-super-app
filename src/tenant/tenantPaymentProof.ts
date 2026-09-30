// Tenant rent payment proof form rules (TenantPaymentsPage). Mirrors functions/paymentEvidence.ts.
// Phase 1 rent collection is Cash or Cheque only (bank transfer / online payment is not accepted).
export type TenantProofMethod = '' | 'CASH' | 'CHEQUE';
export type TenantProofForm = {
    paymentMethod: TenantProofMethod;
    amount: string;
    reference: string;
    chequeNumber: string;
    chequeBank: string;
    chequeDate: string;
    period: string;
    notes: string;
};
export const EMPTY_PROOF_FORM: TenantProofForm = {
    paymentMethod: '',
    amount: '',
    reference: '',
    chequeNumber: '',
    chequeBank: '',
    chequeDate: '',
    period: '',
    notes: '',
};
// Money is exact to the fils: at most two decimals, never silently rounded.
export const isExactFilsAmount = (value: string) => /^\d{1,9}(\.\d{1,2})?$/.test(value.trim()) && Number(value) > 0;
export const tenantProofFormError = (form: TenantProofForm): string | null => {
    if (form.paymentMethod !== 'CASH' && form.paymentMethod !== 'CHEQUE') return 'Select the payment method: Cash or Cheque.';
    if (!isExactFilsAmount(form.amount)) return 'Enter the amount in AED with at most two decimals (fils).';
    if (form.paymentMethod === 'CASH' && form.reference.trim().length < 4) return 'Enter the cash receipt number from the office receipt.';
    if (form.paymentMethod === 'CHEQUE') {
        if (!/^[0-9]{4,12}$/.test(form.chequeNumber.replace(/\s+/g, ''))) return 'Enter the cheque number (4-12 digits).';
        if (form.chequeBank.trim().length < 2) return 'Enter the issuing bank of the cheque.';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(form.chequeDate)) return 'Enter the cheque date.';
    }
    return null;
};
