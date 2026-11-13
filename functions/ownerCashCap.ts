import { HttpsError } from "firebase-functions/v2/https";
import type * as FirebaseFirestore from "firebase-admin/firestore";
import type { Firestore, Query, Transaction } from "firebase-admin/firestore";
import {
  OWNER_CASH_ACCEPTANCE_THRESHOLD_AED,
  cashPaymentWouldExceedCap,
  ownerCashCapRejectionMessage,
} from "./ownerInitialContractPolicy";

const EXCLUDED_CASH_STATUSES = new Set([
  "REJECTED",
  "VOID",
  "CANCELLED",
  "CANCELED",
  "DECLINED",
  "REVERSED",
  "RETURNED",
]);

type Reader = {
  get: (query: Query) => Promise<FirebaseFirestore.QuerySnapshot>;
};

export function isCashPaymentMethod(method: unknown): boolean {
  return String(method || "").trim().toUpperCase() === "CASH";
}

export function countsTowardCashCap(payment: Record<string, unknown> | undefined | null): boolean {
  if (!payment) return false;
  const method = String(payment.paymentMethod || payment.method || (payment.replacementPayment as { method?: unknown } | undefined)?.method || "").toUpperCase();
  if (method !== "CASH") return false;
  const status = String(payment.status || payment.paymentStatus || "").toUpperCase();
  if (EXCLUDED_CASH_STATUSES.has(status)) return false;
  return true;
}

export function cashRecordAmountAed(payment: Record<string, unknown> | undefined | null): number {
  if (!payment) return 0;
  const replacement = payment.replacementPayment as Record<string, unknown> | undefined;
  const raw = payment.amount ?? payment.amountPaid ?? payment.paymentAmount ?? replacement?.amount ?? 0;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount > 0 ? Math.round((amount + Number.EPSILON) * 100) / 100 : 0;
}

async function sumQueryCash(
  reader: Reader,
  query: Query,
  seen: Set<string>,
  excludePaymentIds: Set<string>,
): Promise<number> {
  const snap = await reader.get(query);
  let total = 0;
  for (const doc of snap.docs) {
    if (seen.has(doc.id) || excludePaymentIds.has(doc.id)) continue;
    seen.add(doc.id);
    const data = (doc.data() || {}) as Record<string, unknown>;
    if (!countsTowardCashCap(data)) continue;
    total += cashRecordAmountAed(data);
  }
  return Math.round((total + Number.EPSILON) * 100) / 100;
}

/**
 * Sum already-recorded CASH against a property contract, including linked or split
 * payments that share the contract (or, if no contract id, the property).
 */
export async function sumRecordedCashAedForPropertyContract(
  db: Firestore,
  reader: Reader | Transaction,
  opts: {
    contractId?: string | null;
    propertyId?: string | null;
    excludePaymentIds?: string[];
  },
): Promise<number> {
  const excludePaymentIds = new Set((opts.excludePaymentIds || []).filter(Boolean));
  const seen = new Set<string>();
  let total = 0;
  const collections = ["payment_transactions", "payments", "invoices"] as const;
  const scopes: Array<[string, string]> = [];
  if (opts.contractId) {
    scopes.push(["contractId", opts.contractId], ["linkedContractId", opts.contractId], ["intakeId", opts.contractId]);
  } else if (opts.propertyId) {
    scopes.push(["propertyId", opts.propertyId]);
  }
  for (const collection of collections) {
    for (const [field, value] of scopes) {
      total += await sumQueryCash(reader, db.collection(collection).where(field, "==", value), seen, excludePaymentIds);
    }
  }
  return Math.round((total + Number.EPSILON) * 100) / 100;
}

export async function assertCashWithinPropertyContractCap(args: {
  db: Firestore;
  reader?: Reader | Transaction;
  method: unknown;
  amountAed: number;
  contractId?: string | null;
  propertyId?: string | null;
  excludePaymentIds?: string[];
}): Promise<{ recordedCashAed: number; capAed: number }> {
  const capAed = OWNER_CASH_ACCEPTANCE_THRESHOLD_AED ?? 0;
  if (!isCashPaymentMethod(args.method)) {
    return { recordedCashAed: 0, capAed };
  }
  const reader = args.reader || args.db;
  const recordedCashAed = await sumRecordedCashAedForPropertyContract(args.db, reader as Reader, {
    contractId: args.contractId,
    propertyId: args.propertyId,
    excludePaymentIds: args.excludePaymentIds,
  });
  if (cashPaymentWouldExceedCap({ amountAed: args.amountAed, recordedCashAed, capAed })) {
    throw new HttpsError("failed-precondition", ownerCashCapRejectionMessage(capAed));
  }
  return { recordedCashAed, capAed };
}

export { cashPaymentWouldExceedCap, ownerCashCapRejectionMessage, OWNER_CASH_ACCEPTANCE_THRESHOLD_AED };
