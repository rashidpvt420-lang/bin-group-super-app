import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { submitBrokerPayoutRequest as legacySubmitBrokerPayoutRequest } from "./profileP1Workflows";

if (!admin.apps.length) admin.initializeApp();

const MAX_PAYOUT_AUTH_AGE_SECONDS = 10 * 60;

function numericDateSeconds(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function brokerPayoutMfaState(token: Record<string, any>, nowSeconds = Math.floor(Date.now() / 1000)) {
  const firebaseClaims = token.firebase || {};
  const secondFactor = String(
    firebaseClaims.sign_in_second_factor ||
    token.sign_in_second_factor ||
    token.mfa_factor ||
    "",
  ).trim();
  const authTime = numericDateSeconds(token.auth_time);
  const authAgeSeconds = authTime === null ? Number.POSITIVE_INFINITY : Math.max(0, nowSeconds - authTime);

  return {
    secondFactor,
    authTime,
    authAgeSeconds,
    mfaVerified: Boolean(secondFactor),
    recentlyAuthenticated: authAgeSeconds <= MAX_PAYOUT_AUTH_AGE_SECONDS,
  };
}

async function assertBrokerPayoutMfa(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Broker login required.");

  const userRecord = await admin.auth().getUser(auth.uid);
  if (userRecord.disabled || userRecord.customClaims?.suspended === true) {
    throw new HttpsError("permission-denied", "This Broker account is disabled or suspended.");
  }

  const state = brokerPayoutMfaState(auth.token || {});
  if (!state.mfaVerified) {
    throw new HttpsError(
      "failed-precondition",
      "Multi-factor authentication is required before requesting a Broker payout.",
      { code: "BROKER_PAYOUT_MFA_REQUIRED" },
    );
  }
  if (!state.recentlyAuthenticated) {
    throw new HttpsError(
      "failed-precondition",
      "Reauthenticate with your second factor before requesting a Broker payout.",
      {
        code: "BROKER_PAYOUT_RECENT_AUTH_REQUIRED",
        maxAuthAgeSeconds: MAX_PAYOUT_AUTH_AGE_SECONDS,
      },
    );
  }
}

export const submitBrokerPayoutRequest = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    await assertBrokerPayoutMfa(request.auth);
    if (typeof legacySubmitBrokerPayoutRequest?.run !== "function") {
      throw new HttpsError("internal", "Broker payout handler is unavailable.");
    }
    return legacySubmitBrokerPayoutRequest.run(request);
  },
);
