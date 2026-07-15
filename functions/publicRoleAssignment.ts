import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const PUBLIC_ROLES = new Set(["owner", "tenant", "technician", "broker"]);
const PRIVILEGED_CLAIM_KEYS = ["admin", "isAdmin", "superAdmin", "super_admin", "ceo", "manager"];
const ROLE_CLAIM_KEYS = ["role", "userRole", "primaryRole"];

const normalizeRole = (value: unknown) => String(value || "").trim().toLowerCase();

function initialStatus(role: string) {
  if (role === "owner") return "pending_admin_approval";
  if (role === "tenant") return "pending_invitation";
  if (role === "technician") return "pending_approval";
  return "pending_kyc";
}

export const assignPublicPortalRole = onCall({
  cors: true,
  region: "europe-west3",
}, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in before selecting a portal role.");
  }

  const role = normalizeRole(request.data?.role);
  if (!PUBLIC_ROLES.has(role)) {
    throw new HttpsError("invalid-argument", "Only public portal roles may be selected.");
  }

  const uid = request.auth.uid;
  const userRecord = await admin.auth().getUser(uid);
  const currentClaims = userRecord.customClaims || {};
  const claimedRole = normalizeRole(
    currentClaims.role || currentClaims.userRole || currentClaims.primaryRole,
  );

  if (PRIVILEGED_CLAIM_KEYS.some((key) => currentClaims[key] === true)) {
    throw new HttpsError("failed-precondition", "Privileged accounts cannot use public role selection.");
  }
  if (claimedRole && claimedRole !== role) {
    throw new HttpsError("failed-precondition", "A portal role is already assigned to this account.");
  }

  const profileRef = db.collection("users").doc(uid);
  const status = initialStatus(role);
  await db.runTransaction(async (transaction) => {
    const profileSnap = await transaction.get(profileRef);
    const profile = profileSnap.data() || {};
    const profileRole = normalizeRole(profile.role || profile.userRole || profile.primaryRole);
    if (profileRole && profileRole !== role) {
      throw new HttpsError("failed-precondition", "A different portal role is already assigned.");
    }
    if (
      profile.admin === true ||
      profile.isAdmin === true ||
      profile.superAdmin === true ||
      profile.super_admin === true
    ) {
      throw new HttpsError("failed-precondition", "Privileged profiles cannot use public role selection.");
    }

    transaction.set(profileRef, {
      uid,
      email: String(request.auth?.token?.email || profile.email || "").trim().toLowerCase(),
      role,
      status,
      onboardingComplete: false,
      roleAssignedAt: FieldValue.serverTimestamp(),
      roleAssignmentSource: "PUBLIC_ROLE_ASSIGNMENT_CALLABLE",
      updatedAt: FieldValue.serverTimestamp(),
      ...(profileSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
    transaction.set(db.collection("audit_logs").doc(), {
      actorId: uid,
      actorRole: role,
      action: "PUBLIC_PORTAL_ROLE_ASSIGNED",
      targetType: "users",
      targetId: uid,
      status,
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  const nextClaims = { ...currentClaims };
  for (const key of ROLE_CLAIM_KEYS) delete nextClaims[key];
  await admin.auth().setCustomUserClaims(uid, { ...nextClaims, role });

  return {
    ok: true,
    role,
    status,
    tokenRefreshRequired: true,
  };
});
