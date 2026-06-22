import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

// Lets the main app, once a user is already signed in, exchange that session
// for a Firebase custom token the separate admin-panel origin can redeem via
// signInWithCustomToken. This removes the second manual login step on the
// cross-domain admin redirect without granting any new privilege: it only
// re-asserts the caller's own uid, so the admin-panel's own role/claims gate
// still decides whether that identity is allowed in.
export const mintAdminBridgeToken = onCall({ cors: true, region: "europe-west3" }, async (request) => {
  const authContext = request.auth;
  if (!authContext) {
    throw new HttpsError("unauthenticated", "Sign-in required before bridging to the admin panel.");
  }

  const token = await admin.auth().createCustomToken(authContext.uid);
  return { token };
});
