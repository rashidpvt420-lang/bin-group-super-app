import { db, doc, getDoc } from './firebase';

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

type PaymentIntentResult = {
    paymentId: string;
    contractId: string;
    paymentManifest: PaymentManifest;
};

export const createPaymentIntent = async (
    _method: string,
    _amount: number,
    _propertyId: string,
    _ownerId: string
): Promise<PaymentIntentResult> => {
    throw new Error(
        'This legacy payment screen is retired. Continue in the main BIN GROUP onboarding flow so the server can lock the quote, OTP, contract, and payment evidence.'
    );
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