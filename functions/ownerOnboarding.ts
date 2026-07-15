import { FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const serverTimestamp = FieldValue.serverTimestamp;

function cleanText(value: unknown, fieldName: string, maxLength: number) {
  const text = String(value || "").trim();
  if (!text) throw new HttpsError("invalid-argument", `${fieldName} is required.`);
  if (text.length > maxLength) throw new HttpsError("invalid-argument", `${fieldName} is too long.`);
  return text;
}

function cleanPhone(value: unknown) {
  const text = cleanText(value, "Mobile", 40).replace(/[^0-9+]/g, "");
  if (text.length < 8) throw new HttpsError("invalid-argument", "Valid mobile number is required.");
  return text;
}

function cleanOptionalId(value: unknown) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(text)) {
    throw new HttpsError("invalid-argument", "Invalid onboarding reference.");
  }
  return text;
}

function normalizeRole(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

async function assertOwnerCompatible(uid: string) {
  const existingSnap = await db.collection("users").doc(uid).get();
  const existing = existingSnap.data() || {};
  const existingRole = normalizeRole(existing.role || existing.userRole || existing.primaryRole);
  if (existingRole && !["owner", "pending", "new", "guest"].includes(existingRole)) {
    throw new HttpsError("failed-precondition", `This account is already registered as ${existingRole}. Use another email for owner onboarding.`);
  }
  return { existingSnap, existing, existingRole };
}

async function writeOwnerProfile(uid: string, email: string, fullName: string, mobile: string, intakeId: string, existing: Record<string, unknown>, existingSnapExists: boolean, existingRole: string | null) {
  const userRef = db.collection("users").doc(uid);
  const ownerRef = db.collection("owners").doc(uid);
  const now = serverTimestamp();
  const ownerProfile: Record<string, unknown> = {
    uid,
    email,
    displayName: fullName,
    name: fullName,
    phone: mobile,
    mobile,
    role: "owner",
    status: "pending_admin_approval",
    dashboardLocked: true,
    dashboardUnlocked: false,
    adminApproved: false,
    paymentVerified: false,
    isAdmin: false,
    admin: false,
    onboardingSubmissionId: intakeId || existing.onboardingSubmissionId || "legacy",
    updatedAt: now
  };

  if (!existingSnapExists) {
    ownerProfile.createdAt = now;
  }

  const batch = db.batch();
  batch.set(userRef, ownerProfile, { merge: true });
  batch.set(ownerRef, { ...ownerProfile, ownerUid: uid, ownerEmail: email }, { merge: true });

  if (intakeId) {
    batch.set(db.collection("intake_submissions").doc(intakeId), {
      ownerUid: uid,
      ownerEmail: email,
      accountCreated: true,
      accountCreatedAt: now,
      updatedAt: now
    }, { merge: true });
  }

  batch.set(db.collection("audit_logs").doc(), {
    actorId: uid,
    actorRole: "owner",
    action: "REGISTER_OWNER_ONBOARDING_ACCOUNT",
    targetType: "users",
    targetId: uid,
    metadata: { intakeId: intakeId || null, previousRole: existingRole || null },
    createdAt: now
  });

  await batch.commit();
}

export const registerOwnerOnboardingAccount = onCall({ cors: true, enforceAppCheck: true }, async () => {
  throw new HttpsError(
    "failed-precondition",
    "Unauthenticated account creation is disabled. Create and verify the Firebase Auth account, then resume owner onboarding.",
  );
});

export const upsertOwnerOnboardingProfile = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Owner authentication required.");

  const uid = request.auth.uid;
  const tokenRole = normalizeRole(
    request.auth.token?.role ||
    request.auth.token?.userRole ||
    request.auth.token?.primaryRole,
  );
  if (tokenRole && tokenRole !== "owner") {
    throw new HttpsError("failed-precondition", `This account is already registered as ${tokenRole}.`);
  }
  if (request.auth.token?.email_verified !== true) {
    throw new HttpsError("failed-precondition", "Verify the account email before creating an owner profile.");
  }
  const tokenEmail = String(request.auth.token?.email || "").trim().toLowerCase();
  const email = String(request.data?.email || tokenEmail).trim().toLowerCase();
  if (!tokenEmail || email !== tokenEmail) {
    throw new HttpsError("permission-denied", "Profile email must match the authenticated account.");
  }

  const fullName = cleanText(request.data?.fullName, "Full name", 120);
  const mobile = cleanPhone(request.data?.mobile);
  const intakeId = cleanOptionalId(request.data?.intakeId || request.data?.onboardingSubmissionId);
  const { existingSnap, existing, existingRole } = await assertOwnerCompatible(uid);

  const authUser = await admin.auth().getUser(uid);
  await admin.auth().setCustomUserClaims(uid, {
    ...(authUser.customClaims || {}),
    role: "owner",
    userRole: "owner",
    primaryRole: "owner",
    admin: false,
    isAdmin: false,
  });
  await writeOwnerProfile(uid, email, fullName, mobile, intakeId, existing, existingSnap.exists, existingRole || null);

  return {
    status: "SUCCESS",
    uid,
    role: "owner",
    profileStatus: "pending_admin_approval",
    dashboardLocked: true
  };
});