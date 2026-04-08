import { db, doc, getDoc, functions, httpsCallable } from './firebase';

/**
 * ── BIN-IDENTITY™ PRODUCTION PAYMENT SERVICE ──────────────────────────────────
 * Hardened Institutional Handshake protocol for Sovereign Asset Onboarding.
 * 
 * DESIGN PRINCIPLE: 
 * Frontend is strictly READ-ONLY for payment status. 
 * Verification happens via independent Backend-to-Backend (B2B) Webhooks.
 */

export interface PaymentManifest {
    method: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER';
    bankName?: string;
    accountName?: string;
    iban?: string;
    swiftCode?: string;
    branch?: string;
    paymentReferenceInstruction?: string;
    payableTo?: string;
    dropOffLocation?: string;
    collectionPolicy?: string;
    chequeNumberRequired?: boolean;
    officeLocation?: string;
    acceptedHours?: string;
    receiptPolicy?: string;
    contactInstruction?: string;
    verificationNote: string;
}

export interface PaymentIntentResult {
    paymentId: string;
    paymentManifest: PaymentManifest;
    contractId: string;
}

/**
 * 1. createPaymentIntent()
 * - Registers a manual payment intention with the BIN-BACKEND™.
 */
export const createPaymentIntent = async (
    method: string,
    amount: number, 
    propertyId: string,
    ownerId: string
): Promise<PaymentIntentResult> => {
    try {
        const initiateFn = httpsCallable(functions, 'createPaymentIntent');
        const result = await initiateFn({
            amount,
            method,
            propertyId,
            ownerId,
            currency: 'AED'
        });

        return result.data as PaymentIntentResult;
    } catch (error) {
        console.error('[PAYMENT-ENGINE] Intent Creation Failed:', error);
        throw new Error("MANIFEST_GENERATION_FAILURE: Resource protocol rejected.");
    }
};

/**
 * 2. verifyPaymentStatus()
 * - Strictly reads database state which can ONLY be updated by an Admin in the backend.
 */
export const verifyPaymentStatus = async (contractId: string): Promise<boolean> => {
    try {
        const contractSnap = await getDoc(doc(db, 'contracts', contractId));
        if (contractSnap.exists()) {
            const data = contractSnap.data();
            // Standardized: Admin approval sets status to ACTIVE and paymentVerified to true.
            return data.status === 'ACTIVE' && data.paymentVerified === true;
        }
        return false;
    } catch (error) {
        console.error('[PAYMENT-ENGINE] Registry Verification Failed:', error);
        return false;
    }
};
