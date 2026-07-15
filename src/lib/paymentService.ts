import { doc, getDoc } from './firebase';
import { db } from './firebase';

export type ManualPaymentMethod = 'CASH' | 'CHEQUE' | 'BANK_TRANSFER';

export interface PaymentIntentResult {
  contractId: string;
  paymentManifest: {
    payableTo: string;
    officeLocation: string;
    amount: number;
    method: ManualPaymentMethod;
    reference: string;
  };
}

export async function createPaymentIntent(
  _method: ManualPaymentMethod,
  _amount: number,
  _propertyId: string,
  _ownerId: string,
): Promise<PaymentIntentResult> {
  throw new Error(
    'This legacy client-authoritative payment path is disabled. Use the server-quoted owner onboarding payment flow.',
  );
}

export async function verifyPaymentStatus(contractId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'contracts', contractId));
  if (!snap.exists()) return false;
  const contract = snap.data();
  const status = String(contract.status || contract.contractStatus || '').toUpperCase();
  return status === 'ACTIVE' &&
    contract.ownerSigned === true &&
    contract.paymentVerified === true &&
    contract.adminApproved === true &&
    (contract.dashboardUnlockApproved === true || contract.dashboardUnlocked === true);
}
