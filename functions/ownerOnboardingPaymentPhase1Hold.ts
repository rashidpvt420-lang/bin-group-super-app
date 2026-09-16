import { HttpsError, onCall } from "firebase-functions/v2/https";

const PHASE1_OWNER_PAYMENT_METHODS = new Set(["CASH", "CHEQUE"]);

/**
 * Fail-closed compatibility endpoint for the retired pre-inspection Owner payment flow.
 *
 * Phase 1 Owner acquisition is inspection-first. Mobilisation payment is recorded only
 * after every required property inspection through adminRecordOwnerMobilizationPaymentEvidence.
 * Keep the historical callable name deployed only as a protected hold so stale clients cannot
 * revive Bank Transfer, Card/Stripe, client-authoritative amounts, or pre-inspection payment.
 */
export const submitOwnerOnboardingPaymentPackage = onCall(
  { cors: true, enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Owner authentication is required.");
    }
    if (request.auth.token?.email_verified !== true || request.auth.token?.suspended === true) {
      throw new HttpsError("permission-denied", "A verified, active Owner account is required.");
    }

    const method = String(request.data?.paymentMethod || request.data?.paymentManifest?.method || "")
      .trim()
      .toUpperCase();
    if (!PHASE1_OWNER_PAYMENT_METHODS.has(method)) {
      throw new HttpsError(
        "invalid-argument",
        "Phase 1 Owner activation accepts Cash or Cheque only.",
      );
    }

    throw new HttpsError(
      "failed-precondition",
      "This pre-inspection Owner payment flow is retired. Complete the inspection-first onboarding workflow before Admin records mobilisation payment evidence.",
    );
  },
);
