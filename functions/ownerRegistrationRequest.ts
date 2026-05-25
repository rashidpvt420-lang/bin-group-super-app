import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { generateContractPDF } from "./pdfEngine";

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

function cleanPassword(value: unknown) {
  const password = String(value || "");
  if (!password) return "";
  if (password.length < 8) throw new HttpsError("invalid-argument", "Password must be at least 8 characters.");
  if (password.length > 128) throw new HttpsError("invalid-argument", "Password is too long.");
  return password;
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

function cleanMoney(value: unknown, label: string, required = false) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    if (required) throw new HttpsError("invalid-argument", `${label} must be a valid positive amount.`);
    return 0;
  }
  return Math.round(amount);
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

function assertAuthenticatedOwner(request: any, ownerUid: string, ownerEmail: string) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Owner authentication required.");
  }

  const callerUid = String(request.auth.uid || "").trim();
  const tokenEmail = String(request.auth.token?.email || "").trim().toLowerCase();

  if (!callerUid || callerUid !== ownerUid) {
    throw new HttpsError("permission-denied", "Owner UID does not match the authenticated account.");
  }

  if (tokenEmail && ownerEmail !== tokenEmail) {
    throw new HttpsError("permission-denied", "Owner email does not match the authenticated account.");
  }
}

async function resolveOrCreateOwnerAuth(email: string, password: string, fullName: string) {
  if (!password) {
    return { uid: "", accountCreated: false, accountCreationStatus: "PENDING_ADMIN_PROVISIONING" };
  }

  try {
    const existing = await admin.auth().getUserByEmail(email);
    const existingProfile = await db.collection("users").doc(existing.uid).get();
    const existingRole = String(existingProfile.data()?.role || "").toLowerCase();
    if (existingRole && !["owner", "owner_pending"].includes(existingRole)) {
      throw new HttpsError("failed-precondition", "This email is already registered with another role. Use another email.");
    }
    return { uid: existing.uid, accountCreated: false, accountCreationStatus: "EXISTING_AUTH_LINKED" };
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    if (error?.code !== "auth/user-not-found") {
      console.error("Owner auth lookup failed:", error);
      throw new HttpsError("internal", "Owner auth lookup failed.");
    }
  }

  try {
    const created = await admin.auth().createUser({
      email,
      password,
      displayName: fullName,
      disabled: false,
      emailVerified: false
    });
    return { uid: created.uid, accountCreated: true, accountCreationStatus: "AUTH_CREATED" };
  } catch (error: any) {
    console.error("Owner auth creation failed:", error);
    if (error?.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists", "This email already exists. Please sign in or use another email.");
    }
    if (error?.code === "auth/invalid-password") {
      throw new HttpsError("invalid-argument", "Password must be at least 8 characters.");
    }
    throw new HttpsError("internal", "Owner auth account could not be provisioned.");
  }
}

export const submitPendingOwnerRegistration = onCall({ cors: true }, async (request) => {
  const fullName = cleanText(request.data?.fullName, "Full name", 120);
  const email = cleanEmail(request.data?.email);
  const mobile = cleanMobile(request.data?.mobile);
  const password = cleanPassword(request.data?.password);
  const intakeId = cleanReference(request.data?.intakeId || request.data?.onboardingSubmissionId);
  const requestedOwnerUid = cleanReference(request.data?.ownerUid || request.data?.uid);
  const authProvision = await resolveOrCreateOwnerAuth(email, password, fullName);
  const registrationId = authProvision.uid || requestedOwnerUid || cleanReference(request.data?.ownerRegistrationId || request.data?.pendingOwnerId) || intakeId || db.collection("owner_registration_requests").doc().id;
  const timestamp = serverTimestamp();
  const pendingPaymentPackage = extractPendingPaymentPackage(request.data);

  const registration = {
    id: registrationId,
    uid: authProvision.uid || registrationId,
    fullName,
    displayName: fullName,
    email,
    mobile,
    phone: mobile,
    role: authProvision.uid ? "owner" : "owner_pending",
    requestedRole: "owner",
    status: pendingPaymentPackage ? "payment_pending_admin_verification" : "pending_admin_approval",
    dashboardLocked: true,
    dashboardUnlocked: false,
    adminApproved: false,
    paymentVerified: false,
    accountCreated: Boolean(authProvision.uid),
    accountCreationStatus: authProvision.accountCreationStatus,
    latestIntakeId: intakeId || registrationId,
    updatedAt: timestamp
  };

  const batch = db.batch();

  if (authProvision.uid) {
    batch.set(db.collection("users").doc(authProvision.uid), {
      uid: authProvision.uid,
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
      onboardingSubmissionId: intakeId || registrationId,
      latestIntakeId: intakeId || registrationId,
      accountCreationStatus: authProvision.accountCreationStatus,
      updatedAt: timestamp,
      createdAt: timestamp
    }, { merge: true });
  }

  batch.set(db.collection("owner_registration_requests").doc(registrationId), {
    ...registration,
    ...(pendingPaymentPackage ? { latestPaymentSubmission: pendingPaymentPackage } : {}),
    createdAt: timestamp
  }, { merge: true });
  batch.set(db.collection("pending_owners").doc(registrationId), {
    ...registration,
    pendingOwnerId: registrationId,
    ownerUid: authProvision.uid || registrationId,
    ...(pendingPaymentPackage ? { latestPaymentSubmission: pendingPaymentPackage } : {}),
    createdAt: timestamp
  }, { merge: true });

  if (intakeId || pendingPaymentPackage) {
    const intakeRef = db.collection("intake_submissions").doc(intakeId || registrationId);
    batch.set(intakeRef, {
      intakeId: intakeId || registrationId,
      ownerRegistrationId: registrationId,
      pendingOwnerId: registrationId,
      ownerUid: authProvision.uid || registrationId,
      ownerName: fullName,
      ownerEmail: email,
      ownerMobile: mobile,
      accountCreated: Boolean(authProvision.uid),
      accountCreationStatus: authProvision.accountCreationStatus,
      status: pendingPaymentPackage ? "AWAITING_VERIFICATION" : "PENDING_OWNER_APPROVAL",
      paymentStatus: pendingPaymentPackage ? "PENDING" : "NOT_SUBMITTED",
      adminReviewState: pendingPaymentPackage ? "AWAITING_VERIFICATION" : "PENDING_OWNER_DETAILS",
      ...(pendingPaymentPackage ? { pendingPaymentSubmission: pendingPaymentPackage } : {}),
      updatedAt: timestamp
    }, { merge: true });
  }

  batch.set(db.collection("audit_logs").doc(), {
    actorId: authProvision.uid || registrationId,
    actorRole: authProvision.uid ? "owner" : "owner_pending",
    action: pendingPaymentPackage ? "SUBMIT_PENDING_OWNER_PAYMENT_PACKAGE" : "SUBMIT_PENDING_OWNER_REGISTRATION",
    targetType: "owner_registration_requests",
    targetId: registrationId,
    metadata: { intakeId: intakeId || null, email, authUid: authProvision.uid || null, paymentPackageSubmitted: Boolean(pendingPaymentPackage) },
    createdAt: timestamp
  });

  await batch.commit();

  return {
    status: pendingPaymentPackage ? "PENDING_PAYMENT_VERIFICATION" : "SUCCESS",
    uid: authProvision.uid || registrationId,
    ownerUid: authProvision.uid || registrationId,
    ownerRegistrationId: registrationId,
    intakeId: intakeId || registrationId,
    email,
    role: authProvision.uid ? "owner" : "owner_pending",
    accountCreated: Boolean(authProvision.uid),
    accountCreationStatus: authProvision.accountCreationStatus,
    profileStatus: pendingPaymentPackage ? "payment_pending_admin_verification" : "pending_admin_approval",
    dashboardLocked: true
  };
});

export const submitOwnerOnboardingPaymentPackage = onCall({ cors: true }, async (request) => {
  const data = request.data || {};
  const ownerUid = cleanText(data.ownerUid, "ownerUid", 120);
  const ownerEmail = cleanEmail(data.ownerEmail);
  assertAuthenticatedOwner(request, ownerUid, ownerEmail);

  const intakeId = cleanText(data.intakeId, "intakeId", 120);
  const onboardingSessionId = cleanText(data.onboardingSessionId, "onboardingSessionId", 120);
  const paymentMethod = cleanText(data.paymentMethod, "paymentMethod", 60);
  const amount = cleanMoney(data.amount, "Payment amount", true);
  const activationDeposit = cleanMoney(data.activationDeposit || data.amount, "Activation deposit", true);
  const annualContractValue = cleanMoney(data.annualContractValue || amount, "Annual contract value");
  const companyProfile = cleanPlainValue(data.companyProfile || {});
  const serviceDetails = cleanPlainValue(data.serviceDetails || {});
  const documentUrls = cleanPlainValue(data.documentUrls || {});
  const paymentManifest = cleanPlainValue(data.paymentManifest || {});
  const properties = cleanPlainValue(data.properties || []);
  const signatureName = cleanText(data.signatureName, "signatureName", 120);

  if (amount <= 0 || activationDeposit <= 0) {
    throw new HttpsError("invalid-argument", "A positive payment amount is required.");
  }

  // Generate the locked Contract PDF
  let contractUrl = "";
  try {
    contractUrl = await generateContractPDF({
      contractId: intakeId,
      ownerId: ownerUid,
      ownerName: signatureName || companyProfile.contactPerson || ownerEmail,
      companyName: companyProfile.name || "Private Owner",
      ownerEmail,
      propertyName: serviceDetails.properties > 1 ? "Portfolio" : "Property",
      propertyType: serviceDetails.selectedPlan,
      units: serviceDetails.totalUnits,
      planName: serviceDetails.selectedPlan,
      annualValue: annualContractValue || amount,
      mobilizationAmount: activationDeposit
    });
  } catch (pdfError) {
    console.error("Failed to generate PDF contract:", pdfError);
    // Don't completely fail the onboarding if PDF generation fails, just leave it blank for manual regeneration
  }

  const timestamp = serverTimestamp();
  const batch = db.batch();

  const paymentRef = db.collection("payment_transactions").doc(intakeId);
  batch.set(paymentRef, {
    ownerUid,
    ownerId: ownerUid,
    ownerEmail,
    intakeId,
    onboardingSessionId,
    paymentMethod,
    amount,
    activationDeposit,
    annualContractValue: annualContractValue || amount,
    currency: "AED",
    status: "PENDING",
    verificationState: "ADMIN_VERIFICATION_REQUIRED",
    companyProfile,
    serviceDetails,
    documentUrls,
    paymentManifest,
    contractUrl,
    signatureName,
    submittedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  }, { merge: true });

  const contractRef = db.collection("contracts").doc(intakeId);
  batch.set(contractRef, {
    contractId: intakeId,
    ownerUid,
    ownerId: ownerUid,
    ownerEmail,
    signatureName,
    contractUrl,
    annualContractValue: annualContractValue || amount,
    activationDeposit,
    status: "PENDING_PAYMENT_ACTIVATION",
    createdAt: timestamp,
    updatedAt: timestamp
  }, { merge: true });

  const intakeRef = db.collection("intake_submissions").doc(intakeId);
  batch.set(intakeRef, {
    paymentSubmitted: true,
    paymentSubmittedAt: timestamp,
    paymentMethod,
    paymentAmount: amount,
    activationDeposit,
    annualContractValue: annualContractValue || amount,
    status: "payment_pending_approval",
    ownerUid,
    ownerId: ownerUid,
    ownerEmail,
    proofDocuments: documentUrls,
    paymentManifest,
    contractUrl,
    properties,
    updatedAt: timestamp
  }, { merge: true });

  const auditRef = db.collection("audit_logs").doc();
  batch.set(auditRef, {
    action: "ONBOARDING_PAYMENT_SUBMITTED",
    actorId: ownerUid,
    actorRole: "owner",
    ownerUid,
    ownerId: ownerUid,
    ownerEmail,
    intakeId,
    sessionId: onboardingSessionId,
    paymentMethod,
    paymentAmount: amount,
    activationDeposit,
    annualContractValue: annualContractValue || amount,
    timestamp,
    createdAt: timestamp,
    documentCount: Object.keys(documentUrls).length
  });

  await batch.commit();

  return { success: true };
});