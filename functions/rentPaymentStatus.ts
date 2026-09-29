/**
 * Pure rent-payment status decisions.
 * An approved or verified rent row is terminal: approval replays, and rejection
 * must not clear paymentVerified. A rejected row replays rejection and cannot
 * be approved in place.
 */

export type RentPaymentSnapshot = {
  status?: unknown;
  paymentStatus?: unknown;
  paymentVerified?: unknown;
  approved?: unknown;
};

export type RentApprovalDecision = "replay" | "approve" | "refuse_rejected";
export type RentRejectionDecision = "replay" | "reject" | "refuse_approved";

const roleOf = (value: unknown) => String(value ?? "").trim().toLowerCase();

export function rentPaymentPhase(payment: RentPaymentSnapshot): "approved" | "rejected" | "open" {
  const status = roleOf(payment?.status);
  const paymentStatus = roleOf(payment?.paymentStatus);
  if (
    payment?.paymentVerified === true ||
    payment?.approved === true ||
    status === "approved" ||
    paymentStatus === "approved"
  ) {
    return "approved";
  }
  if (status === "rejected" || paymentStatus === "rejected") return "rejected";
  return "open";
}

export function rentApprovalDecision(payment: RentPaymentSnapshot): RentApprovalDecision {
  const phase = rentPaymentPhase(payment);
  if (phase === "approved") return "replay";
  if (phase === "rejected") return "refuse_rejected";
  return "approve";
}

export function rentRejectionDecision(payment: RentPaymentSnapshot): RentRejectionDecision {
  const phase = rentPaymentPhase(payment);
  if (phase === "rejected") return "replay";
  if (phase === "approved") return "refuse_approved";
  return "reject";
}
