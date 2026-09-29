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
export type RentConfirmedAmountDecision = "match" | "mismatch" | "invalid";

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

const parseDecimalStringToFils = (text: string): number | null => {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;
  const sign = match[1] === "-" ? -1 : 1;
  const whole = BigInt(match[2]);
  const fraction = match[3] ?? "";
  let fils = whole * 100n;
  if (fraction.length === 1) fils += BigInt(fraction) * 10n;
  else if (fraction.length >= 2) {
    fils += BigInt(fraction.slice(0, 2));
    if (fraction.length > 2 && fraction[2] >= "5") fils += 1n;
  }
  const signed = sign < 0 ? -fils : fils;
  if (signed > BigInt(Number.MAX_SAFE_INTEGER) || signed < BigInt(Number.MIN_SAFE_INTEGER)) return null;
  return Number(signed);
};

/**
 * Convert an AED amount to integer fils. Strings are parsed in decimal so
 * "1234.50" and 1234.5 are the same 123450 fils. The comparison itself is
 * integer equality, with no dirham tolerance.
 */
export function aedToFils(value: unknown): number | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return parseDecimalStringToFils(trimmed);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Object.is(value, -0) ? 0 : value;
  const text = normalized.toString();
  const fractionLength = text.includes(".") && !/[eE]/.test(text) ? text.split(".")[1].length : 0;
  if (!/[eE]/.test(text) && fractionLength <= 2) return parseDecimalStringToFils(text);
  const fils = Math.round(normalized * 100);
  return Number.isSafeInteger(fils) ? fils : null;
}

export function decideRentConfirmedAmount(submitted: unknown, confirmed: unknown): RentConfirmedAmountDecision {
  const submittedFils = aedToFils(submitted);
  const confirmedFils = aedToFils(confirmed);
  if (submittedFils === null || confirmedFils === null) return "invalid";
  return submittedFils === confirmedFils ? "match" : "mismatch";
}
