import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp({
  credential: applicationDefault(),
  projectId: "bin-group-57c60",
});

const uid = "PASTE_ADMIN_UID_HERE";
const email = "PASTE_ADMIN_EMAIL_HERE";

if (uid === "PASTE_ADMIN_UID_HERE" || email === "PASTE_ADMIN_EMAIL_HERE") {
  console.error("ERROR: Please open scripts/repair-admin-claims.mjs and replace PASTE_ADMIN_UID_HERE and PASTE_ADMIN_EMAIL_HERE with your real values.");
  process.exit(1);
}

try {
  await getAuth().setCustomUserClaims(uid, {
    role: "super_admin",
    userRole: "super_admin",
    primaryRole: "super_admin",
    admin: true,
    isAdmin: true,
    ceo: true,
  });

  await getFirestore().doc(`users/${uid}`).set({
    uid,
    email: email.toLowerCase(),
    role: "super_admin",
    userRole: "super_admin",
    primaryRole: "super_admin",
    isAdmin: true,
    admin: true,
    ceo: true,
    adminApproved: true,
    onboardingComplete: true,
    status: "ACTIVE",
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  console.log("SUCCESS! Admin repaired:", uid, email);
  console.log("You can now log in to the admin panel.");
} catch (error) {
  console.error("Failed to repair admin:", error);
}
