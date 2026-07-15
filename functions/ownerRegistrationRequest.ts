import { FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { generateContractPDF } from "./pdfEngine";
import {
  consumeVerifiedContractSignatureOtp,
  validateVerifiedContractSignatureOtp,
} from "./contractSignatureOtp";
import { assertStoredOwnerPaymentReceipt } from "./paymentReceiptEvidence";
import { calculateOwnerOnboardingQuote } from "./ownerOnboardingQuote";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const serverTimestamp = FieldValue.serverTimestamp;

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
  if (value instanceof FieldValue) return value;
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
  if (request.auth.token?.email_verified !== true) {
    throw new HttpsError("failed-precondition", "Verify the owner email before submitting contract or payment evidence.");
  }
  if (request.auth.token?.suspended === true) {
    throw new HttpsError("permission-denied", "Suspended owner accounts cannot continue onboarding.");
  }

  if (!callerUid || callerUid !== ownerUid) {
    throw new HttpsError("permission-denied", "Owner UID does not match the authenticated account.");
  }

  if (tokenEmail && ownerEmail !== tokenEmail) {
    throw new HttpsError("permission-denied", "Owner email does not match the authenticated account.");
  }
}

async function resolveOrCreateOwnerAuth(email: string, password: string, fullName: string, auth: any) {
  if (!password) {
    throw new HttpsError("invalid-argument", "A password is required to create the owner Auth account.");
  }

  try {
    const existing = await admin.auth().getUserByEmail(email);
    const existingProfile = await db.collection("users").doc(existing.uid).get();
    const existingRole = String(existingProfile.data()?.role || "").toLowerCase();
    if (existingRole && !["owner", "owner_pending"].includes(existingRole)) {
      throw new HttpsError("failed-precondition", "This email is already registered with another role. Use another email.");
    }
    if (!auth?.uid || auth.uid !== existing.uid) {
      throw new HttpsError("already-exists", "This email is already registered. Sign in before continuing.");
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
    await admin.auth().setCustomUserClaims(created.uid, { role: "owner" });
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

export const previewOwnerOnboardingQuote = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Owner authentication is required to calculate a locked quote.");
  }
  const role = String(
    request.auth.token?.role ||
    request.auth.token?.userRole ||
    request.auth.token?.primaryRole ||
    "",
  ).trim().toLowerCase();
  if (role !== "owner") {
    throw new HttpsError("permission-denied", "Only an owner account may request an onboarding quote.");
  }
  try {
    const quote = calculateOwnerOnboardingQuote(
      request.data?.properties,
      request.data?.selectedAddOns,
    );
    return {
      ...quote,
      quoteHash: crypto.createHash("sha256")
        .update(JSON.stringify(cleanPlainValue(quote)))
        .digest("hex"),
    };
  } catch (error: any) {
    throw new HttpsError(
      "invalid-argument",
      error?.message || "The server could not calculate this property quote.",
    );
  }
});

export const submitPendingOwnerRegistration = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
  const fullName = cleanText(request.data?.fullName, "Full name", 120);
  const email = cleanEmail(request.data?.email);
  const mobile = cleanMobile(request.data?.mobile);
  const password = cleanPassword(request.data?.password);
  const intakeId = cleanReference(request.data?.intakeId || request.data?.onboardingSubmissionId);
  const authProvision = await resolveOrCreateOwnerAuth(email, password, fullName, request.auth);
  if (!authProvision.uid) {
    throw new HttpsError("internal", "Owner Auth provisioning did not return a UID.");
  }
  const registrationId = authProvision.uid;
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

  const userRef = db.collection("users").doc(authProvision.uid);
  const registrationRef = db.collection("owner_registration_requests").doc(registrationId);
  const pendingOwnerRef = db.collection("pending_owners").doc(registrationId);
  const intakeRef = (intakeId || pendingPaymentPackage)
    ? db.collection("intake_submissions").doc(intakeId || registrationId)
    : null;
  const auditRef = db.collection("audit_logs").doc();

  await db.runTransaction(async (transaction) => {
    if (intakeRef) {
      const intakeSnap = await transaction.get(intakeRef);
      const existingIntake = intakeSnap.data() || {};
      const boundUid = String(
        existingIntake.ownerUid ||
        existingIntake.ownerId ||
        existingIntake.ownerRegistrationId ||
        "",
      ).trim();
      const boundEmail = String(existingIntake.ownerEmail || "").trim().toLowerCase();
      if ((boundUid && boundUid !== authProvision.uid) || (boundEmail && boundEmail !== email)) {
        throw new HttpsError(
          "permission-denied",
          "This onboarding reference is already bound to another owner account.",
        );
      }
    }

    transaction.set(userRef, {
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

    transaction.set(registrationRef, {
      ...registration,
      ...(pendingPaymentPackage ? { latestPaymentSubmission: pendingPaymentPackage } : {}),
      createdAt: timestamp
    }, { merge: true });
    transaction.set(pendingOwnerRef, {
      ...registration,
      pendingOwnerId: registrationId,
      ownerUid: authProvision.uid,
      ...(pendingPaymentPackage ? { latestPaymentSubmission: pendingPaymentPackage } : {}),
      createdAt: timestamp
    }, { merge: true });

    if (intakeRef) {
      transaction.set(intakeRef, {
        intakeId: intakeId || registrationId,
        ownerRegistrationId: registrationId,
        pendingOwnerId: registrationId,
        ownerUid: authProvision.uid,
        ownerName: fullName,
        ownerEmail: email,
        ownerMobile: mobile,
        accountCreated: true,
        accountCreationStatus: authProvision.accountCreationStatus,
        status: pendingPaymentPackage ? "AWAITING_VERIFICATION" : "PENDING_OWNER_APPROVAL",
        paymentStatus: pendingPaymentPackage ? "PENDING" : "NOT_SUBMITTED",
        adminReviewState: pendingPaymentPackage ? "AWAITING_VERIFICATION" : "PENDING_OWNER_DETAILS",
        ...(pendingPaymentPackage ? { pendingPaymentSubmission: pendingPaymentPackage } : {}),
        updatedAt: timestamp
      }, { merge: true });
    }

    transaction.set(auditRef, {
      actorId: authProvision.uid,
      actorRole: "owner",
      action: pendingPaymentPackage ? "SUBMIT_PENDING_OWNER_PAYMENT_PACKAGE" : "SUBMIT_PENDING_OWNER_REGISTRATION",
      targetType: "owner_registration_requests",
      targetId: registrationId,
      metadata: { intakeId: intakeId || null, email, authUid: authProvision.uid, paymentPackageSubmitted: Boolean(pendingPaymentPackage) },
      createdAt: timestamp
    });
  });

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

export const submitOwnerOnboardingPaymentPackage = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
  const data = request.data || {};
  const ownerUid = cleanText(data.ownerUid, "ownerUid", 120);
  const ownerEmail = cleanEmail(data.ownerEmail);
  assertAuthenticatedOwner(request, ownerUid, ownerEmail);

  const intakeId = cleanText(data.intakeId, "intakeId", 120);
  const onboardingSessionId = cleanText(data.onboardingSessionId, "onboardingSessionId", 120);
  const paymentMethod = cleanText(data.paymentMethod, "paymentMethod", 60);
  if (!["STRIPE", "BANK_TRANSFER", "CHEQUE", "CASH"].includes(paymentMethod)) {
    throw new HttpsError("invalid-argument", "Unsupported payment method.");
  }
  const submittedAmount = cleanMoney(data.amount, "Payment amount", true);
  const submittedActivationDeposit = cleanMoney(data.activationDeposit || data.amount, "Activation deposit", true);
  const annualContractValue = cleanMoney(data.annualContractValue, "Annual contract value", true);
  const companyProfile = cleanPlainValue(data.companyProfile || {});
  const serviceDetails = cleanPlainValue(data.serviceDetails || {});
  const documentUrls = cleanPlainValue(data.documentUrls || {});
  const paymentManifest = cleanPlainValue(data.paymentManifest || {});
  const properties = cleanPlainValue(data.properties || []);
  const signatureName = cleanText(data.signatureName, "signatureName", 120);
  const otpVerificationId = cleanText(data.otpVerificationId, "otpVerificationId", 180);

  if (!Array.isArray(properties) || properties.length === 0 || properties.length > 100) {
    throw new HttpsError("invalid-argument", "One to 100 properties are required for an onboarding quote.");
  }
  const requiredDocument = (key: string) => {
    const value = String(documentUrls?.[key] || "").trim();
    return value.startsWith("https://") || value.startsWith("gs://");
  };
  const hasIndividualIdentity = requiredDocument("emiratesId") && requiredDocument("passport");
  if (!requiredDocument("propertyProof") || (!hasIndividualIdentity && !requiredDocument("tradeLicense"))) {
    throw new HttpsError(
      "failed-precondition",
      "Property proof and either Emirates ID plus passport or a trade license are required.",
    );
  }
  if (!signatureName) {
    throw new HttpsError("failed-precondition", "A verified contract signature name is required.");
  }
  const manualPaymentReference = String(paymentManifest?.reference || "").trim();
  const manualReceiptUrl = String(paymentManifest?.receiptUrl || "").trim();
  const manualReceiptPath = String(paymentManifest?.receiptPath || "").trim();
  const manualReceiptHash = String(paymentManifest?.receiptHash || "").trim().toLowerCase();
  if (
    paymentMethod !== "STRIPE" &&
    (
      manualPaymentReference.length < 4 ||
      !manualReceiptPath.startsWith(`payment-references/owners/${ownerUid}/${intakeId}/`) ||
      !/^[a-f0-9]{64}$/.test(manualReceiptHash)
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Manual payment submissions require an owner-scoped uploaded receipt and payment reference.",
    );
  }
  const receiptEvidence = paymentMethod === "STRIPE"
    ? null
    : await assertStoredOwnerPaymentReceipt({
      ownerUid,
      paymentId: intakeId,
      storagePath: manualReceiptPath,
      expectedHash: manualReceiptHash,
    });

  const paymentRef = db.collection("payment_transactions").doc(intakeId);
  const existingPayment = await paymentRef.get();
  const existing = existingPayment.data() || {};
  if (existingPayment.exists && existing.ownerUid !== ownerUid) {
    throw new HttpsError("already-exists", "This onboarding reference is locked to another owner.");
  }
  const existingState = String(existing.paymentStatus || existing.status || "").trim().toUpperCase();
  const existingQuoteStartedAt = Number(existing.quoteSnapshot?.quotedAtMs || 0);
  const existingQuoteExpiresAt = Number(
    existing.quoteSnapshot?.expiresAtMs ||
    existing.quoteExpiresAt?.toMillis?.() ||
    0,
  );
  const submittedQuoteStartedAt = Number(data.quoteQuotedAtMs || 0);
  const submittedQuoteHash = String(data.quoteHash || "").trim().toLowerCase();
  const existingQuoteExpired = existingQuoteExpiresAt > 0 && Date.now() > existingQuoteExpiresAt;
  const canRotateQuote = existingPayment.exists &&
    (existingQuoteExpired || ["REJECTED", "PAYMENT_REJECTED", "EXPIRED"].includes(existingState));
  const quoteStartedAt = canRotateQuote
    ? submittedQuoteStartedAt
    : (existingQuoteStartedAt || submittedQuoteStartedAt);
  if (
    !Number.isFinite(quoteStartedAt) ||
    quoteStartedAt <= 0 ||
    quoteStartedAt > Date.now() + 60_000
  ) {
    throw new HttpsError("failed-precondition", "Generate and accept a current server quote before submitting payment.");
  }
  let serverQuote: ReturnType<typeof calculateOwnerOnboardingQuote>;
  try {
    serverQuote = calculateOwnerOnboardingQuote(properties, serviceDetails.selectedAddOns, quoteStartedAt);
  } catch (error: any) {
    throw new HttpsError("invalid-argument", error?.message || "The server could not calculate this property quote.");
  }
  if (Date.now() > serverQuote.expiresAtMs) {
    throw new HttpsError("deadline-exceeded", "The locked quote has expired. Generate and accept a new quote version.");
  }
  const activationDeposit = serverQuote.activationDeposit;
  const amount = activationDeposit;
  if (
    amount <= 0 ||
    annualContractValue !== serverQuote.annualContractValue ||
    submittedAmount !== amount ||
    submittedActivationDeposit !== amount
  ) {
    throw new HttpsError("failed-precondition", "The accepted quote changed. Refresh and accept the server-calculated AED quote before payment.");
  }
  if (amount <= 0 || activationDeposit <= 0) {
    throw new HttpsError("invalid-argument", "A positive payment amount is required.");
  }
  const quoteSnapshot = cleanPlainValue({
    ...serverQuote,
    serviceDetails,
    properties,
  });
  const quoteHash = crypto.createHash("sha256")
    .update(JSON.stringify(cleanPlainValue(serverQuote)))
    .digest("hex");
  if (!submittedQuoteHash || submittedQuoteHash !== quoteHash) {
    throw new HttpsError("failed-precondition", "The accepted quote hash is missing or stale. Refresh and accept the current quote.");
  }
  if (existingPayment.exists) {
    if (
      existing.ownerUid !== ownerUid ||
      (existing.quoteHash && existing.quoteHash !== quoteHash && !canRotateQuote)
    ) {
      throw new HttpsError("already-exists", "This onboarding reference is locked to a different owner or quote version.");
    }
    if (["PAID", "APPROVED"].includes(String(existing.paymentStatus || existing.status || "").toUpperCase())) {
      return { success: true, idempotent: true, paymentId: intakeId, contractId: intakeId };
    }
    if (
      !canRotateQuote &&
      existing.quoteHash === quoteHash &&
      existing.otpEvidenceVerified === true &&
      existing.ownerSigned === true
    ) {
      return { success: true, idempotent: true, paymentId: intakeId, contractId: intakeId };
    }
  }
  await validateVerifiedContractSignatureOtp({
    verificationId: otpVerificationId,
    uid: ownerUid,
    contractId: intakeId,
    signature: signatureName,
    contractHash: quoteHash,
  });

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
      annualValue: annualContractValue,
      mobilizationAmount: activationDeposit
    });
  } catch (pdfError) {
    console.error("Failed to generate PDF contract:", pdfError);
    throw new HttpsError("internal", "The locked contract PDF could not be generated. No payment package was created.");
  }

  const timestamp = serverTimestamp();
  const contractRef = db.collection("contracts").doc(intakeId);
  const intakeRef = db.collection("intake_submissions").doc(intakeId);
  const packageWasIdempotent = await db.runTransaction(async (transaction) => {
    const freshPaymentSnap = await transaction.get(paymentRef);
    const freshPayment = freshPaymentSnap.data() || {};
    if (freshPaymentSnap.exists) {
      if (String(freshPayment.ownerUid || "") !== ownerUid) {
        throw new HttpsError("already-exists", "This onboarding reference is locked to another owner.");
      }
      const freshState = String(freshPayment.paymentStatus || freshPayment.status || "").toUpperCase();
      if (["PAID", "APPROVED"].includes(freshState)) {
        if (String(freshPayment.quoteHash || "") !== quoteHash) {
          throw new HttpsError("already-exists", "Paid onboarding evidence is locked to another quote version.");
        }
        return true;
      }
      if (freshPayment.quoteHash && freshPayment.quoteHash !== quoteHash && !canRotateQuote) {
        throw new HttpsError("already-exists", "This onboarding reference is locked to another quote version.");
      }
    }
    await consumeVerifiedContractSignatureOtp(transaction, {
      verificationId: otpVerificationId,
      uid: ownerUid,
      contractId: intakeId,
      signature: signatureName,
      contractHash: quoteHash,
    });

  transaction.set(paymentRef, {
    paymentId: intakeId,
    contractId: intakeId,
    ownerUid,
    ownerId: ownerUid,
    ownerEmail,
    intakeId,
    onboardingSessionId,
    paymentMethod,
    amount,
    activationDeposit,
    annualContractValue,
    quoteSnapshot,
    quoteHash,
    quoteVersion: quoteSnapshot.version,
    quoteExpiresAt: admin.firestore.Timestamp.fromMillis(serverQuote.expiresAtMs),
    ...(canRotateQuote && existing.quoteHash && existing.quoteHash !== quoteHash
      ? {
        previousQuoteHashes: FieldValue.arrayUnion(existing.quoteHash),
        quoteReplacedAt: timestamp,
      }
      : {}),
    currency: "AED",
    status: "PENDING",
    verificationState: "ADMIN_VERIFICATION_REQUIRED",
    companyProfile,
    serviceDetails,
    documentUrls,
    paymentManifest,
    paymentReferenceId: manualPaymentReference || null,
    paymentProofUrl: manualReceiptUrl || null,
    paymentProofPath: manualReceiptPath || null,
    paymentProofEvidence: receiptEvidence,
    paymentProofHash: receiptEvidence?.receiptHash || null,
    paymentProofGeneration: receiptEvidence?.generation || null,
    contractUrl,
    signatureName,
    otpVerificationId,
    otpEvidenceVerified: true,
    otpEvidenceBoundAt: timestamp,
    ownerSigned: true,
    signatureStatus: "OWNER_SIGNED",
    submittedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  }, { merge: true });

  transaction.set(contractRef, {
    contractId: intakeId,
    paymentId: intakeId,
    intakeId,
    ownerUid,
    ownerId: ownerUid,
    ownerEmail,
    signatureName,
    otpVerificationId,
    otpEvidenceVerified: true,
    otpEvidenceBoundAt: timestamp,
    contractUrl,
    annualContractValue,
    activationDeposit,
    quoteSnapshot,
    quoteHash,
    quoteVersion: quoteSnapshot.version,
    quoteExpiresAt: admin.firestore.Timestamp.fromMillis(serverQuote.expiresAtMs),
    ...(canRotateQuote && existing.quoteHash && existing.quoteHash !== quoteHash
      ? {
        previousQuoteHashes: FieldValue.arrayUnion(existing.quoteHash),
        quoteReplacedAt: timestamp,
      }
      : {}),
    ownerSigned: true,
    signatureStatus: "OWNER_SIGNED",
    signatureState: {
      ownerSigned: true,
      ownerSignedName: signatureName,
      paymentVerificationPending: true
    },
    status: "PENDING_ADMIN_PAYMENT_VERIFICATION",
    createdAt: timestamp,
    updatedAt: timestamp
  }, { merge: true });

  transaction.set(intakeRef, {
    paymentSubmitted: true,
    paymentSubmittedAt: timestamp,
    paymentMethod,
    paymentAmount: amount,
    activationDeposit,
    annualContractValue,
    quoteSnapshot,
    quoteHash,
    quoteVersion: quoteSnapshot.version,
    quoteExpiresAt: admin.firestore.Timestamp.fromMillis(serverQuote.expiresAtMs),
    ...(canRotateQuote && existing.quoteHash && existing.quoteHash !== quoteHash
      ? {
        previousQuoteHashes: FieldValue.arrayUnion(existing.quoteHash),
        quoteReplacedAt: timestamp,
      }
      : {}),
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

  properties.forEach((property: any, index: number) => {
    const sourceId = String(property?.id || `property_${index + 1}`)
      .replace(/[^A-Za-z0-9_-]/g, "_")
      .slice(0, 100);
    const propertyId = `${intakeId}_${sourceId}`;
    transaction.set(db.collection("properties").doc(propertyId), {
      ...cleanPlainValue(property),
      propertyId,
      intakeId,
      ownerUid,
      ownerId: ownerUid,
      ownerEmail,
      status: "PENDING_ADMIN_APPROVAL",
      activationStatus: "LOCKED_PENDING_PAYMENT_AND_ADMIN_APPROVAL",
      quoteHash,
      updatedAt: timestamp,
      ...(existingPayment.exists ? {} : { createdAt: timestamp }),
    }, { merge: true });
    transaction.set(db.collection("propertyPassports").doc(propertyId), {
      propertyId,
      intakeId,
      ownerUid,
      ownerId: ownerUid,
      status: "PENDING_VERIFICATION",
      titleDeedVerified: false,
      activated: false,
      updatedAt: timestamp,
      ...(existingPayment.exists ? {} : { createdAt: timestamp }),
    }, { merge: true });
  });

  transaction.set(db.collection("users").doc(ownerUid), {
    status: "payment_pending_admin_verification",
    adminApproved: false,
    paymentVerified: false,
    dashboardLocked: true,
    dashboardUnlocked: false,
    latestActivationContractId: intakeId,
    latestIntakeId: intakeId,
    updatedAt: timestamp,
  }, { merge: true });

  const auditRef = db.collection("audit_logs").doc();
  transaction.set(auditRef, {
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
    annualContractValue,
    timestamp,
    createdAt: timestamp,
    documentCount: Object.keys(documentUrls).length
  });

    return false;
  });

  if (packageWasIdempotent) {
    return { success: true, idempotent: true, paymentId: intakeId, contractId: intakeId, quoteHash };
  }

  return { success: true, idempotent: false, paymentId: intakeId, contractId: intakeId, quoteHash };
});