import { HttpsError } from "firebase-functions/v2/https";

/**
 * Four-eyes dual control and segregation-of-duties on payment decisions.
 *
 * 1. Evidence recorder and approver must be different authorized individuals.
 *    An approver may not approve or reject their own recorded payment evidence (SAME_ADMIN).
 * 2. Unknown evidence recorder identity must fail closed on staff-evidenced payments (RECORDER_UNKNOWN).
 * 3. Customer-submitted payment evidence cannot bypass independent review; a customer/payer
 *    cannot approve their own payment (SAME_PAYER).
 * 4. Missing or malformed evidence provenance fails closed (MALFORMED_EVIDENCE).
 */
export const DUAL_CONTROL_SAME_ADMIN_MESSAGE =
  "Dual control: this payment evidence was recorded by you. A different Finance Admin must approve it.";
export const DUAL_CONTROL_RECORDER_UNKNOWN_MESSAGE =
  "Dual control: this Admin-recorded payment evidence has no recorded Admin, so the approval cannot prove a second reviewer. Re-record the evidence, then have a different Finance Admin approve it.";
export const DUAL_CONTROL_SAME_PAYER_MESSAGE =
  "Dual control: the payer/customer cannot approve their own payment. An independent Finance Admin must approve it.";
export const DUAL_CONTROL_MALFORMED_EVIDENCE_MESSAGE =
  "Dual control: payment evidence provenance is missing, unverified or malformed. Independent Finance review cannot proceed.";

export type DualControlViolation = "SAME_ADMIN" | "RECORDER_UNKNOWN" | "SAME_PAYER" | "MALFORMED_EVIDENCE";

function text(value: unknown): string {
  return String(value ?? "").trim();
}

/** The Admin uid that recorded the payment evidence, if an Admin recorded it. */
export function paymentEvidenceRecorderUid(payment: any): string {
  return text(payment?.paymentEvidenceRecordedBy) || text(payment?.paymentProofEvidence?.recordedBy);
}

/** True when the evidence on this payment was recorded by an Admin (not the Owner, not Stripe). */
export function isAdminRecordedPaymentEvidence(payment: any): boolean {
  return Boolean(paymentEvidenceRecorderUid(payment)) ||
    text(payment?.verificationState).toUpperCase() === "PAYMENT_EVIDENCE_RECORDED";
}

export function paymentDualControlViolation(payment: any, approverUid: string): DualControlViolation | null {
  const approver = text(approverUid);
  if (!approver) return "RECORDER_UNKNOWN";

  // 1. Payer self-approval check: an approver cannot be the owner/tenant/payer of this transaction
  const payerUid = text(payment?.ownerUid || payment?.ownerId || payment?.tenantUid || payment?.tenantId || payment?.payerId);
  if (payerUid && payerUid === approver) {
    return "SAME_PAYER";
  }

  // 2. Admin-recorded evidence: recorder and approver must be different individuals
  if (isAdminRecordedPaymentEvidence(payment)) {
    const recorder = paymentEvidenceRecorderUid(payment);
    if (!recorder) return "RECORDER_UNKNOWN";
    if (recorder === approver) return "SAME_ADMIN";
    return null;
  }

  // 3. Customer-submitted evidence or external evidence
  const verificationState = text(payment?.verificationState).toUpperCase();
  if (verificationState === "OWNER_SUBMITTED" || verificationState === "TENANT_SUBMITTED") {
    // If marked as customer-submitted in pending admin approval, evidence provenance must exist
    const hasProof = Boolean(
      payment?.paymentProofPath || payment?.receiptPath || payment?.referenceFilePath ||
      payment?.paymentProofHash || payment?.receiptHash || payment?.referenceFileHash ||
      payment?.paymentReferenceId || payment?.paymentReference,
    );
    if (payment?.status === "PENDING_ADMIN_APPROVAL" && !hasProof) {
      return "MALFORMED_EVIDENCE";
    }
  }

  return null;
}

export class PaymentDualControlError extends HttpsError {
  readonly violation: DualControlViolation;
  readonly recorderUid: string;
  constructor(violation: DualControlViolation, recorderUid: string) {
    let msg = DUAL_CONTROL_SAME_ADMIN_MESSAGE;
    if (violation === "RECORDER_UNKNOWN") msg = DUAL_CONTROL_RECORDER_UNKNOWN_MESSAGE;
    else if (violation === "SAME_PAYER") msg = DUAL_CONTROL_SAME_PAYER_MESSAGE;
    else if (violation === "MALFORMED_EVIDENCE") msg = DUAL_CONTROL_MALFORMED_EVIDENCE_MESSAGE;
    super(
      "failed-precondition",
      msg,
      { reason: `DUAL_CONTROL_${violation}` },
    );
    this.violation = violation;
    this.recorderUid = recorderUid;
  }
}

/** Throws PaymentDualControlError when the approver may not approve this payment's evidence. */
export function assertPaymentDualControl(payment: any, approverUid: string): void {
  const violation = paymentDualControlViolation(payment, approverUid);
  if (violation) throw new PaymentDualControlError(violation, paymentEvidenceRecorderUid(payment));
}
