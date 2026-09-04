import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";

const PHASE1_PAYMENT_MESSAGE =
  "Phase 1 payment methods are Cash and Cheque only. Bank Transfer and Card/Stripe are unavailable.";

/**
 * Compatibility endpoint retained so stale clients fail with an explicit policy
 * response instead of silently re-enabling Stripe when credentials drift into
 * the environment. This callable intentionally binds no Stripe secrets.
 */
export const createStripeCheckoutSession = onCall(
  { cors: true, enforceAppCheck: true },
  async () => {
    throw new HttpsError("failed-precondition", PHASE1_PAYMENT_MESSAGE);
  },
);

/**
 * Phase 1 does not accept Stripe events. The historical Stripe implementation
 * remains in source for a separately reviewed future policy migration, but it is
 * not deployed from the production runtime while PHASE1_CASH_CHEQUE_V1 is active.
 */
export const stripeWebhook = onRequest({ cors: true }, async (_request, response) => {
  response.status(410).json({
    received: false,
    provider: "STRIPE",
    state: "DISABLED",
    policy: "PHASE1_CASH_CHEQUE_V1",
    message: PHASE1_PAYMENT_MESSAGE,
  });
});
