import { db, doc, getDoc, collection, addDoc, serverTimestamp, updateDoc, functions, httpsCallable } from './firebase';

/**
 * BIN-GENESIS™ PAYMENT ABSTRACTION LAYER v2.1
 *
 * Production safety repair:
 * - Manual payment methods can create auditable pending transactions.
 * - Digital payment cannot pretend to be live until a real PSP checkout function and webhook are configured.
 * - Contract activation must remain server/admin verified, never frontend-only.
 */

export type PaymentGatewayType = 'MANUAL' | 'STRIPE' | 'CHECKOUT' | 'NETWORK' | 'UNCONFIGURED_PSP';

export type PaymentStatus =
    | 'PENDING'
    | 'VERIFYING'
    | 'RECONCILED'
    | 'REJECTED'
    | 'PSP_CONFIGURATION_REQUIRED';

export interface PaymentTransaction {
    id: string;
    amount: number;
    currency: string;
    method: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'DIGITAL';
    gateway: PaymentGatewayType;
    status: PaymentStatus;
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
    digitalRedirectUrl?: string;
    requiresAdminVerification?: boolean;
    productionBlockedReason?: string;
}

const normalizeMethod = (method: string): PaymentTransaction['method'] => {
    const normalized = String(method || '').trim().toUpperCase();
    if (['CASH', 'CHEQUE', 'BANK_TRANSFER', 'DIGITAL'].includes(normalized)) {
        return normalized as PaymentTransaction['method'];
    }
    return 'BANK_TRANSFER';
};

class SovereignPaymentProcessor {
    async initializeTransaction(
        method: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'DIGITAL',
        amount: number,
        ownerId: string,
        contractId: string
    ): Promise<PaymentTransaction> {
        const normalizedMethod = normalizeMethod(method);
        const isDigital = normalizedMethod === 'DIGITAL';
        const status: PaymentStatus = isDigital ? 'PSP_CONFIGURATION_REQUIRED' : 'PENDING';
        const gateway: PaymentGatewayType = isDigital ? 'UNCONFIGURED_PSP' : 'MANUAL';

        const txRef = await addDoc(collection(db, 'payment_transactions'), {
            ownerId,
            contractId,
            amount,
            currency: 'AED',
            method: normalizedMethod,
            gateway,
            status,
            requiresAdminVerification: !isDigital,
            productionBlockedReason: isDigital
                ? 'Digital payment gateway is not configured. Do not activate contracts from frontend digital payment state.'
                : null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            history: [{
                status,
                timestamp: new Date(),
                note: isDigital
                    ? 'Digital payment requested but PSP checkout/webhook is not configured.'
                    : 'Manual payment transaction initialized. Admin reconciliation is required before activation.'
            }]
        });

        return {
            id: txRef.id,
            amount,
            currency: 'AED',
            method: normalizedMethod,
            gateway,
            status,
            history: []
        };
    }

    async logVerificationAttempt(txId: string, adminId: string, note: string): Promise<void> {
        const txRef = doc(db, 'payment_transactions', txId);
        const txSnap = await getDoc(txRef);
        const existingHistory = Array.isArray(txSnap.data()?.history) ? txSnap.data()?.history : [];
        await updateDoc(txRef, {
            status: 'VERIFYING',
            updatedAt: serverTimestamp(),
            history: existingHistory.concat([{ status: 'VERIFYING', timestamp: new Date(), note: `Admin ${adminId} initiated manual audit: ${note}` }])
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

export const createPaymentIntent = async (
    method: string,
    amount: number,
    propertyId: string,
    ownerId: string
) => {
    const normalizedMethod = normalizeMethod(method);
    const contractId = propertyId || 'PENDING';

    try {
        const createOwnerPaymentTransaction = httpsCallable(functions, 'createOwnerPaymentTransaction');
        const result: any = await createOwnerPaymentTransaction({
            method: normalizedMethod,
            amount,
            propertyId,
            ownerId,
            contractId
        });

        return {
            paymentId: result?.data?.paymentId,
            contractId,
            paymentManifest: {
                method: normalizedMethod,
                verificationNote: result?.data?.message || 'Payment transaction created. Admin reconciliation is required before activation.',
                digitalRedirectUrl: result?.data?.digitalRedirectUrl || undefined,
                requiresAdminVerification: normalizedMethod !== 'DIGITAL',
                productionBlockedReason: result?.data?.productionBlockedReason || undefined
            } as PaymentManifest
        };
    } catch (error) {
        const tx = await PaymentProcessor.initializeTransaction(normalizedMethod, amount, ownerId, contractId);
        return {
            paymentId: tx.id,
            contractId,
            paymentManifest: {
                method: normalizedMethod,
                verificationNote: normalizedMethod === 'DIGITAL'
                    ? 'Digital gateway is not configured. Please use manual bank/cash/cheque verification until PSP checkout is live.'
                    : 'Manual payment created. Admin reconciliation is required before contract activation.',
                requiresAdminVerification: normalizedMethod !== 'DIGITAL',
                productionBlockedReason: normalizedMethod === 'DIGITAL'
                    ? 'Missing live PSP checkout session and webhook verification.'
                    : undefined
            } as PaymentManifest
        };
    }
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