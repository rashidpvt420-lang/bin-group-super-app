import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from './firebase';
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
  method: ManualPaymentMethod,
  amount: number,
  propertyId: string,
  ownerId: string,
): Promise<PaymentIntentResult> {
  const safeOwnerId = ownerId || 'anonymous';
  const contractId = `MANUAL-${Date.now()}`;
  const reference = `BIN-${propertyId}-${Date.now()}`;

  await setDoc(doc(db, 'contracts', contractId), {
    ownerId: safeOwnerId,
    propertyId,
    status: 'PAYMENT_PENDING',
    paymentMethod: method,
    activationDeposit: amount,
    paymentReference: reference,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await addDoc(collection(db, 'transactions'), {
    ownerId: safeOwnerId,
    propertyId,
    contractId,
    type: 'ACTIVATION_DEPOSIT',
    method,
    amount,
    status: 'PENDING_MANUAL_VERIFICATION',
    reference,
    createdAt: serverTimestamp(),
  });

  return {
    contractId,
    paymentManifest: {
      payableTo: 'BIN GROUP / BIN Construction',
      officeLocation: 'BIN GROUP UAE Operations Office',
      amount,
      method,
      reference,
    },
  };
}

export async function verifyPaymentStatus(contractId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'contracts', contractId));
  if (!snap.exists()) return false;
  const status = String(snap.data().status || '').toUpperCase();
  return status === 'ACTIVE' || status === 'PAYMENT_VERIFIED' || status === 'VERIFIED';
}
