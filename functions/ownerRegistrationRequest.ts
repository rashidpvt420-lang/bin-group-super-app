import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;

function cleanText(value: unknown, label: string, maxLength: number) {
  const output = String(value || "").trim();
  if (!output) throw new HttpsError("invalid-argument", `${label} is required.`);
  if (output.length > maxLength) throw new HttpsError("invalid-argument", `${label} is too long.`);
  return output;
}

function cleanEmail(value: unknown) {
  const email = cleanText(value, "Email", 160).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpsError("invalid-argument", "Valid email is required.");
  return email;
}

function cleanMobile(value: unknown) {
  const mobile = cleanText(value, "Mobile", 40).replace(/[^0-9+]/g, "");
  if (mobile.length < 8) throw new HttpsError("invalid-argument", "Valid mobile number is required.");
  return mobile;
}

function cleanReference(value: unknown) {
  const ref = String(value || "").trim();
  if (!ref) return "";
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(ref)) throw new HttpsError("invalid-argument", "Invalid onboarding reference.");
  return ref;
}

export const submitPendingOwnerRegistration = onCall({ cors: true }, async (request) => {
  const fullName = cleanText(request.data?.fullName, "Full name", 120);
  const email = cleanEmail(request.data?.email);
  const mobile = cleanMobile(request.data?.mobile);
  const intakeId = cleanReference(request.data?.intakeId || request.data?.onboardingSubmissionId);
  const registrationId = intakeId || db.collection("owner_registration_requests").doc().id;
  const timestamp = serverTimestamp();

  const registration = {
    id: registrationId,
    fullName,
    displayName: fullName,
    email,
    mobile,
    phone: mobile,
    role: "owner_pending",
    requestedRole: "owner",
    status: "pending_admin_approval",
    dashboardLocked: true,
    dashboardUnlocked: false,
    adminApproved: false,
    paymentVerified: false,
    accountCreated: false,
    accountCreationStatus: "PENDING_ADMIN_PROVISIONING",
    updatedAt: timestamp
  };

  const batch = db.batch();
  batch.set(db.collection("owner_registration_requests").doc(registrationId), {
    ...registration,
    createdAt: timestamp
  }, { merge: true });
  batch.set(db.collection("pending_owners").doc(registrationId), {
    ...registration,
    pendingOwnerId: registrationId,
    createdAt: timestamp
  }, { merge: true });

  if (intakeId) {
    batch.set(db.collection("intake_submissions").doc(intakeId), {
      ownerRegistrationId: registrationId,
      ownerName: fullName,
      ownerEmail: email,
      ownerMobile: mobile,
      accountCreated: false,
      accountCreationStatus: "PENDING_ADMIN_PROVISIONING",
      status: "PENDING_OWNER_APPROVAL",
      updatedAt: timestamp
    }, { merge: true });
  }

  batch.set(db.collection("audit_logs").doc(), {
    actorId: registrationId,
    actorRole: "owner_pending",
    action: "SUBMIT_PENDING_OWNER_REGISTRATION",
    targetType: "owner_registration_requests",
    targetId: registrationId,
    metadata: { intakeId: intakeId || null, email },
    createdAt: timestamp
  });

  await batch.commit();

  return {
    status: "SUCCESS",
    uid: registrationId,
    ownerRegistrationId: registrationId,
    email,
    role: "owner_pending",
    profileStatus: "pending_admin_approval",
    dashboardLocked: true
  };
});
