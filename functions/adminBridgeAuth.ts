import { onCall, HttpsError } from "firebase-functions/v2/https";

// N-30: RETIRED. This callable used to mint a Firebase custom token for any caller holding an
// admin/staff claim so a second origin could signInWithCustomToken. A custom-token session has
// no second factor, so the bridge let a password-only session become an Admin session without
// MFA. No client calls it any more (the Admin Command Center is in-app at /admin/*; see
// scripts/verify-admin-dashboard-access.mjs). The export is kept, hard-disabled, so an existing
// deployment is replaced by a function that refuses instead of being left running on an old
// revision. It never mints a token.
export const mintAdminBridgeToken = onCall({
  cors: true,
  region: "europe-west3",
  enforceAppCheck: true,
  consumeAppCheckToken: true,
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign-in required.");
  }
  throw new HttpsError(
    "failed-precondition",
    "The admin bridge token is retired. Open the Admin Command Center at /admin and sign in with email/password + MFA.",
  );
});
