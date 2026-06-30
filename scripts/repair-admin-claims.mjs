import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp({
  credential: applicationDefault(),
  projectId: "bin-group-57c60",
});

const uid = "X8gbUpPrCqagLZ54Ufmzju9kaUi1";
const email = "ceo@bin-groups.com";

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
