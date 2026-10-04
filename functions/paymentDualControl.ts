import { HttpsError } from "firebase-functions/v2/https";

/**
 * D-5: four-eyes control on Admin-recorded payment evidence.
 *
 * When a Finance Admin records manual 15% mobilisation payment evidence for an Owner
 * (adminRecordOwnerMobilizationPaymentEvidence), the same Admin must not also approve that
 * payment (adminApprovePayment): one person could otherwise both claim money arrived and
 * activate the contract on that claim. Approval must come from a different Admin.
 *
 * Evidence submitted by the Owner (createOwnerPaymentTransaction / registration) carries no
 * Admin recorder and is unaffected; Stripe-verified payments are unaffected.
 */
export const DUAL_CONTROL_SAME_ADMIN_MESSAGE =
  "Dual control: this payment evidence was recorded by you. A different Finance Admin must approve it.";
export const DUAL_CONTROL_RECORDER_UNKNOWN_MESSAGE =
  "Dual control: this Admin-recorded payment evidence has no recorded Admin, so the approval cannot prove a second reviewer. Re-record the evidence, then have a different Finance Admin approve it.";

export type DualControlViolation = "SAME_ADMIN" | "RECORDER_UNKNOWN";

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
  if (!isAdminRecordedPaymentEvidence(payment)) return null;
  const recorder = paymentEvidenceRecorderUid(payment);
  if (!recorder) return "RECORDER_UNKNOWN";
  if (recorder === text(approverUid)) return "SAME_ADMIN";
  return null;
}

export class PaymentDualControlError extends HttpsError {
  readonly violation: DualControlViolation;
  readonly recorderUid: string;
  constructor(violation: DualControlViolation, recorderUid: string) {
    super(
      "failed-precondition",
      violation === "SAME_ADMIN" ? DUAL_CONTROL_SAME_ADMIN_MESSAGE : DUAL_CONTROL_RECORDER_UNKNOWN_MESSAGE,
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
