export type OwnerRegistrationPaymentMethod = "CASH" | "CHEQUE";

const OWNER_REGISTRATION_PAYMENT_METHODS = new Set<OwnerRegistrationPaymentMethod>(["CASH", "CHEQUE"]);

/** Owner registration accepts Cash or Cheque. Stripe and bank transfer are rejected. */
export function phase1OwnerActivationMethodOrNull(method: unknown): OwnerRegistrationPaymentMethod | null {
  const normalized = String(method ?? "").trim().toUpperCase();
  return OWNER_REGISTRATION_PAYMENT_METHODS.has(normalized as OwnerRegistrationPaymentMethod)
    ? normalized as OwnerRegistrationPaymentMethod
    : null;
}
