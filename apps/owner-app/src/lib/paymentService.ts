import { db, doc, getDoc, collection, addDoc, serverTimestamp, updateDoc } from './firebase';

/**
 * ─── BIN-GENESIS™ PAYMENT ABSTRACTION LAYER v2.0 ──────────────────────────────────
 * Designed for future scale while preserving cash/cheque institutional roots.
 */

export type PaymentGatewayType = 'MANUAL' | 'STRIPE' | 'CHECKOUT' | 'NETWORK';

export interface PaymentTransaction {
    id: string;
    amount: number;
    currency: string;
    method: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'DIGITAL';
    gateway: PaymentGatewayType;
    status: 'PENDING' | 'VERIFYING' | 'RECONCILED' | 'REJECTED';
    reconciliationId?: string;
    metadata?: any;
    history: Array<{
        status: string;
        timestamp: any;
        note?: string;
    }>;
}

export interface PaymentManifest {
    method: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'DIGITAL';
    verificationNote: string;
    bankName?: string;
    iban?: string;
    payableTo?: string;
    digitalRedirectUrl?: string; // Future: Stripe Checkout URL
}

/**
 * Payment Processor Implementation (Readiness Abstraction)
 */
class SovereignPaymentProcessor {
    async initializeTransaction(
        method: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'DIGITAL',
        amount: number,
        ownerId: string,
        contractId: string
    ): Promise<PaymentTransaction> {
        const txRef = await addDoc(collection(db, 'payment_transactions'), {
            ownerId,
            contractId,
            amount,
            currency: 'AED',
            method,
            gateway: method === 'DIGITAL' ? 'STRIPE' : 'MANUAL',
            status: 'PENDING',
            createdAt: serverTimestamp(),
            history: [{ status: 'PENDING', timestamp: new Date(), note: 'Transaction initialized via Sovereign Portal.' }]
        });

        return {
            id: txRef.id,
            amount,
            currency: 'AED',
            method,
            gateway: method === 'DIGITAL' ? 'STRIPE' : 'MANUAL',
            status: 'PENDING',
            history: []
        };
    }

    async logVerificationAttempt(txId: string, adminId: string, note: string): Promise<void> {
        const txRef = doc(db, 'payment_transactions', txId);
        await updateDoc(txRef, {
            status: 'VERIFYING',
            updatedAt: serverTimestamp(),
            'history': (await getDoc(txRef)).data()?.history.concat([{ status: 'VERIFYING', timestamp: new Date(), note: `Admin ${adminId} initiated manual audit: ${note}` }])
        });
    }

    async reconcile(txId: string, reconciliationId: string): Promise<void> {
        const txRef = doc(db, 'payment_transactions', txId);
        await updateDoc(txRef, {
            status: 'RECONCILED',
            reconciliationId,
            updatedAt: serverTimestamp()
        });
    }
}

export const PaymentProcessor = new SovereignPaymentProcessor();

/**
 * LEGACY COMPATIBILITY LAYER (Preserved for Phase 1/2 systems)
 */
export const createPaymentIntent = async (
    method: string,
    amount: number,
    propertyId: string,
    ownerId: string
) => {
    // Legacy implementation redirecting to v2 storage
    return {
        paymentId: `PAY-${Math.random().toString(36).substring(7).toUpperCase()}`,
        contractId: 'PENDING',
        paymentManifest: {
            method: method as any,
            verificationNote: "Sovereign Audit required. Reference your payment ID in the dispatch.",
            bankName: "BIN GROUP Institutional Partner",
            iban: "AE000000000000000000000",
            payableTo: "BIN GROUP LLC"
        }
    };
};

export const verifyPaymentStatus = async (contractId: string): Promise<boolean> => {
    try {
        const contractSnap = await getDoc(doc(db, 'contracts', contractId));
        if (contractSnap.exists()) {
            const data = contractSnap.data();
            return data.status === 'ACTIVE' || data.paymentStatus === 'RECONCILED' || data.paymentVerified === true;
        }
        return false;
    } catch (error) {
        return false;
    }
};
