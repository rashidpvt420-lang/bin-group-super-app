/**
 * Owner payment ledger (15% mobilisation and later owner invoices).
 *
 * One status vocabulary for Owner and Admin views, derived only from server-written
 * invoice + payment_transactions records:
 *   PENDING             invoice issued, no payment evidence recorded yet
 *   RECEIVED_UNVERIFIED cash/cheque recorded by a Finance Admin, awaiting verification
 *                       (cheque: awaiting bank clearance or second-Admin approval)
 *   VERIFIED            second Finance Admin approved (cheque cleared first); receipt issued
 *   BOUNCED             cheque returned unpaid by the bank
 *   OVERDUE             unpaid after the invoice due date (only when a due date is set)
 *
 * Phase 1 accepts CASH and CHEQUE only.
 */

export type OwnerLedgerStatus = "PENDING" | "RECEIVED_UNVERIFIED" | "VERIFIED" | "BOUNCED" | "OVERDUE";
export type ChequeClearanceState = "PENDING_CLEARANCE" | "CLEARED" | "BOUNCED";

export const OWNER_LEDGER_STATUSES: readonly OwnerLedgerStatus[] = Object.freeze([
  "PENDING", "RECEIVED_UNVERIFIED", "VERIFIED", "BOUNCED", "OVERDUE",
]);

/**
 * Days after issue before an unpaid mobilisation invoice is OVERDUE.
 * NOT DECIDED by Rashid yet: null means no due date is printed or enforced (never OVERDUE).
 */
export const OWNER_MOBILIZATION_DUE_DAYS: number | null = null;

const text = (value: unknown) => String(value ?? "").trim();
const upper = (value: unknown) => text(value).toUpperCase();

export class OwnerLedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnerLedgerError";
  }
}

export type OwnerChequeDetails = { chequeNumber: string; chequeBank: string; chequeDate: string };

/** Cheque details are mandatory when the recorded method is CHEQUE. */
export function parseOwnerChequeDetails(data: Record<string, unknown> | null | undefined): OwnerChequeDetails {
  const chequeNumber = text(data?.chequeNumber).replace(/\s+/g, "");
  const chequeBank = text(data?.chequeBank).slice(0, 120);
  const chequeDate = text(data?.chequeDate);
  if (!/^[0-9]{4,12}$/.test(chequeNumber)) throw new OwnerLedgerError("Cheque number must be 4 to 12 digits.");
  if (chequeBank.length < 2) throw new OwnerLedgerError("The drawee bank of the cheque is required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(chequeDate) || Number.isNaN(Date.parse(`${chequeDate}T00:00:00Z`))) {
    throw new OwnerLedgerError("Cheque date must be YYYY-MM-DD.");
  }
  return { chequeNumber, chequeBank, chequeDate };
}

export function chequeClearanceOf(payment: Record<string, any> | null | undefined): ChequeClearanceState | null {
  if (upper(payment?.paymentMethod || payment?.method) !== "CHEQUE") return null;
  const state = upper(payment?.chequeClearanceState);
  return state === "CLEARED" || state === "BOUNCED" ? state : "PENDING_CLEARANCE";
}

/** A cheque payment can be approved (verified) only after the bank cleared it. Cash is unaffected. */
export function assertOwnerChequeClearedForApproval(payment: Record<string, any>): void {
  const clearance = chequeClearanceOf(payment);
  if (clearance === null || clearance === "CLEARED") return;
  if (clearance === "BOUNCED") {
    throw new OwnerLedgerError("This cheque bounced. Reject the payment evidence and ask the Owner for a replacement payment.");
  }
  throw new OwnerLedgerError("Mark the cheque as cleared by the bank before approving this payment.");
}

/** Allowed manual clearance transitions: only from PENDING_CLEARANCE, only before approval. */
export function assertChequeClearanceTransition(payment: Record<string, any>, next: string): ChequeClearanceState {
  const target = upper(next);
  if (target !== "CLEARED" && target !== "BOUNCED") throw new OwnerLedgerError("Clearance must be CLEARED or BOUNCED.");
  const current = chequeClearanceOf(payment);
  if (current === null) throw new OwnerLedgerError("Only cheque payments have a bank clearance step.");
  if (isVerified(payment)) throw new OwnerLedgerError("This payment is already verified.");
  if (current !== "PENDING_CLEARANCE") throw new OwnerLedgerError(`This cheque is already ${current}.`);
  if (!text(payment.paymentProofHash) && !text(payment.paymentReferenceId)) {
    throw new OwnerLedgerError("Record the cheque as received before setting its clearance.");
  }
  return target as ChequeClearanceState;
}

function isVerified(payment: Record<string, any> | null | undefined): boolean {
  const status = upper(payment?.status);
  return payment?.paymentVerified === true || payment?.approved === true || ["APPROVED", "VERIFIED", "PAID"].includes(status) ||
    upper(payment?.paymentStatus) === "PAID";
}

function evidenceRecorded(payment: Record<string, any> | null | undefined): boolean {
  if (!payment) return false;
  const status = upper(payment.status || payment.paymentStatus);
  if (["REJECTED", "PAYMENT_REJECTED"].includes(status)) return false;
  return status === "PENDING_ADMIN_APPROVAL" || upper(payment.verificationState) === "PAYMENT_EVIDENCE_RECORDED";
}

function toMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "number") return value;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

export function resolveOwnerLedgerStatus(
  invoice: Record<string, any>,
  payment: Record<string, any> | null | undefined,
  nowMs: number = Date.now(),
): OwnerLedgerStatus {
  if (upper(invoice?.status) === "PAID" || upper(invoice?.paymentStatus) === "PAID" || isVerified(payment)) return "VERIFIED";
  if (upper(payment?.chequeClearanceState) === "BOUNCED") return "BOUNCED";
  if (evidenceRecorded(payment)) return "RECEIVED_UNVERIFIED";
  const due = toMillis(invoice?.dueAt);
  if (due !== null && nowMs > due) return "OVERDUE";
  return "PENDING";
}

export type OwnerLedgerRow = {
  invoiceId: string;
  contractId: string;
  paymentId: string | null;
  feeType: string;
  amount: number;
  currency: string;
  ledgerStatus: OwnerLedgerStatus;
  method: string | null;
  chequeNumber: string | null;
  chequeBank: string | null;
  chequeDate: string | null;
  chequeClearanceState: ChequeClearanceState | null;
  receivedByAdminUid: string | null;
  invoicePdfUrl: string | null;
  receiptPdfUrl: string | null;
  dueAt: string | null;
};

export function buildOwnerLedgerRow(
  invoiceId: string,
  invoice: Record<string, any>,
  payment: Record<string, any> | null | undefined,
  nowMs: number = Date.now(),
): OwnerLedgerRow {
  const due = toMillis(invoice?.dueAt);
  return {
    invoiceId,
    contractId: text(invoice.contractId),
    paymentId: text(invoice.paymentId) || null,
    feeType: upper(invoice.feeType) || "INVOICE",
    amount: Number(invoice.amount) || 0,
    currency: upper(invoice.currency) || "AED",
    ledgerStatus: resolveOwnerLedgerStatus(invoice, payment, nowMs),
    method: upper(payment?.paymentMethod || payment?.method) || null,
    chequeNumber: text(payment?.chequeDetails?.chequeNumber) || null,
    chequeBank: text(payment?.chequeDetails?.chequeBank) || null,
    chequeDate: text(payment?.chequeDetails?.chequeDate) || null,
    chequeClearanceState: chequeClearanceOf(payment),
    receivedByAdminUid: text(payment?.receivedByAdminUid) || null,
    invoicePdfUrl: text(invoice.pdfUrl) || null,
    receiptPdfUrl: text(invoice.receiptPdfUrl) || null,
    dueAt: due === null ? null : new Date(due).toISOString(),
  };
}

export function summarizeOwnerLedger(rows: OwnerLedgerRow[]) {
  const sum = (status: OwnerLedgerStatus[]) =>
    Math.round(rows.filter((row) => status.includes(row.ledgerStatus)).reduce((total, row) => total + row.amount * 100, 0)) / 100;
  return {
    verifiedAed: sum(["VERIFIED"]),
    awaitingVerificationAed: sum(["RECEIVED_UNVERIFIED"]),
    outstandingAed: sum(["PENDING", "OVERDUE", "BOUNCED"]),
    counts: Object.fromEntries(OWNER_LEDGER_STATUSES.map((status) => [status, rows.filter((row) => row.ledgerStatus === status).length])),
  };
}
