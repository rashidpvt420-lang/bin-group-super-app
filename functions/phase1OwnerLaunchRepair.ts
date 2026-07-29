import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { calculateOwnerOnboardingQuote } from "./ownerOnboardingQuote";
import { loadActivePaymentConfiguration } from "./paymentConfiguration";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const ts = () => FieldValue.serverTimestamp();
const WORKFLOW_VERSION = "OWNER_FIVE_PAGE_INSPECTION_FIRST_V1";
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "manager", "operations_admin", "finance_admin"]);
const PHASE1_PAYMENT_METHODS = new Set(["CASH", "CHEQUE"]);
const DOCUMENT_TYPES = new Set(["propertyProof", "emiratesId", "passport", "tradeLicense", "tenancySupport"]);
const CONTRACT_NAMES = new Map<string, string>([
  ["FM_ONLY", "MAINTENANCE ONLY"],
  ["PM_ONLY", "PROPERTY MANAGEMENT"],
  ["BOTH", "TOTAL CARE HYBRID"],
]);

type PlainRecord = Record<string, any>;
type ContractMode = "FM_ONLY" | "PM_ONLY" | "BOTH";
type StoredEvidence = {
  storagePath: string;
  sha256: string;
  generation: string;
  filename?: string;
  contentType?: string;
  size?: number;
};

const text = (value: unknown) => String(value ?? "").trim();
const lower = (value: unknown) => text(value).toLowerCase();
const upper = (value: unknown) => text(value).toUpperCase();
const finite = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const money = (value: unknown) => Math.round(finite(value) * 100) / 100;
const safeId = (value: unknown, fallback: string) => text(value)
  .replace(/[^A-Za-z0-9_-]/g, "_")
  .replace(/_+/g, "_")
  .slice(0, 160) || fallback;

function cleanPlain(value: any): any {
  if (value === undefined || typeof value === "function") return null;
  if (value === null) return null;
  if (value instanceof admin.firestore.GeoPoint || value instanceof admin.firestore.Timestamp) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(cleanPlain);
  if (typeof value === "object") {
    const output: PlainRecord = {};
    Object.entries(value).forEach(([key, entry]) => {
      if (entry !== undefined && typeof entry !== "function") output[key] = cleanPlain(entry);
    });
    return output;
  }
  return value;
}

function validEmail(value: unknown) {
  const email = lower(value);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpsError("invalid-argument", "A valid Owner email is required.");
  return email;
}

function roleOf(token: PlainRecord | undefined) {
  return lower(token?.role || token?.userRole || token?.primaryRole);
}

function hasMfa(token: PlainRecord) {
  return Boolean(
    token?.firebase?.sign_in_second_factor ||
    (Array.isArray(token?.amr) && token.amr.includes("mfa")),
  );
}

async function requireOwner(request: any) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Owner authentication required.");
  if (request.auth.token?.email_verified !== true || request.auth.token?.suspended === true) {
    throw new HttpsError("permission-denied", "A verified, active Owner account is required.");
  }
  if (roleOf(request.auth.token) !== "owner") throw new HttpsError("permission-denied", "Owner role required.");
  const user = await admin.auth().getUser(request.auth.uid);
  if (user.disabled || !user.emailVerified) throw new HttpsError("permission-denied", "The Owner account is not active and verified.");
  return { uid: request.auth.uid as string, email: validEmail(request.auth.token?.email || user.email) };
}

async function requireAdmin(request: any, requireMfa = false) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Admin authentication required.");
  const token = request.auth.token || {};
  if (
    token.suspended === true ||
    !(ADMIN_ROLES.has(roleOf(token)) || token.admin === true || token.isAdmin === true || token.superAdmin === true || token.super_admin === true)
  ) throw new HttpsError("permission-denied", "Admin permission required.");
  if (token.email_verified !== true) throw new HttpsError("permission-denied", "A verified Admin account is required.");
  if (requireMfa && !hasMfa(token)) throw new HttpsError("permission-denied", "A fresh Admin MFA session is required.");
  const user = await admin.auth().getUser(request.auth.uid);
  if (user.disabled || !user.emailVerified) throw new HttpsError("permission-denied", "Disabled or unverified Admin account.");
  return { uid: request.auth.uid as string, email: lower(token.email || user.email) };
}

function propertyMode(property: PlainRecord): ContractMode {
  const strategy = lower(property.strategy || property.serviceModel || property.contractMode || property.contractType);
  if (["fm", "fm_only", "maintenance", "maintenance_only"].includes(strategy)) return "FM_ONLY";
  if (["pm", "pm_only", "rent", "property_management"].includes(strategy)) return "PM_ONLY";
  if (["both", "hybrid", "combined", "total_care", "total-care"].includes(strategy)) return "BOTH";
  throw new HttpsError("invalid-argument", "Select Maintenance, Property Management, or Hybrid service for every property.");
}

function normalizeGeo(value: PlainRecord) {
  const lat = finite(value?.geo?.lat ?? value?.geo?.point?.latitude ?? value?.lat, Number.NaN);
  const lng = finite(value?.geo?.lng ?? value?.geo?.point?.longitude ?? value?.lng, Number.NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new HttpsError("failed-precondition", "A valid property GPS location is required before submission.");
  }
  return {
    ...(cleanPlain(value?.geo || {})),
    point: new admin.firestore.GeoPoint(lat, lng),
    lat,
    lng,
    verified: false,
    dispatchReady: false,
    requiresGeoReview: true,
    source: text(value?.geo?.source || "owner_five_page_submission"),
  };
}

function assertQuote(data: PlainRecord, properties: PlainRecord[], selectedAddOns: string[]) {
  const quotedAtMs = finite(data.quoteQuotedAtMs || data.quotedAtMs);
  if (!quotedAtMs || quotedAtMs > Date.now() + 60_000) {
    throw new HttpsError("failed-precondition", "The signed server quotation timestamp is missing or invalid.");
  }
  const quote = calculateOwnerOnboardingQuote(properties, selectedAddOns, quotedAtMs);
  if (Number(quote.expiresAtMs || 0) <= Date.now()) {
    throw new HttpsError("failed-precondition", "The signed quotation expired. Return to Contract and request a fresh quote.");
  }
  if (lower(data.quoteHash) !== quote.quoteHash) {
    throw new HttpsError("failed-precondition", "The submitted properties no longer match the signed server quotation.");
  }
  if (money(quote.activationDeposit) !== money(Number(quote.annualContractValue) * 0.15)) {
    throw new HttpsError("failed-precondition", "The server quotation does not contain the required 15% mobilisation deposit.");
  }
  return quote;
}

function assertVerifiedOtp(data: PlainRecord, args: { uid: string; contractId: string; contractHash: string; signature: string }) {
  const expiresAt = data.evidenceExpiresAt?.toMillis?.() || 0;
  if (
    upper(data.status) !== "VERIFIED" ||
    text(data.uid) !== args.uid ||
    text(data.contractId) !== args.contractId ||
    lower(data.contractHash) !== lower(args.contractHash) ||
    text(data.signature) !== args.signature ||
    !expiresAt || Date.now() > expiresAt
  ) throw new HttpsError("failed-precondition", "Signature OTP evidence is invalid, expired, or belongs to another application.");
  const consumedFor = text(data.consumedFor);
  if (consumedFor && consumedFor !== args.contractId) {
    throw new HttpsError("failed-precondition", "Signature OTP evidence was already used for another application.");
  }
}

function canonicalPropertyId(intakeId: string, index: number) {
  return safeId(`${intakeId}_property_${index + 1}`, `owner_property_${index + 1}`);
}

function normalizeEvidence(value: unknown): StoredEvidence {
  const source = value && typeof value === "object" ? value as PlainRecord : {};
  return {
    storagePath: text(source.storagePath),
    sha256: lower(source.sha256 || source.hash),
    generation: text(source.generation),
    filename: text(source.filename),
    contentType: text(source.contentType),
    size: finite(source.size),
  };
}

async function verifyStoredDocument(ownerUid: string, intakeId: string, docType: string, value: unknown) {
  if (!DOCUMENT_TYPES.has(docType)) throw new HttpsError("invalid-argument", "Unsupported Owner document type.");
  const evidence = normalizeEvidence(value);
  const expectedPrefix = `onboarding-proof/${ownerUid}/${intakeId}/${docType}/`;
  if (!evidence.storagePath.startsWith(expectedPrefix) || !/^[a-f0-9]{64}$/.test(evidence.sha256) || !/^\d+$/.test(evidence.generation)) {
    throw new HttpsError("failed-precondition", `${docType} does not contain valid protected Storage evidence.`);
  }
  const file = admin.storage().bucket().file(evidence.storagePath);
  const [metadata] = await file.getMetadata();
  const custom = metadata.metadata || {};
  if (
    text(metadata.generation) !== evidence.generation ||
    lower(custom.sha256) !== evidence.sha256 ||
    text(custom.ownerUid) !== ownerUid ||
    text(custom.intakeId) !== intakeId ||
    text(custom.docType) !== docType
  ) throw new HttpsError("failed-precondition", `${docType} Storage evidence does not match this Owner application.`);
  return evidence;
}

export const uploadOwnerInspectionProofDocumentPhase1 = onCall(
  { cors: true, enforceAppCheck: true, memory: "512MiB" },
  async (request) => {
    const owner = await requireOwner(request);
    const requestedUid = text(request.data?.ownerUid || owner.uid);
    const requestedEmail = validEmail(request.data?.ownerEmail || owner.email);
    if (requestedUid !== owner.uid || requestedEmail !== owner.email) {
      throw new HttpsError("permission-denied", "Document owner does not match the signed-in Owner.");
    }
    const intakeId = safeId(request.data?.intakeId || request.data?.onboardingSessionId, owner.uid);
    const docType = text(request.data?.docType);
    if (!DOCUMENT_TYPES.has(docType)) throw new HttpsError("invalid-argument", "Unsupported Owner document type.");
    const filename = text(request.data?.filename || `${docType}.bin`).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 180);
    const contentType = lower(request.data?.contentType || "application/octet-stream");
    if (!contentType.match(/^image\/(jpeg|png|webp)$/) && contentType !== "application/pdf") {
      throw new HttpsError("invalid-argument", "Only PDF, JPG, PNG and WEBP documents are allowed.");
    }
    const encoded = text(request.data?.encodedDocument);
    const buffer = Buffer.from(encoded.includes(",") ? encoded.split(",").pop() || "" : encoded, "base64");
    if (!buffer.length || buffer.length > 8 * 1024 * 1024) {
      throw new HttpsError("invalid-argument", "Document is empty or exceeds 8 MB.");
    }
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const storagePath = `onboarding-proof/${owner.uid}/${intakeId}/${docType}/${Date.now()}_${crypto.randomUUID()}_${filename}`;
    const file = admin.storage().bucket().file(storagePath);
    await file.save(buffer, {
      resumable: false,
      validation: "md5",
      metadata: {
        contentType,
        cacheControl: "private, no-store, max-age=0",
        metadata: {
          ownerUid: owner.uid,
          intakeId,
          docType,
          sha256,
          uploadedBy: owner.email,
          accessClass: "ADMIN_SIGNED_URL_ONLY",
          uploadedAt: new Date().toISOString(),
        },
      },
    });
    const [metadata] = await file.getMetadata();
    const generation = text(metadata.generation);
    if (!generation) throw new HttpsError("internal", "Stored Owner document has no immutable generation.");
    return { success: true, storagePath, sha256, generation, docType, filename, contentType, size: buffer.length };
  },
);

export const submitOwnerInspectionFirstOnboardingPhase1 = onCall(
  { cors: true, enforceAppCheck: true },
  async (request) => {
    const owner = await requireOwner(request);
    const data: PlainRecord = request.data || {};
    const intakeId = safeId(data.intakeId || data.onboardingSessionId, `owner_${owner.uid}`);
    const ownerEmail = validEmail(data.ownerEmail || owner.email);
    if (ownerEmail !== owner.email || text(data.ownerUid || owner.uid) !== owner.uid) {
      throw new HttpsError("permission-denied", "Owner identity does not match the signed-in account.");
    }

    const properties: PlainRecord[] = Array.isArray(data.properties)
      ? data.properties.map((property: unknown) => cleanPlain(property))
      : [];
    if (!properties.length || properties.length > 100) throw new HttpsError("invalid-argument", "One to 100 properties are required.");
    const modes = properties.map(propertyMode);
    if (modes.some((mode) => mode !== modes[0])) {
      throw new HttpsError("failed-precondition", "One application cannot mix different contract service modes.");
    }
    const contractMode = modes[0];
    const canonicalPlanName = CONTRACT_NAMES.get(contractMode);
    if (!canonicalPlanName) throw new HttpsError("failed-precondition", "The contract service mode could not be resolved.");
    const selectedAddOns = Array.isArray(data.selectedAddOns)
      ? data.selectedAddOns.map((value: unknown) => text(value)).filter(Boolean).slice(0, 50)
      : [];
    const quote = assertQuote(data, properties, selectedAddOns);
    const signatureName = text(data.signatureName).slice(0, 180);
    const verificationId = text(data.otpVerificationId || data.contractOtpVerificationId);
    if (signatureName.length < 3 || !verificationId) throw new HttpsError("failed-precondition", "A verified digital signature is required.");

    const rawEvidence = data.documentEvidence && typeof data.documentEvidence === "object" ? data.documentEvidence as PlainRecord : {};
    if (!rawEvidence.propertyProof || !((rawEvidence.emiratesId && rawEvidence.passport) || rawEvidence.tradeLicense)) {
      throw new HttpsError("failed-precondition", "Property proof and Owner identity documents are required.");
    }
    const documentEvidence: PlainRecord = {};
    for (const [docType, value] of Object.entries(rawEvidence)) {
      if (!DOCUMENT_TYPES.has(docType) || !value) continue;
      documentEvidence[docType] = await verifyStoredDocument(owner.uid, intakeId, docType, value);
    }

    const companyProfile = cleanPlain(data.companyProfile || {});
    const fullName = text(data.ownerName || companyProfile.contactPerson || signatureName).slice(0, 160);
    const mobile = text(data.ownerMobile || companyProfile.phone).slice(0, 60);
    const contractId = intakeId;
    const intakeRef = db.collection("intake_submissions").doc(intakeId);
    const paymentRef = db.collection("payment_transactions").doc(intakeId);
    const contractRef = db.collection("contracts").doc(contractId);
    const otpRef = db.collection("contract_signature_otps").doc(verificationId);
    const existing = await intakeRef.get();
    if (existing.exists) {
      const existingOwner = text(existing.data()?.ownerUid || existing.data()?.ownerId);
      if (existingOwner && existingOwner !== owner.uid) throw new HttpsError("already-exists", "This application reference belongs to another Owner.");
      if (upper(existing.data()?.status) === "SUBMITTED_FOR_PROPERTY_INSPECTION") {
        return { success: true, idempotent: true, intakeId, contractId, paymentId: intakeId, nextState: "ADMIN_PROPERTY_REVIEW" };
      }
    }

    await db.runTransaction(async (transaction) => {
      const [otpSnap, freshIntake] = await Promise.all([transaction.get(otpRef), transaction.get(intakeRef)]);
      if (freshIntake.exists) {
        const existingOwner = text(freshIntake.data()?.ownerUid || freshIntake.data()?.ownerId);
        if (existingOwner && existingOwner !== owner.uid) throw new HttpsError("already-exists", "This application reference belongs to another Owner.");
        if (upper(freshIntake.data()?.status) === "SUBMITTED_FOR_PROPERTY_INSPECTION") return;
      }
      if (!otpSnap.exists) throw new HttpsError("failed-precondition", "Signature OTP verification was not found.");
      assertVerifiedOtp(otpSnap.data() || {}, { uid: owner.uid, contractId, contractHash: quote.quoteHash, signature: signatureName });
      const now = ts();
      transaction.set(otpRef, { consumedFor: contractId, consumedAt: otpSnap.data()?.consumedAt || now, updatedAt: now }, { merge: true });

      const normalizedProperties = properties.map((property, index) => {
        const propertyId = canonicalPropertyId(intakeId, index);
        return {
          ...property,
          clientDraftId: text(property.id || property.propertyId) || null,
          id: propertyId,
          propertyId,
          ownerUid: owner.uid,
          ownerId: owner.uid,
          ownerEmail,
          intakeId,
          contractId,
          quoteHash: quote.quoteHash,
          units: finite(property.units),
          geo: normalizeGeo(property),
          status: "PENDING_PROPERTY_INSPECTION",
          activationStatus: "LOCKED_PENDING_INSPECTION_AND_PAYMENT",
          inspectionStatus: "PENDING_ADMIN_SITE_VISIT",
          locationVerified: false,
          paymentVerified: false,
          adminApproved: false,
          updatedAt: now,
        };
      });

      transaction.set(intakeRef, {
        id: intakeId,
        intakeId,
        workflowVersion: WORKFLOW_VERSION,
        source: "PUBLIC_OWNER_FIVE_PAGE_APPLICATION",
        status: "SUBMITTED_FOR_PROPERTY_INSPECTION",
        adminReviewState: "AWAITING_PROPERTY_REVIEW_AND_SITE_VISIT",
        inspectionStatus: "PENDING_ADMIN_SITE_VISIT",
        inspectionEvidenceVerifiedCount: 0,
        activationState: "LOCKED_PENDING_INSPECTION_AND_PAYMENT",
        paymentStatus: "NOT_DUE_UNTIL_INSPECTION_COMPLETE",
        paymentCollectionStage: "AFTER_VERIFIED_ADMIN_SITE_VISITS",
        ownerUid: owner.uid,
        ownerId: owner.uid,
        ownerName: fullName,
        ownerEmail,
        ownerMobile: mobile,
        companyProfile,
        contactInfo: { name: fullName, email: ownerEmail, phone: mobile, licenseNumber: text(companyProfile.licenseNumber) },
        properties: normalizedProperties,
        propertyIds: normalizedProperties.map((property) => property.propertyId),
        selectedAddOns,
        selectedPlan: { id: contractMode, type: contractMode, name: canonicalPlanName, packageName: canonicalPlanName },
        contractType: contractMode,
        contractId,
        signatureName,
        ownerSigned: true,
        otpVerificationId: verificationId,
        quoteHash: quote.quoteHash,
        quoteSnapshot: cleanPlain(quote),
        annualContractValue: money(quote.annualContractValue),
        mobilizationAmount: money(quote.activationDeposit),
        portfolioSummary: {
          totalProperties: normalizedProperties.length,
          totalUnits: normalizedProperties.reduce((sum, property) => sum + finite(property.units), 0),
          estimatedACV: money(quote.annualContractValue),
          recommendedTier: canonicalPlanName,
        },
        documentEvidence,
        payment: {
          paymentId: intakeId,
          contractId,
          amount: money(quote.activationDeposit),
          annualValue: money(quote.annualContractValue),
          currency: "AED",
          state: "NOT_DUE_UNTIL_INSPECTION_COMPLETE",
          method: null,
        },
        submittedAt: now,
        createdAt: freshIntake.exists ? freshIntake.data()?.createdAt || now : now,
        updatedAt: now,
      }, { merge: true });

      transaction.set(contractRef, {
        id: contractId,
        contractId,
        intakeId,
        workflowVersion: WORKFLOW_VERSION,
        ownerUid: owner.uid,
        ownerId: owner.uid,
        ownerEmail,
        ownerName: fullName,
        propertyIds: normalizedProperties.map((property) => property.propertyId),
        properties: normalizedProperties,
        status: "SIGNED_PENDING_PROPERTY_INSPECTION",
        contractStatus: "signed_pending_inspection",
        activationStatus: "LOCKED_PENDING_INSPECTION_AND_PAYMENT",
        adminApproved: false,
        ownerSigned: true,
        signatureName,
        otpVerificationId: verificationId,
        signatureState: { ownerSigned: true, ownerSignatureName: signatureName, otpVerificationId: verificationId, signedAt: now },
        quoteHash: quote.quoteHash,
        quoteSnapshot: cleanPlain(quote),
        annualContractValue: money(quote.annualContractValue),
        activationDeposit: money(quote.activationDeposit),
        depositAmount: money(quote.activationDeposit),
        paymentStatus: "NOT_DUE_UNTIL_INSPECTION_COMPLETE",
        packageName: canonicalPlanName,
        planType: contractMode,
        selectedPlan: { id: contractMode, name: canonicalPlanName },
        selectedAddOns,
        documentEvidence,
        createdAt: now,
        updatedAt: now,
      }, { merge: true });

      transaction.set(paymentRef, {
        id: intakeId,
        paymentId: intakeId,
        intakeId,
        contractId,
        workflowVersion: WORKFLOW_VERSION,
        recordType: "OWNER_ACTIVATION_PAYMENT",
        ownerUid: owner.uid,
        ownerId: owner.uid,
        ownerEmail,
        ownerName: fullName,
        quoteHash: quote.quoteHash,
        quoteSnapshot: cleanPlain(quote),
        annualContractValue: money(quote.annualContractValue),
        activationDeposit: money(quote.activationDeposit),
        amount: money(quote.activationDeposit),
        currency: "AED",
        status: "AWAITING_SITE_INSPECTION",
        paymentStatus: "AWAITING_SITE_INSPECTION",
        verificationState: "VERIFIED_INSPECTION_EVIDENCE_REQUIRED_BEFORE_PAYMENT",
        adminApprovalRequired: true,
        unlocksDashboard: false,
        ownerSigned: true,
        signatureName,
        otpVerificationId: verificationId,
        createdAt: now,
        updatedAt: now,
      }, { merge: true });

      normalizedProperties.forEach((property) => {
        transaction.create(db.collection("properties").doc(property.propertyId), { ...property, createdAt: now });
      });

      const ownerPatch = {
        role: "owner",
        status: "pending_property_inspection",
        onboardingStatus: "SUBMITTED_AWAITING_VERIFIED_ADMIN_SITE_VISITS",
        latestIntakeId: intakeId,
        activeContractId: contractId,
        dashboardLocked: true,
        dashboardUnlocked: false,
        paymentVerified: false,
        adminApproved: false,
        updatedAt: now,
      };
      transaction.set(db.collection("users").doc(owner.uid), ownerPatch, { merge: true });
      transaction.set(db.collection("owners").doc(owner.uid), { ...ownerPatch, ownerUid: owner.uid, ownerEmail }, { merge: true });
      transaction.set(db.collection("notifications").doc(), {
        userId: owner.uid,
        toRole: "owner",
        type: "OWNER_APPLICATION_SUBMITTED_FOR_INSPECTION",
        title: "Property application submitted",
        body: "BIN GROUP will review your five-page application and record verified evidence for every property visit. The exact 15% mobilisation payment becomes due only after all visits are verified.",
        read: false,
        createdAt: now,
      });
      transaction.set(db.collection("audit_logs").doc(), {
        actorId: owner.uid,
        actorRole: "owner",
        action: "SUBMIT_OWNER_FIVE_PAGE_PHASE1_SECURE_APPLICATION",
        targetType: "intake_submissions",
        targetId: intakeId,
        metadata: { contractId, paymentId: intakeId, propertyIds: normalizedProperties.map((property) => property.propertyId), quoteHash: quote.quoteHash },
        createdAt: now,
      });
    });

    return {
      success: true,
      idempotent: false,
      intakeId,
      contractId,
      paymentId: intakeId,
      annualContractValue: money(quote.annualContractValue),
      activationDeposit: money(quote.activationDeposit),
      nextState: "ADMIN_REVIEW_AND_VERIFIED_SITE_VISITS",
      dashboardLocked: true,
    };
  },
);

export const adminCreateOwnerDocumentAccessUrl = onCall(
  { cors: true, enforceAppCheck: true },
  async (request) => {
    await requireAdmin(request);
    const intakeId = safeId(request.data?.intakeId, "");
    const docType = text(request.data?.docType);
    if (!intakeId || !DOCUMENT_TYPES.has(docType)) throw new HttpsError("invalid-argument", "Valid intakeId and document type are required.");
    const intakeSnap = await db.collection("intake_submissions").doc(intakeId).get();
    if (!intakeSnap.exists) throw new HttpsError("not-found", "Owner application not found.");
    const evidence = normalizeEvidence(intakeSnap.data()?.documentEvidence?.[docType]);
    if (!evidence.storagePath || !evidence.generation) throw new HttpsError("not-found", "Protected Owner document evidence was not found.");
    const file = admin.storage().bucket().file(evidence.storagePath, { generation: evidence.generation });
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 10 * 60 * 1000,
      responseDisposition: `inline; filename="${safeId(evidence.filename || docType, docType)}"`,
    });
    return { url, expiresAtMs: Date.now() + 10 * 60 * 1000, docType };
  },
);

export const adminRecordOwnerMobilizationPaymentEvidencePhase1 = onCall(
  { cors: true, enforceAppCheck: true, memory: "512MiB" },
  async (request) => {
    const actor = await requireAdmin(request, true);
    const paymentId = safeId(request.data?.paymentId, "");
    const reference = text(request.data?.paymentReferenceId || request.data?.reference);
    const method = upper(request.data?.paymentMethod || request.data?.method);
    const filename = text(request.data?.filename || "mobilisation-receipt.pdf").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 160);
    const contentType = lower(request.data?.contentType || "application/pdf");
    const encoded = text(request.data?.encodedDocument);
    if (!paymentId || reference.length < 4) throw new HttpsError("invalid-argument", "Payment ID and a valid receipt reference are required.");
    if (!PHASE1_PAYMENT_METHODS.has(method)) throw new HttpsError("invalid-argument", "Phase 1 accepts only Cash or Cheque.");
    if (!contentType.match(/^image\/(jpeg|png|webp)$/) && contentType !== "application/pdf") {
      throw new HttpsError("invalid-argument", "Payment evidence must be a PDF, JPG, PNG or WEBP file.");
    }
    const buffer = Buffer.from(encoded.includes(",") ? encoded.split(",").pop() || "" : encoded, "base64");
    if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new HttpsError("invalid-argument", "Payment evidence is empty or exceeds 10 MB.");

    const paymentRef = db.collection("payment_transactions").doc(paymentId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) throw new HttpsError("not-found", "Payment transaction not found.");
    const payment = paymentSnap.data() || {};
    if (text(payment.workflowVersion) !== WORKFLOW_VERSION || payment.inspectionVerified !== true) {
      throw new HttpsError("failed-precondition", "Complete and verify every Admin property visit before recording the 15% payment.");
    }
    const ownerUid = text(payment.ownerUid || payment.ownerId);
    const intakeId = text(payment.intakeId || paymentId);
    const expectedAmount = money(payment.activationDeposit || payment.amount);
    const amountReceived = money(request.data?.amountReceived || expectedAmount);
    if (!ownerUid || expectedAmount <= 0 || Math.abs(amountReceived - expectedAmount) > 0.01) {
      throw new HttpsError("failed-precondition", "Received amount must equal the locked 15% mobilisation deposit.");
    }

    const intakeSnap = await db.collection("intake_submissions").doc(intakeId).get();
    const intake = intakeSnap.data() || {};
    const propertyCount = Array.isArray(intake.properties) ? intake.properties.length : 0;
    const inspectionIds = Array.isArray(intake.inspectionIds) ? Array.from(new Set(intake.inspectionIds.map(text).filter(Boolean))) : [];
    if (
      upper(intake.inspectionStatus) !== "COMPLETED" ||
      propertyCount < 1 ||
      inspectionIds.length !== propertyCount ||
      finite(intake.inspectionEvidenceVerifiedCount) !== propertyCount
    ) throw new HttpsError("failed-precondition", "All property visits require verified GPS, checklist, findings and photo evidence before payment.");

    const configuration = await loadActivePaymentConfiguration();
    if (!configuration.approvedMethods.includes(method)) {
      throw new HttpsError("failed-precondition", `${method} is not enabled in the active corporate payment configuration.`);
    }

    const receiptHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const storagePath = `payment-references/owners/${ownerUid}/${paymentId}/${Date.now()}_${crypto.randomUUID()}_${filename}`;
    const file = admin.storage().bucket().file(storagePath);
    await file.save(buffer, {
      resumable: false,
      validation: "md5",
      metadata: {
        contentType,
        cacheControl: "private, no-store, max-age=0",
        metadata: {
          ownerUid,
          paymentId,
          intakeId,
          evidenceType: "owner_phase1_payment_receipt",
          sha256: receiptHash,
          uploadedByAdmin: actor.uid,
          accessClass: "FINANCE_ADMIN_SIGNED_URL_ONLY",
          uploadedAt: new Date().toISOString(),
        },
      },
    });
    const [metadata] = await file.getMetadata();
    const generation = text(metadata.generation);
    if (!generation) throw new HttpsError("internal", "Stored payment evidence has no immutable generation.");

    const capturedAt = new Date().toISOString();
    const paymentManifest = {
      schemaVersion: 1,
      launchPhase: "PHASE1_CASH_CHEQUE_PUBLIC",
      configVersion: configuration.version,
      configHash: configuration.configHash,
      paymentConfigVersion: configuration.version,
      paymentConfigHash: configuration.configHash,
      legalBeneficiary: configuration.legalBeneficiary,
      currency: configuration.currency,
      approvedMethod: method,
      officeLocation: configuration.officeLocation,
      capturedAt,
    };
    const batch = db.batch();
    batch.set(paymentRef, {
      status: "PENDING_ADMIN_APPROVAL",
      paymentStatus: "PENDING_ADMIN_APPROVAL",
      verificationState: "PAYMENT_EVIDENCE_RECORDED_WITH_ACTIVE_CONFIG",
      paymentMethod: method,
      method,
      paymentReferenceId: reference,
      paymentReference: reference,
      amountReceived,
      paymentProofPath: storagePath,
      paymentProofHash: receiptHash,
      paymentProofGeneration: generation,
      paymentProofEvidence: { storagePath, receiptHash, generation, recordedBy: actor.uid, capturedAt },
      receiptPath: storagePath,
      receiptHash,
      receiptGeneration: generation,
      paymentConfigVersion: configuration.version,
      paymentConfigurationVersion: configuration.version,
      paymentConfigHash: configuration.configHash,
      paymentConfigurationHash: configuration.configHash,
      paymentManifest,
      phase1PublicPayment: true,
      updatedAt: ts(),
    }, { merge: true });
    batch.set(db.collection("intake_submissions").doc(intakeId), {
      paymentStatus: "PENDING_ADMIN_APPROVAL",
      paymentEvidenceRecorded: true,
      paymentReferenceId: reference,
      paymentMethod: method,
      paymentConfigVersion: configuration.version,
      paymentConfigHash: configuration.configHash,
      updatedAt: ts(),
    }, { merge: true });
    batch.set(db.collection("audit_logs").doc(), {
      actorId: actor.uid,
      actorEmail: actor.email,
      actorRole: "finance_admin",
      action: "RECORD_OWNER_PHASE1_15_PERCENT_PAYMENT_EVIDENCE",
      targetType: "payment_transactions",
      targetId: paymentId,
      metadata: { intakeId, ownerUid, method, reference, amountReceived, receiptHash, generation, configVersion: configuration.version, configHash: configuration.configHash },
      createdAt: ts(),
    });
    await batch.commit();
    return { status: "RECORDED", paymentId, intakeId, amountReceived, method, paymentReferenceId: reference, receiptHash, generation, paymentConfigVersion: configuration.version };
  },
);

export const adminCreateOwnerPaymentEvidenceAccessUrl = onCall(
  { cors: true, enforceAppCheck: true },
  async (request) => {
    await requireAdmin(request, true);
    const paymentId = safeId(request.data?.paymentId, "");
    if (!paymentId) throw new HttpsError("invalid-argument", "paymentId is required.");
    const snap = await db.collection("payment_transactions").doc(paymentId).get();
    if (!snap.exists) throw new HttpsError("not-found", "Payment transaction not found.");
    const data = snap.data() || {};
    const storagePath = text(data.paymentProofPath || data.receiptPath);
    const generation = text(data.paymentProofGeneration || data.receiptGeneration);
    if (!storagePath || !generation) throw new HttpsError("not-found", "Immutable payment evidence was not found.");
    const [url] = await admin.storage().bucket().file(storagePath, { generation }).getSignedUrl({
      action: "read",
      expires: Date.now() + 10 * 60 * 1000,
      responseDisposition: "inline",
    });
    return { url, expiresAtMs: Date.now() + 10 * 60 * 1000 };
  },
);

export const verifyProductionAppCheckAttestation = onCall(
  { cors: true, enforceAppCheck: true },
  async (request) => {
    if (!request.app?.appId) throw new HttpsError("failed-precondition", "Firebase App Check attestation is missing.");
    const nonce = text(request.data?.nonce).slice(0, 120);
    return {
      status: "APP_CHECK_VERIFIED",
      appId: request.app.appId,
      tokenIssuedAtMs: finite((request.app as any)?.token?.iat) * 1000 || null,
      nonceHash: nonce ? crypto.createHash("sha256").update(nonce).digest("hex") : null,
      verifiedAt: new Date().toISOString(),
    };
  },
);
