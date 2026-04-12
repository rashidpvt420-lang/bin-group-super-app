import { db, doc, getDoc, collection, addDoc, serverTimestamp } from './firebase';

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
 * - Registers a manual payment intention directly in Firestore.
 * - Architecture Decision: adminVerifyPayment is the singular source of truth. 
 * - The frontend simply logs the intention and waits for admin backend verification.
 */
export const createPaymentIntent = async (
    method: string,
    amount: number,
    propertyId: string,
    ownerId: string
): Promise<PaymentIntentResult> => {
    try {
        const contractRef = await addDoc(collection(db, 'contracts'), {
            ownerId,
            propertyId,
            amount,
            method,
            currency: 'AED',
            status: 'PENDING_VERIFICATION',
            paymentVerified: false,
            createdAt: serverTimestamp()
        });

        return {
            paymentId: `PAY-${contractRef.id.substring(0, 8).toUpperCase()}`,
            contractId: contractRef.id,
            paymentManifest: {
                method: method as 'CASH' | 'CHEQUE' | 'BANK_TRANSFER',
                verificationNote: "Please complete the payment and provide the reference ID to the administrative team.",
                bankName: "BIN GROUP Institutional Partner",
                iban: "AE000000000000000000000",
                payableTo: "BIN GROUP LLC"
            }
        };
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

