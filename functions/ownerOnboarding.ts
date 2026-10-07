import { FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { assertApplicationRecordsOwnedBy, assertNewApplicationIdAllowed } from "./ownerApplicationBinding";
import { assertOwnerOnboardingActionAllowed, resolveOwnerOnboardingState, OWNER_ONBOARDING_LIFECYCLE_VERSION } from "./ownerOnboardingLifecycle";

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

async function writeOwnerProfile(uid: string, email: string, fullName: string, mobile: string, intakeId: string) {
  const userRef = db.collection("users").doc(uid);
  const ownerRef = db.collection("owners").doc(uid);
  await db.runTransaction(async (transaction) => {
    const intakeRef = intakeId ? db.collection("intake_submissions").doc(intakeId) : null;
    const [userSnap, intakeSnap, contractSnap, paymentSnap] = await Promise.all([
      transaction.get(userRef),
      intakeRef ? transaction.get(intakeRef) : Promise.resolve(null),
      intakeId ? transaction.get(db.collection("contracts").doc(intakeId)) : Promise.resolve(null),
      intakeId ? transaction.get(db.collection("payment_transactions").doc(intakeId)) : Promise.resolve(null),
    ]);
    const existing = userSnap.data() || {};
    const existingRole = normalizeRole(existing.role || existing.userRole || existing.primaryRole);
    if (existingRole && !["owner", "pending", "new", "guest"].includes(existingRole)) {
      throw new HttpsError("failed-precondition", "This account is already registered for another role.");
    }
    if (normalizeRole(existing.status) === "active" || existing.dashboardUnlocked === true || (existing.adminApproved === true && existing.paymentVerified === true)) {
      throw new HttpsError("failed-precondition", "This Owner account is already active. Continue from the Owner dashboard.");
    }
    if (intakeRef) {
      if (intakeSnap?.exists) assertApplicationRecordsOwnedBy(uid, { intake: intakeSnap.data() || {} });
      else assertNewApplicationIdAllowed(intakeId, uid);
      assertOwnerOnboardingActionAllowed(resolveOwnerOnboardingState({
        intake: intakeSnap?.exists ? intakeSnap.data() || {} : null,
        contract: contractSnap?.exists ? contractSnap.data() || {} : null,
        payment: paymentSnap?.exists ? paymentSnap.data() || {} : null,
      }), ["DRAFT", "CHANGES_REQUESTED"], "Binding the Owner account to an application");
    }
    const now = serverTimestamp();
    const ownerProfile: Record<string, unknown> = {
      uid,
      email,
      displayName: fullName,
      name: fullName,
      phone: mobile,
      mobile,
      role: "owner",
      status: "pending_property_application",
      onboardingStatus: "FIVE_PAGE_APPLICATION_IN_PROGRESS",
      dashboardLocked: true,
      dashboardUnlocked: false,
      adminApproved: false,
      paymentVerified: false,
      isAdmin: false,
      admin: false,
      onboardingSubmissionId: intakeId || existing.onboardingSubmissionId || "legacy",
      updatedAt: now
    };

    if (!userSnap.exists) ownerProfile.createdAt = now;


    transaction.set(userRef, ownerProfile, { merge: true });
    transaction.set(ownerRef, { ...ownerProfile, ownerUid: uid, ownerEmail: email }, { merge: true });
    if (intakeRef) {
      const binding = { ownerUid: uid, ownerEmail: email, accountCreated: true, accountVerified: true,
        accountCreatedAt: now, workflowVersion: "OWNER_FIVE_PAGE_INSPECTION_FIRST_V1", updatedAt: now };
      if (intakeSnap?.exists) transaction.set(intakeRef, binding, { merge: true });
      else transaction.create(intakeRef, { ...binding, ownerOnboardingState: "DRAFT", ownerOnboardingStateVersion: OWNER_ONBOARDING_LIFECYCLE_VERSION });
    }
    transaction.set(db.collection("audit_logs").doc(), { actorId: uid, actorRole: "owner",
      action: "REGISTER_OWNER_FIVE_PAGE_ACCOUNT", targetType: "users", targetId: uid,
      metadata: { intakeId: intakeId || null, previousRole: existingRole || null }, createdAt: now });
  });
}

export const registerOwnerOnboardingAccount = onCall({ cors: true, enforceAppCheck: true }, async () => {
  throw new HttpsError(
    "failed-precondition",
    "Unauthenticated account creation is disabled. Create and verify the Firebase Auth account, then resume owner onboarding.",
  );
});

// This callable intentionally relies on verified Firebase Auth rather than App Check.
// It is used only after the customer has proved control of the email address and it
// cannot create Auth users or grant an admin role.
export const upsertOwnerOnboardingProfile = onCall({ cors: true, enforceAppCheck: false }, async (request) => {
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
  await assertOwnerCompatible(uid);

  const authUser = await admin.auth().getUser(uid);
  if (authUser.disabled || !authUser.emailVerified || authUser.customClaims?.suspended === true) {
    throw new HttpsError("permission-denied", "The Owner account is inactive or suspended.");
  }
  await writeOwnerProfile(uid, email, fullName, mobile, intakeId);
  await admin.auth().setCustomUserClaims(uid, {
    ...(authUser.customClaims || {}),
    role: "owner",
    userRole: "owner",
    primaryRole: "owner",
    admin: false,
    isAdmin: false,
  });

  return {
    status: "SUCCESS",
    uid,
    role: "owner",
    profileStatus: "pending_property_application",
    workflowVersion: "OWNER_FIVE_PAGE_INSPECTION_FIRST_V1",
    dashboardLocked: true
  };
});
