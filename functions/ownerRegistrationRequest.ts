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
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(ref)) throw new HttpsError("invalid-argument", "Invalid onboarding reference.");
  return ref;
}

function cleanPlainValue(value: any): any {
  if (value === undefined) return null;
  if (value === null) return null;
  if (value instanceof admin.firestore.FieldValue) return value;
  if (value instanceof admin.firestore.Timestamp) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(cleanPlainValue);
  if (typeof value === "object") {
    const output: any = {};
    Object.entries(value).forEach(([key, entry]) => {
      if (typeof entry !== "function") output[key] = cleanPlainValue(entry);
    });
    return output;
  }
  return value;
}

function extractPendingPaymentPackage(data: any) {
  const paymentSubmission = data?.paymentSubmission;
  if (!paymentSubmission || typeof paymentSubmission !== "object" || Array.isArray(paymentSubmission)) return null;

  const payment = paymentSubmission.payment || {};
  const method = String(payment.method || "").trim();
  if (!method) throw new HttpsError("invalid-argument", "Payment method is required.");

  return cleanPlainValue({
    ...paymentSubmission,
    payment: {
      ...payment,
      method,
      state: "PAYMENT_PENDING",
      verificationState: "ADMIN_VERIFICATION_REQUIRED"
    },
    paymentStatus: "PENDING",
    adminReviewState: "AWAITING_VERIFICATION",
    activationState: "LOCKED_PENDING_ADMIN_APPROVAL",
    submittedAt: serverTimestamp()
  });
}

export const submitPendingOwnerRegistration = onCall({ cors: true }, async (request) => {
  const fullName = cleanText(request.data?.fullName, "Full name", 120);
  const email = cleanEmail(request.data?.email);
  const mobile = cleanMobile(request.data?.mobile);
  const intakeId = cleanReference(request.data?.intakeId || request.data?.onboardingSubmissionId);
  const registrationId = cleanReference(request.data?.ownerRegistrationId || request.data?.pendingOwnerId) || intakeId || db.collection("owner_registration_requests").doc().id;
  const timestamp = serverTimestamp();
  const pendingPaymentPackage = extractPendingPaymentPackage(request.data);

  const registration = {
    id: registrationId,
    fullName,
    displayName: fullName,
    email,
    mobile,
    phone: mobile,
    role: "owner_pending",
    requestedRole: "owner",
    status: pendingPaymentPackage ? "payment_pending_admin_verification" : "pending_admin_approval",
    dashboardLocked: true,
    dashboardUnlocked: false,
    adminApproved: false,
    paymentVerified: false,
    accountCreated: false,
    accountCreationStatus: "PENDING_ADMIN_PROVISIONING",
    latestIntakeId: intakeId || registrationId,
    updatedAt: timestamp
  };

  const batch = db.batch();
  batch.set(db.collection("owner_registration_requests").doc(registrationId), {
    ...registration,
    ...(pendingPaymentPackage ? { latestPaymentSubmission: pendingPaymentPackage } : {}),
    createdAt: timestamp
  }, { merge: true });
  batch.set(db.collection("pending_owners").doc(registrationId), {
    ...registration,
    pendingOwnerId: registrationId,
    ...(pendingPaymentPackage ? { latestPaymentSubmission: pendingPaymentPackage } : {}),
    createdAt: timestamp
  }, { merge: true });

  if (intakeId || pendingPaymentPackage) {
    const intakeRef = db.collection("intake_submissions").doc(intakeId || registrationId);
    batch.set(intakeRef, {
      intakeId: intakeId || registrationId,
      ownerRegistrationId: registrationId,
      pendingOwnerId: registrationId,
      ownerName: fullName,
      ownerEmail: email,
      ownerMobile: mobile,
      accountCreated: false,
      accountCreationStatus: "PENDING_ADMIN_PROVISIONING",
      status: pendingPaymentPackage ? "AWAITING_VERIFICATION" : "PENDING_OWNER_APPROVAL",
      paymentStatus: pendingPaymentPackage ? "PENDING" : "NOT_SUBMITTED",
      adminReviewState: pendingPaymentPackage ? "AWAITING_VERIFICATION" : "PENDING_OWNER_DETAILS",
      ...(pendingPaymentPackage ? { pendingPaymentSubmission: pendingPaymentPackage } : {}),
      updatedAt: timestamp
    }, { merge: true });
  }

  batch.set(db.collection("audit_logs").doc(), {
    actorId: registrationId,
    actorRole: "owner_pending",
    action: pendingPaymentPackage ? "SUBMIT_PENDING_OWNER_PAYMENT_PACKAGE" : "SUBMIT_PENDING_OWNER_REGISTRATION",
    targetType: "owner_registration_requests",
    targetId: registrationId,
    metadata: { intakeId: intakeId || null, email, paymentPackageSubmitted: Boolean(pendingPaymentPackage) },
    createdAt: timestamp
  });

  await batch.commit();

  return {
    status: pendingPaymentPackage ? "PENDING_PAYMENT_VERIFICATION" : "SUCCESS",
    uid: registrationId,
    ownerRegistrationId: registrationId,
    intakeId: intakeId || registrationId,
    email,
    role: "owner_pending",
    profileStatus: pendingPaymentPackage ? "payment_pending_admin_verification" : "pending_admin_approval",
    dashboardLocked: true
  };
});