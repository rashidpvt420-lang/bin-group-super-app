import { FieldValue } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { calculateOwnerOnboardingQuote } from "./ownerOnboardingQuote";
import { isValidOwnerSubmittedGps } from "./ownerSubmittedGps";
import { verifiedOwnerDocumentPaths } from "./ownerOnboardingDocuments";
import { loadActivePaymentConfiguration } from "./paymentConfiguration";
import { normalizeAedMoney } from "./shared/aedMoney";
import { parseExactAedAmount } from "./shared/aedMoneyInput";
import { requireMfaFinanceAdminActor } from "./financeAdminMfa";
import { assertOtpApplicationBinding, decideOwnerApplicationSubmission } from "./ownerApplicationBinding";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const ts = () => FieldValue.serverTimestamp();
const smtpUser = defineSecret("SMTP_USER");
const smtpPass = defineSecret("SMTP_PASS");
const otpPepper = defineSecret("OWNER_CONTRACT_OTP_PEPPER");

const OWNER_WORKFLOW_VERSION = "OWNER_FIVE_PAGE_INSPECTION_FIRST_V1";
const OTP_TTL_MINUTES = 10;
const OTP_EVIDENCE_TTL_HOURS = 2;
const MAX_OTP_ATTEMPTS = 5;
const MAX_OTP_REQUESTS_PER_HOUR = 5;
const OTP_HASH_ALGORITHM = "HMAC_SHA256_OWNER_INSPECTION_V1";
const BRANDED_FROM = "BIN GROUP <ceo@bin-groups.com>";
const BRANDED_REPLY_TO = "BIN GROUP Admin <ceo@bin-groups.com>";
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "manager", "operations_admin", "finance_admin"]);
const CONTRACT_NAMES = new Map<string, string>([
  ["FM_ONLY", "MAINTENANCE ONLY"],
  ["PM_ONLY", "PROPERTY MANAGEMENT"],
  ["BOTH", "TOTAL CARE HYBRID"],
]);

type PlainRecord = Record<string, any>;
type ContractMode = "FM_ONLY" | "PM_ONLY" | "BOTH";

type OwnerIdentity = {
  uid: string;
  email: string;
};

type AdminIdentity = {
  uid: string;
  email: string;
};

const text = (value: unknown) => String(value ?? "").trim();
const lower = (value: unknown) => text(value).toLowerCase();
const upper = (value: unknown) => text(value).toUpperCase();
const finite = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
// Same half-up fils rule as the quote engine, so the 15% deposit check cannot disagree with the quote.
const money = (value: unknown) => normalizeAedMoney(finite(value));
const safeId = (value: unknown, fallback: string) => text(value)
  .replace(/[^A-Za-z0-9_-]/g, "_")
  .replace(/_+/g, "_")
  .slice(0, 160) || fallback;

function cleanPlain(value: any): any {
  if (value === undefined || typeof value === "function") return null;
  if (value === null) return null;
  if (value instanceof admin.firestore.GeoPoint) return value;
  if (value instanceof admin.firestore.Timestamp) return value;
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

async function requireOwner(request: any): Promise<OwnerIdentity> {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Owner authentication required.");
  if (request.auth.token?.email_verified !== true || request.auth.token?.suspended === true) {
    throw new HttpsError("permission-denied", "A verified, active Owner account is required.");
  }
  if (roleOf(request.auth.token) !== "owner") throw new HttpsError("permission-denied", "Owner role required.");
  const user = await admin.auth().getUser(request.auth.uid);
  if (user.disabled || !user.emailVerified) throw new HttpsError("permission-denied", "The Owner account is not active and verified.");
  return {
    uid: request.auth.uid,
    email: validEmail(request.auth.token?.email || user.email),
  };
}

async function requireAdmin(request: any): Promise<AdminIdentity> {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Admin authentication required.");
  const token = request.auth.token || {};
  const role = roleOf(token);
  if (token.suspended === true) throw new HttpsError("permission-denied", "Suspended Admin account.");
  if (!(ADMIN_ROLES.has(role) || token.admin === true || token.isAdmin === true || token.superAdmin === true || token.super_admin === true)) {
    throw new HttpsError("permission-denied", "Admin permission required.");
  }
  const user = await admin.auth().getUser(request.auth.uid);
  if (user.disabled) throw new HttpsError("permission-denied", "Disabled Admin account.");
  return { uid: request.auth.uid, email: lower(request.auth.token?.email || user.email) };
}

function propertyMode(property: PlainRecord): ContractMode {
  const strategy = lower(property.strategy || property.serviceModel || property.contractMode || property.contractType);
  if (["fm", "fm_only", "maintenance", "maintenance_only"].includes(strategy)) return "FM_ONLY";
  if (["pm", "pm_only", "rent", "property_management"].includes(strategy)) return "PM_ONLY";
  if (["both", "hybrid", "combined", "total_care", "total-care"].includes(strategy)) return "BOTH";
  throw new HttpsError("invalid-argument", "Select Maintenance, Property Management, or Hybrid service for every property.");
}

function normalizeGeo(value: PlainRecord) {
  const rawLat = value?.geo?.lat ?? value?.geo?.point?.latitude ?? value?.lat;
  const rawLng = value?.geo?.lng ?? value?.geo?.point?.longitude ?? value?.lng;
  if (!isValidOwnerSubmittedGps(rawLat, rawLng)) {
    throw new HttpsError("failed-precondition", "A valid property GPS location is required before submission.");
  }
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  return {
    ...(cleanPlain(value?.geo || {})),
    point: new admin.firestore.GeoPoint(lat, lng),
    lat,
    lng,
    verified: false,
    dispatchReady: false,
    requiresGeoReview: true,
    source: ownerGeoSource(value?.geo?.source),
  };
}

// F-8: an Owner submission must never carry a server-authority geo provenance tag
// ("admin_manual" is the Founder-MFA verification source, "physical_inspection" the
// inspection-evidence source). Owner-typed pins are tagged "owner_manual".
const SERVER_AUTHORITY_GEO_SOURCES = new Set(["admin_manual", "physical_inspection", "founder_mfa_review"]);
function ownerGeoSource(raw: unknown) {
  const source = text(raw || "owner_five_page_submission");
  return SERVER_AUTHORITY_GEO_SOURCES.has(source.toLowerCase()) ? "owner_manual" : source;
}

function quoteFor(properties: PlainRecord[], selectedAddOns: string[], quotedAtMs?: number) {
  return calculateOwnerOnboardingQuote(properties, selectedAddOns, quotedAtMs, { trustServerVerifiedRates: false });
}

function assertQuote(data: PlainRecord, properties: PlainRecord[], selectedAddOns: string[]) {
  const quotedAtMs = finite(data.quoteQuotedAtMs || data.quotedAtMs);
  if (!quotedAtMs || quotedAtMs > Date.now() + 60_000) throw new HttpsError("failed-precondition", "The signed server quotation timestamp is missing or invalid.");
  const quote = quoteFor(properties, selectedAddOns, quotedAtMs);
  if (Number(quote.expiresAtMs || 0) <= Date.now()) throw new HttpsError("failed-precondition", "The signed quotation expired. Return to Contract and request a fresh quote.");
  if (text(data.quoteHash).toLowerCase() !== quote.quoteHash) throw new HttpsError("failed-precondition", "The submitted properties no longer match the signed server quotation.");
  if (money(quote.activationDeposit) !== money(Number(quote.annualContractValue) * 0.15)) {
    throw new HttpsError("failed-precondition", "The server quotation does not contain the required 15% mobilisation deposit.");
  }
  return quote;
}

// F-7: quoteHash is an unkeyed SHA-256 over the quote body, including the client-supplied
// quotedAtMs, so a client could recompute it with a fresh timestamp and bypass the 72 h expiry.
// Every quote the server issues is now recorded, and submission requires the issuance record for
// this Owner with the same hash and timestamp.
const QUOTE_ISSUANCE_COLLECTION = "owner_quote_issuances";
const quoteIssuanceId = (uid: string, quoteHash: string) => `${uid}_${quoteHash}`;

async function recordServerQuoteIssuance(uid: string, quote: PlainRecord) {
  const expiresAtMs = Number(quote.expiresAtMs || 0);
  await db.collection(QUOTE_ISSUANCE_COLLECTION).doc(quoteIssuanceId(uid, text(quote.quoteHash))).set({
    uid,
    quoteHash: text(quote.quoteHash),
    quotedAtMs: Number(quote.quotedAtMs || 0),
    expiresAtMs,
    annualContractValue: Number(quote.annualContractValue || 0),
    activationDeposit: Number(quote.activationDeposit || 0),
    source: "previewOwnerInspectionQuote",
    createdAt: FieldValue.serverTimestamp(),
    // Eligible for a Firestore TTL policy once the quote can no longer be submitted.
    purgeAfter: admin.firestore.Timestamp.fromMillis(expiresAtMs + 7 * 24 * 60 * 60 * 1000),
  });
}

async function assertServerIssuedQuote(uid: string, quote: PlainRecord) {
  const snap = await db.collection(QUOTE_ISSUANCE_COLLECTION).doc(quoteIssuanceId(uid, text(quote.quoteHash))).get();
  const issued = snap.data() || {};
  if (
    !snap.exists ||
    text(issued.uid) !== uid ||
    text(issued.quoteHash) !== text(quote.quoteHash) ||
    Number(issued.quotedAtMs) !== Number(quote.quotedAtMs) ||
    Number(issued.expiresAtMs || 0) <= Date.now()
  ) {
    throw new HttpsError("failed-precondition", "This quotation was not issued by the server for your account or has expired. Return to Contract and request a fresh quote.");
  }
}

function otpDigest(args: { requestId: string; uid: string; contractHash: string; otp: string; salt: string; pepper: string }) {
  return crypto.createHmac("sha256", args.pepper).update([
    OTP_HASH_ALGORITHM,
    args.requestId,
    args.uid,
    args.contractHash,
    args.otp,
    args.salt,
  ].join("\n")).digest("hex");
}

function requireOtpPepper() {
  const value = otpPepper.value() || process.env.OWNER_CONTRACT_OTP_PEPPER || "";
  if (value.length < 32) throw new HttpsError("failed-precondition", "Owner contract OTP verification is not securely configured.");
  return value;
}

async function createTransporter() {
  const nodemailer = await import("nodemailer");
  const user = smtpUser.value() || process.env.SMTP_USER || "";
  const pass = smtpPass.value() || process.env.SMTP_PASS || "";
  if (!user || !pass) throw new HttpsError("failed-precondition", "SMTP email service is not configured.");
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.sendgrid.net",
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

async function sendOtpEmail(to: string, otp: string, contractId: string, propertyName: string, requestId: string) {
  const from = process.env.MAIL_FROM || process.env.SMTP_FROM || BRANDED_FROM;
  const replyTo = process.env.MAIL_REPLY_TO || process.env.SMTP_REPLY_TO || BRANDED_REPLY_TO;
  if (from !== BRANDED_FROM || replyTo !== BRANDED_REPLY_TO) throw new HttpsError("failed-precondition", "Owner OTP email sender is not the approved BIN GROUP identity.");
  const info = await (await createTransporter()).sendMail({
    from,
    replyTo,
    to,
    subject: "BIN GROUP property application signature OTP",
    text: `Your BIN GROUP signature OTP is ${otp}. It expires in ${OTP_TTL_MINUTES} minutes. Application: ${contractId}. Verification: ${requestId}.`,
    html: `<div style="font-family:Arial,sans-serif;color:#111827"><h2>BIN GROUP Signature Verification</h2><p>Use this code to sign the five-page property application for <b>${propertyName || "your property"}</b>.</p><p style="font-size:30px;font-weight:800;letter-spacing:5px">${otp}</p><p>Expires in ${OTP_TTL_MINUTES} minutes.</p><p>Application reference: ${contractId}</p><p>Verification reference: ${requestId}</p></div>`,
  });
  const messageId = text(info.messageId);
  const accepted = Array.isArray(info.accepted) ? info.accepted.map((entry: unknown) => lower(entry)) : [];
  if (!messageId || !accepted.includes(lower(to))) throw new HttpsError("internal", "Owner signature email could not be delivered.");
  return { messageId, accepted, from, replyTo };
}

async function enforceOtpRate(uid: string) {
  const ref = db.collection("contract_signature_otp_rate_limits").doc(uid);
  const nowMs = Date.now();
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const data = snap.data() || {};
    const started = data.windowStartedAt?.toMillis?.() || 0;
    const current = started && nowMs - started < 60 * 60 * 1000;
    const count = current ? finite(data.count) : 0;
    if (count >= MAX_OTP_REQUESTS_PER_HOUR) throw new HttpsError("resource-exhausted", "Too many OTP requests. Try again after one hour.");
    transaction.set(ref, {
      count: count + 1,
      uid,
      windowStartedAt: current ? data.windowStartedAt : admin.firestore.Timestamp.fromMillis(nowMs),
      updatedAt: ts(),
    }, { merge: true });
  });
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
  if (consumedFor && consumedFor !== args.contractId) throw new HttpsError("failed-precondition", "Signature OTP evidence was already used for another application.");
}

export const previewOwnerInspectionQuote = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
  await requireOwner(request);
  const properties: PlainRecord[] = Array.isArray(request.data?.properties)
    ? request.data.properties.map((property: unknown) => cleanPlain(property))
    : [];
  if (!properties.length || properties.length > 100) throw new HttpsError("invalid-argument", "One to 100 properties are required.");
  const selectedAddOns: string[] = Array.isArray(request.data?.selectedAddOns)
    ? request.data.selectedAddOns.map((value: unknown) => text(value)).filter(Boolean).slice(0, 50)
    : [];
  const quote = quoteFor(properties, selectedAddOns);
  await recordServerQuoteIssuance(request.auth!.uid, quote);
  return quote;
});

export const requestOwnerInspectionSignatureOtp = onCall({
  cors: true,
  enforceAppCheck: true,
  secrets: [smtpUser, smtpPass, otpPepper],
}, async (request) => {
  const owner = await requireOwner(request);
  const contractId = safeId(request.data?.contractId, `owner_application_${owner.uid}`);
  const contractHash = lower(request.data?.contractHash);
  const propertyName = text(request.data?.propertyName || "BIN GROUP property application").slice(0, 180);
  if (!/^[a-f0-9]{64}$/.test(contractHash)) throw new HttpsError("failed-precondition", "A server-authoritative quotation hash is required.");
  // F-1: an OTP may only be issued for the caller's own application (or a new, well-formed one).
  const [bindingIntakeSnap, bindingContractSnap] = await Promise.all([
    db.collection("intake_submissions").doc(contractId).get(),
    db.collection("contracts").doc(contractId).get(),
  ]);
  assertOtpApplicationBinding({
    callerUid: owner.uid,
    applicationId: contractId,
    intake: bindingIntakeSnap.exists ? bindingIntakeSnap.data() || {} : null,
    contract: bindingContractSnap.exists ? bindingContractSnap.data() || {} : null,
  });
  await enforceOtpRate(owner.uid);
  const ref = db.collection("contract_signature_otps").doc();
  const otp = String(crypto.randomInt(100000, 1000000));
  const salt = crypto.randomBytes(18).toString("hex");
  const delivery = await sendOtpEmail(owner.email, otp, contractId, propertyName, ref.id);
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  await ref.set({
    uid: owner.uid,
    email: owner.email,
    contractId,
    contractHash,
    propertyName,
    channel: "email",
    otpHash: otpDigest({ requestId: ref.id, uid: owner.uid, contractHash, otp, salt, pepper: requireOtpPepper() }),
    otpHashAlgorithm: OTP_HASH_ALGORITHM,
    salt,
    attempts: 0,
    maxAttempts: MAX_OTP_ATTEMPTS,
    status: "PENDING",
    delivery: { provider: "smtp", ...delivery, providerAccepted: true, sentAt: ts() },
    expiresAt,
    createdAt: ts(),
    updatedAt: ts(),
  });
  return { ok: true, requestId: ref.id, contractId, expiresAt: expiresAt.toMillis(), deliveryConfirmed: true };
});

export const verifyOwnerInspectionSignatureOtp = onCall({
  cors: true,
  enforceAppCheck: true,
  secrets: [otpPepper],
}, async (request) => {
  const owner = await requireOwner(request);
  const requestId = text(request.data?.requestId);
  const otp = text(request.data?.otp);
  const signature = text(request.data?.signature).slice(0, 180);
  if (!requestId || !/^\d{6}$/.test(otp) || signature.length < 3) throw new HttpsError("invalid-argument", "OTP request, six-digit code, and signature name are required.");
  const pepper = requireOtpPepper();
  const ref = db.collection("contract_signature_otps").doc(requestId);
  const result = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return { outcome: "NOT_FOUND", data: {} as PlainRecord };
    const data = snap.data() || {};
    if (text(data.uid) !== owner.uid || lower(data.email) !== owner.email) return { outcome: "FORBIDDEN", data };
    if (upper(data.status) === "VERIFIED") return text(data.signature) === signature ? { outcome: "VERIFIED", data } : { outcome: "SIGNATURE_MISMATCH", data };
    const attempts = finite(data.attempts);
    if (attempts >= MAX_OTP_ATTEMPTS) return { outcome: "MAX_ATTEMPTS", data };
    const expiresAt = data.expiresAt?.toMillis?.() || 0;
    if (!expiresAt || Date.now() > expiresAt) {
      transaction.set(ref, { status: "EXPIRED", updatedAt: ts() }, { merge: true });
      return { outcome: "EXPIRED", data };
    }
    const submitted = otpDigest({ requestId, uid: owner.uid, contractHash: lower(data.contractHash), otp, salt: text(data.salt), pepper });
    const expected = text(data.otpHash);
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(submitted, "hex");
    if (!a.length || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      transaction.set(ref, { attempts: attempts + 1, lastFailedAt: ts(), updatedAt: ts() }, { merge: true });
      return { outcome: "INVALID", data };
    }
    transaction.set(ref, {
      status: "VERIFIED",
      signature,
      verifiedAt: ts(),
      evidenceExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + OTP_EVIDENCE_TTL_HOURS * 60 * 60 * 1000),
      updatedAt: ts(),
    }, { merge: true });
    return { outcome: "VERIFIED", data: { ...data, signature } };
  });
  if (result.outcome === "NOT_FOUND") throw new HttpsError("not-found", "OTP request not found.");
  if (result.outcome === "FORBIDDEN") throw new HttpsError("permission-denied", "OTP request does not belong to this Owner.");
  if (result.outcome === "MAX_ATTEMPTS") throw new HttpsError("resource-exhausted", "Maximum OTP attempts exceeded.");
  if (result.outcome === "EXPIRED") throw new HttpsError("deadline-exceeded", "OTP expired. Request a new code.");
  if (result.outcome === "INVALID") throw new HttpsError("permission-denied", "Invalid OTP.");
  if (result.outcome === "SIGNATURE_MISMATCH") throw new HttpsError("failed-precondition", "OTP is bound to another signature name.");
  return { ok: true, verificationId: requestId, contractId: text(result.data.contractId), verifiedAt: Date.now() };
});

export const uploadOwnerInspectionProofDocument = onCall({ cors: true, enforceAppCheck: true, memory: "512MiB" }, async (request) => {
  const owner = await requireOwner(request);
  const requestedUid = text(request.data?.ownerUid || owner.uid);
  const requestedEmail = validEmail(request.data?.ownerEmail || owner.email);
  if (requestedUid !== owner.uid || requestedEmail !== owner.email) throw new HttpsError("permission-denied", "Document owner does not match the signed-in Owner.");
  const intakeId = safeId(request.data?.intakeId || request.data?.onboardingSessionId, owner.uid);
  const docType = safeId(request.data?.docType, "document");
  const filename = text(request.data?.filename || `${docType}.bin`).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 180);
  const contentType = text(request.data?.contentType || "application/octet-stream");
  const encoded = text(request.data?.encodedDocument);
  if (!contentType.match(/^image\//) && contentType !== "application/pdf" && contentType !== "application/octet-stream") throw new HttpsError("invalid-argument", "Only PDF and image documents are allowed.");
  const buffer = Buffer.from(encoded.includes(",") ? encoded.split(",").pop() || "" : encoded, "base64");
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) throw new HttpsError("invalid-argument", "Document is empty or exceeds 8 MB.");
  const storagePath = `onboarding-proof/${owner.uid}/${intakeId}/${docType}/${Date.now()}_${filename}`;
  const bucket = admin.storage().bucket();
  await bucket.file(storagePath).save(buffer, {
    resumable: false,
    metadata: {
      contentType,
      metadata: {
        // F-6: no firebaseStorageDownloadTokens: no permanent bearer URL for identity documents.
        ownerUid: owner.uid,
        intakeId,
        docType,
        uploadedBy: owner.email,
        uploadedAt: new Date().toISOString(),
      },
    },
  });
  return { success: true, storagePath, docType, size: buffer.length, sha256: crypto.createHash("sha256").update(buffer).digest("hex") };
});

export const submitOwnerInspectionFirstOnboarding = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
  const owner = await requireOwner(request);
  const data: PlainRecord = request.data || {};
  const intakeId = safeId(data.intakeId || data.onboardingSessionId, `owner_${owner.uid}`);
  const ownerEmail = validEmail(data.ownerEmail || owner.email);
  if (ownerEmail !== owner.email || text(data.ownerUid || owner.uid) !== owner.uid) throw new HttpsError("permission-denied", "Owner identity does not match the signed-in account.");
  const properties: PlainRecord[] = Array.isArray(data.properties)
    ? data.properties.map((property: unknown) => cleanPlain(property))
    : [];
  if (!properties.length || properties.length > 100) throw new HttpsError("invalid-argument", "One to 100 properties are required.");
  const modes: ContractMode[] = properties.map((property: PlainRecord) => propertyMode(property));
  if (modes.some((mode: ContractMode) => mode !== modes[0])) throw new HttpsError("failed-precondition", "One application cannot mix different contract service modes.");
  const contractMode = modes[0];
  const canonicalPlanName = CONTRACT_NAMES.get(contractMode);
  if (!canonicalPlanName) throw new HttpsError("failed-precondition", "The contract service mode could not be resolved.");
  const selectedAddOns: string[] = Array.isArray(data.selectedAddOns)
    ? data.selectedAddOns.map((value: unknown) => text(value)).filter(Boolean).slice(0, 50)
    : [];
  const quote = assertQuote(data, properties, selectedAddOns);
  await assertServerIssuedQuote(owner.uid, quote);
  const signatureName = text(data.signatureName).slice(0, 180);
  const verificationId = text(data.otpVerificationId || data.contractOtpVerificationId);
  if (signatureName.length < 3 || !verificationId) throw new HttpsError("failed-precondition", "A verified digital signature is required.");
  const documentPaths = await verifiedOwnerDocumentPaths(owner.uid, data);
  const companyProfile: PlainRecord = cleanPlain(data.companyProfile || {});
  const fullName = text(data.ownerName || companyProfile.contactPerson || data.signatureName).slice(0, 160);
  const mobile = text(data.ownerMobile || companyProfile.phone).slice(0, 60);
  const contractId = intakeId;
  // A concrete server timestamp is required because normalizedProperties is
  // also embedded inside intake/contract arrays. Firestore field transforms
  // (including serverTimestamp) are invalid inside array values and otherwise
  // make this callable fail as an opaque HTTP 500.
  const now = admin.firestore.Timestamp.now();
  const paymentRef = db.collection("payment_transactions").doc(intakeId);
  const contractRef = db.collection("contracts").doc(contractId);
  const intakeRef = db.collection("intake_submissions").doc(intakeId);
  const otpRef = db.collection("contract_signature_otps").doc(verificationId);
  const propertyRefs = properties.map((_property: PlainRecord, index: number) =>
    db.collection("properties").doc(safeId(`${intakeId}_property_${index + 1}`, `owner_${owner.uid}_property_${index + 1}`)));
  const snapshotRecord = (snap: FirebaseFirestore.DocumentSnapshot) => (snap.exists ? snap.data() || {} : null);
  // F-1: bind every existing application record to the caller and refuse to reset progressed applications.
  const [existingIntake, existingContract, existingPayment, ...existingProperties] = await Promise.all([
    intakeRef.get(), contractRef.get(), paymentRef.get(), ...propertyRefs.map((ref) => ref.get()),
  ]);
  const initialDecision = decideOwnerApplicationSubmission({
    callerUid: owner.uid,
    applicationId: intakeId,
    records: {
      intake: snapshotRecord(existingIntake),
      contract: snapshotRecord(existingContract),
      payment: snapshotRecord(existingPayment),
      properties: existingProperties.map(snapshotRecord),
    },
  });
  if (initialDecision === "IDEMPOTENT") {
    return { success: true, idempotent: true, intakeId, contractId, paymentId: intakeId, nextState: "ADMIN_PROPERTY_REVIEW" };
  }

  const transactionOutcome = await db.runTransaction(async (transaction) => {
    const [otpSnap, freshIntake, freshContract, freshPayment, ...freshProperties] = await Promise.all([
      transaction.get(otpRef), transaction.get(intakeRef), transaction.get(contractRef), transaction.get(paymentRef),
      ...propertyRefs.map((ref) => transaction.get(ref)),
    ]);
    const decision = decideOwnerApplicationSubmission({
      callerUid: owner.uid,
      applicationId: intakeId,
      records: {
        intake: snapshotRecord(freshIntake),
        contract: snapshotRecord(freshContract),
        payment: snapshotRecord(freshPayment),
        properties: freshProperties.map(snapshotRecord),
      },
    });
    if (decision === "IDEMPOTENT") return "IDEMPOTENT" as const;
    // Brand-new records are created (fail if they appeared concurrently); existing ones were verified above.
    const writeRecord = (ref: FirebaseFirestore.DocumentReference, exists: boolean, value: PlainRecord) => {
      if (exists) transaction.set(ref, value, { merge: true });
      else transaction.create(ref, value);
    };
    if (!otpSnap.exists) throw new HttpsError("failed-precondition", "Signature OTP verification was not found.");
    const otpData = otpSnap.data() || {};
    assertVerifiedOtp(otpData, { uid: owner.uid, contractId, contractHash: quote.quoteHash, signature: signatureName });
    transaction.set(otpRef, { consumedFor: contractId, consumedAt: otpData.consumedAt || now, updatedAt: now }, { merge: true });

    const normalizedProperties: PlainRecord[] = properties.map((property: PlainRecord, index: number) => {
      const clientDraftId = safeId(property.id || property.propertyId, `draft_property_${index + 1}`);
      const propertyId = safeId(`${intakeId}_property_${index + 1}`, `owner_${owner.uid}_property_${index + 1}`);
      return {
        ...property,
        clientDraftId,
        id: propertyId,
        propertyId,
        ownerUid: owner.uid,
        ownerId: owner.uid,
        ownerEmail,
        intakeId,
        contractId,
        quoteHash: quote.quoteHash,
        geo: normalizeGeo(property),
        status: "PENDING_PROPERTY_INSPECTION",
        activationStatus: "LOCKED_PENDING_INSPECTION_AND_PAYMENT",
        inspectionStatus: "PENDING",
        locationVerified: false,
        paymentVerified: false,
        adminApproved: false,
        updatedAt: now,
      };
    });

    writeRecord(intakeRef, freshIntake.exists, {
      id: intakeId,
      intakeId,
      workflowVersion: OWNER_WORKFLOW_VERSION,
      source: "PUBLIC_OWNER_FIVE_PAGE_APPLICATION",
      status: "SUBMITTED_FOR_PROPERTY_INSPECTION",
      adminReviewState: "AWAITING_PROPERTY_REVIEW_AND_SITE_VISIT",
      inspectionStatus: "PENDING",
      activationState: "LOCKED_PENDING_INSPECTION_AND_PAYMENT",
      paymentStatus: "NOT_DUE_UNTIL_INSPECTION_COMPLETE",
      paymentCollectionStage: "AFTER_ADMIN_SITE_VISIT",
      ownerUid: owner.uid,
      ownerId: owner.uid,
      ownerName: fullName,
      ownerEmail,
      ownerMobile: mobile,
      companyProfile,
      contactInfo: { name: fullName, email: ownerEmail, phone: mobile, licenseNumber: text(companyProfile.licenseNumber) },
      properties: normalizedProperties,
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
        totalUnits: normalizedProperties.reduce((sum: number, property: PlainRecord) => sum + finite(property.units), 0),
        estimatedACV: money(quote.annualContractValue),
        recommendedTier: canonicalPlanName,
      },
      documentPaths,
      documentUrls: {},
      proofDocuments: Object.fromEntries(
        Object.entries(documentPaths).map(([key, storagePath]) => [key, { label: key, storagePath }]),
      ),
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
    });

    writeRecord(contractRef, freshContract.exists, {
      id: contractId,
      contractId,
      intakeId,
      workflowVersion: OWNER_WORKFLOW_VERSION,
      ownerUid: owner.uid,
      ownerId: owner.uid,
      ownerEmail,
      ownerName: fullName,
      propertyIds: normalizedProperties.map((property: PlainRecord) => property.propertyId),
      properties: normalizedProperties,
      status: "SIGNED",
      contractStatus: "SIGNED",
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
      documentPaths,
      documentUrls: {},
      createdAt: now,
      updatedAt: now,
    });

    writeRecord(paymentRef, freshPayment.exists, {
      id: intakeId,
      paymentId: intakeId,
      intakeId,
      contractId,
      workflowVersion: OWNER_WORKFLOW_VERSION,
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
      status: "NOT_DUE_UNTIL_INSPECTION_COMPLETE",
      paymentStatus: "NOT_DUE_UNTIL_INSPECTION_COMPLETE",
      verificationState: "INSPECTION_REQUIRED_BEFORE_PAYMENT",
      adminApprovalRequired: true,
      unlocksDashboard: false,
      ownerSigned: true,
      signatureName,
      otpVerificationId: verificationId,
      createdAt: now,
      updatedAt: now,
    });

    normalizedProperties.forEach((property: PlainRecord, index: number) => {
      writeRecord(db.collection("properties").doc(property.propertyId), Boolean(freshProperties[index]?.exists), { ...property, createdAt: now });
    });

    const ownerPatch = {
      role: "owner",
      status: "pending_property_inspection",
      onboardingStatus: "SUBMITTED_AWAITING_ADMIN_SITE_VISIT",
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
      body: "BIN GROUP will review your five-page application and arrange a property visit. The 15% mobilisation payment becomes due only after every required visit is completed.",
      read: false,
      createdAt: now,
    });
    transaction.set(db.collection("audit_logs").doc(), {
      actorId: owner.uid,
      actorRole: "owner",
      action: "SUBMIT_OWNER_FIVE_PAGE_INSPECTION_FIRST_APPLICATION",
      targetType: "intake_submissions",
      targetId: intakeId,
      metadata: { contractId, paymentId: intakeId, propertyCount: normalizedProperties.length, quoteHash: quote.quoteHash },
      createdAt: now,
    });
    return "WRITTEN" as const;
  });

  if (transactionOutcome === "IDEMPOTENT") {
    return { success: true, idempotent: true, intakeId, contractId, paymentId: intakeId, nextState: "ADMIN_PROPERTY_REVIEW" };
  }

  return {
    success: true,
    idempotent: false,
    intakeId,
    contractId,
    paymentId: intakeId,
    annualContractValue: money(quote.annualContractValue),
    activationDeposit: money(quote.activationDeposit),
    nextState: "ADMIN_PROPERTY_REVIEW_AND_SITE_VISIT",
    dashboardLocked: true,
  };
});

export const adminCompleteOwnerPropertyInspection = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
  const actor = await requireAdmin(request);
  const intakeId = safeId(request.data?.intakeId, "");
  const notes = text(request.data?.notes || request.data?.inspectionNotes);
  if (!intakeId) throw new HttpsError("invalid-argument", "intakeId is required.");
  if (notes.length < 8) throw new HttpsError("invalid-argument", "Record clear property inspection notes.");

  const intakeRef = db.collection("intake_submissions").doc(intakeId);
  const paymentRef = db.collection("payment_transactions").doc(intakeId);
  const contractRef = db.collection("contracts").doc(intakeId);
  const [intakeSnap, paymentSnap, contractSnap] = await Promise.all([intakeRef.get(), paymentRef.get(), contractRef.get()]);
  if (!intakeSnap.exists || !paymentSnap.exists || !contractSnap.exists) throw new HttpsError("failed-precondition", "The inspection-first onboarding package is incomplete.");
  const intake = intakeSnap.data() || {};
  if (text(intake.workflowVersion) !== OWNER_WORKFLOW_VERSION) throw new HttpsError("failed-precondition", "This action is only for the five-page inspection-first workflow.");

  const ownerUid = text(intake.ownerUid || intake.ownerId);
  const amount = money(paymentSnap.data()?.activationDeposit || paymentSnap.data()?.amount);
  const properties: PlainRecord[] = Array.isArray(intake.properties) ? intake.properties.map((property: unknown) => cleanPlain(property)) : [];
  if (!ownerUid || amount <= 0 || !properties.length) throw new HttpsError("failed-precondition", "Owner binding, portfolio properties, or 15% mobilisation amount is missing.");

  const linkedIds: string[] = Array.isArray(intake.inspectionIds)
    ? Array.from(new Set(intake.inspectionIds.map((value: unknown) => text(value)).filter(Boolean)))
    : [];
  const inspectionSnaps = linkedIds.length
    ? await Promise.all(linkedIds.map((inspectionId: string) => db.collection("property_inspections").doc(inspectionId).get()))
    : (await db.collection("property_inspections").where("intakeId", "==", intakeId).limit(100).get()).docs;
  const validInspections = inspectionSnaps.filter((snapshot) => snapshot.exists && upper(snapshot.data()?.status) !== "CANCELLED");
  if (validInspections.length !== properties.length) {
    throw new HttpsError("failed-precondition", `Complete one linked site inspection for every property. Expected ${properties.length}, found ${validInspections.length}.`);
  }
  validInspections.forEach((snapshot) => {
    if (text(snapshot.data()?.intakeId) !== intakeId) throw new HttpsError("failed-precondition", "A linked inspection belongs to another Owner application.");
  });

  const inspectionByPropertyId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot>();
  validInspections.forEach((snapshot) => {
    const propertyId = text(snapshot.data()?.propertyId);
    if (propertyId) inspectionByPropertyId.set(propertyId, snapshot);
  });
  if (inspectionByPropertyId.size !== properties.length) {
    throw new HttpsError("failed-precondition", "Every property must have one unique linked inspection before payment becomes due.");
  }

  const propertyQuery = await db.collection("properties").where("intakeId", "==", intakeId).limit(100).get();
  if (propertyQuery.size !== properties.length) throw new HttpsError("failed-precondition", "Canonical property records do not match the submitted portfolio.");

  const inspectionIds = validInspections.map((snapshot) => snapshot.id).sort();
  const now = ts();
  const batch = db.batch();
  validInspections.forEach((snapshot) => {
    batch.set(snapshot.ref, {
      status: "COMPLETED",
      inspectionStatus: "COMPLETED",
      notes,
      completedBy: actor.uid,
      completedByEmail: actor.email,
      completedAt: now,
      updatedAt: now,
    }, { merge: true });
  });
  batch.set(intakeRef, {
    inspectionId: inspectionIds[0],
    inspectionIds,
    inspectionCount: inspectionIds.length,
    inspectionStatus: "COMPLETED",
    adminReviewState: "INSPECTION_COMPLETE_AWAITING_15_PERCENT_PAYMENT",
    activationState: "LOCKED_PENDING_15_PERCENT_PAYMENT",
    paymentStatus: "PENDING_ADMIN_PAYMENT_VERIFICATION",
    paymentCollectionStage: "15_PERCENT_DUE_AFTER_COMPLETED_VISITS",
    inspectionNotes: notes,
    inspectionCompletedAt: now,
    inspectionCompletedBy: actor.uid,
    updatedAt: now,
  }, { merge: true });
  batch.set(paymentRef, {
    status: "PENDING_ADMIN_PAYMENT_VERIFICATION",
    paymentStatus: "PENDING_ADMIN_PAYMENT_VERIFICATION",
    verificationState: "ADMIN_PAYMENT_EVIDENCE_REQUIRED",
    adminApprovalRequired: true,
    unlocksDashboard: false,
    inspectionId: inspectionIds[0],
    inspectionIds,
    inspectionCount: inspectionIds.length,
    inspectionVerified: true,
    paymentDueAfterInspection: true,
    updatedAt: now,
  }, { merge: true });
  batch.set(contractRef, {
    status: "SIGNED",
    contractStatus: "SIGNED",
    activationStatus: "LOCKED_PENDING_15_PERCENT_PAYMENT",
    inspectionId: inspectionIds[0],
    inspectionIds,
    inspectionCount: inspectionIds.length,
    inspectionVerified: true,
    paymentStatus: "PENDING_ADMIN_PAYMENT_VERIFICATION",
    updatedAt: now,
  }, { merge: true });
  propertyQuery.docs.forEach((document) => {
    const property = document.data() || {};
    const inspection = inspectionByPropertyId.get(document.id) || inspectionByPropertyId.get(text(property.propertyId));
    if (!inspection) throw new HttpsError("failed-precondition", `No linked inspection exists for property ${document.id}.`);
    batch.set(document.ref, {
      status: "PAYMENT_PENDING",
      activationStatus: "LOCKED_PENDING_15_PERCENT_PAYMENT",
      inspectionStatus: "COMPLETED",
      inspectionId: inspection.id,
      locationVerified: true,
      adminSiteVisitVerified: true,
      geo: {
        ...(property.geo || {}),
        verified: true,
        requiresGeoReview: false,
        dispatchReady: true,
        verifiedBy: actor.uid,
        verifiedAt: now,
      },
      updatedAt: now,
    }, { merge: true });
  });
  batch.set(db.collection("users").doc(ownerUid), {
    status: "awaiting_activation_payment",
    onboardingStatus: "INSPECTION_COMPLETE_AWAITING_15_PERCENT_PAYMENT",
    dashboardLocked: true,
    dashboardUnlocked: false,
    updatedAt: now,
  }, { merge: true });
  batch.set(db.collection("owners").doc(ownerUid), {
    status: "AWAITING_ACTIVATION_PAYMENT",
    onboardingStatus: "INSPECTION_COMPLETE_AWAITING_15_PERCENT_PAYMENT",
    updatedAt: now,
  }, { merge: true });
  batch.set(db.collection("notifications").doc(), {
    userId: ownerUid,
    toRole: "owner",
    type: "OWNER_INSPECTION_COMPLETE_PAYMENT_DUE",
    title: "Property visits completed",
    body: `All required property visits are complete. The 15% mobilisation payment of AED ${amount.toLocaleString("en-AE")} is now due for Admin verification.`,
    read: false,
    createdAt: now,
  });
  batch.set(db.collection("audit_logs").doc(), {
    actorId: actor.uid,
    actorRole: "admin",
    action: "COMPLETE_OWNER_PORTFOLIO_PROPERTY_INSPECTIONS",
    targetType: "intake_submissions",
    targetId: intakeId,
    metadata: { intakeId, paymentId: intakeId, amount, inspectionIds, propertyCount: properties.length },
    createdAt: now,
  });
  await batch.commit();
  return {
    status: "COMPLETED",
    intakeId,
    inspectionId: inspectionIds[0],
    inspectionIds,
    paymentId: intakeId,
    activationDeposit: amount,
    nextState: "AWAITING_15_PERCENT_PAYMENT",
  };
});

export const adminRecordOwnerMobilizationPaymentEvidence = onCall({ cors: true, enforceAppCheck: true, memory: "512MiB" }, async (request) => {
  // F-2: recording 15% payment evidence is a payment decision: MFA finance Admin only.
  const actor = await requireMfaFinanceAdminActor(request);
  const paymentId = safeId(request.data?.paymentId, "");
  const reference = text(request.data?.paymentReferenceId || request.data?.reference);
  const method = upper(request.data?.paymentMethod || request.data?.method);
  const filename = text(request.data?.filename || "mobilisation-receipt.pdf").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 160);
  const contentType = text(request.data?.contentType || "application/pdf");
  const encoded = text(request.data?.encodedDocument);
  if (!paymentId || reference.length < 4) throw new HttpsError("invalid-argument", "Payment ID and a valid receipt reference are required.");
  if (!["CASH", "CHEQUE"].includes(method)) throw new HttpsError("invalid-argument", "Phase 1 Owner activation accepts Cash or Cheque only.");
  if (!contentType.match(/^image\//) && contentType !== "application/pdf") throw new HttpsError("invalid-argument", "Payment evidence must be a PDF or image.");
  const buffer = Buffer.from(encoded.includes(",") ? encoded.split(",").pop() || "" : encoded, "base64");
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new HttpsError("invalid-argument", "Payment evidence is empty or exceeds 10 MB.");
  const paymentRef = db.collection("payment_transactions").doc(paymentId);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) throw new HttpsError("not-found", "Payment transaction not found.");
  const payment = paymentSnap.data() || {};
  if (text(payment.workflowVersion) !== OWNER_WORKFLOW_VERSION || payment.inspectionVerified !== true) throw new HttpsError("failed-precondition", "Complete every Admin property visit before recording the 15% payment.");
  // F-2: never reopen an approved / verified payment by re-recording evidence.
  const recordedPaymentState = upper(payment.status || payment.paymentStatus);
  if (
    ["APPROVED", "PAID", "VERIFIED", "ACTIVE"].includes(recordedPaymentState) ||
    ["APPROVED", "PAID", "VERIFIED"].includes(upper(payment.paymentStatus)) ||
    payment.paymentVerified === true ||
    payment.approved === true
  ) {
    throw new HttpsError("failed-precondition", "This 15% payment is already approved. Evidence cannot be re-recorded on an approved payment.");
  }
  const contractSnap = await db.collection("contracts").doc(text(payment.contractId || payment.intakeId || paymentId)).get();
  const contract = contractSnap.data() || {};
  const finalQuoteHash = text(payment.finalVerifiedQuoteHash).toLowerCase();
  const contractQuoteHash = text(contract.quoteHash || contract.finalVerifiedQuoteHash).toLowerCase();
  if (
    !contractSnap.exists ||
    contract.ownerSigned !== true ||
    contract.signatureState?.ownerSigned !== true ||
    !text(contract.signedPdfUrl || contract.signatureState?.pdfUrl) ||
    !/^[a-f0-9]{64}$/.test(finalQuoteHash) ||
    contractQuoteHash !== finalQuoteHash
  ) {
    throw new HttpsError("failed-precondition", "Owner must OTP-sign the final verified quote and generate the locked contract PDF before the 15% payment can be recorded.");
  }
  const activeConfiguration = await loadActivePaymentConfiguration();
  if (!activeConfiguration.approvedMethods.includes(method)) {
    throw new HttpsError("failed-precondition", `The active corporate payment configuration does not approve ${method}.`);
  }
  const ownerUid = text(payment.ownerUid || payment.ownerId);
  const intakeId = text(payment.intakeId || paymentId);
  let expectedAmount: number;
  try {
    expectedAmount = normalizeAedMoney(payment.activationDeposit ?? payment.amount);
  } catch {
    throw new HttpsError("failed-precondition", "The locked 15% mobilisation deposit is invalid.");
  }
  if (!ownerUid || expectedAmount <= 0) {
    throw new HttpsError("failed-precondition", "Owner binding or locked 15% mobilisation deposit is invalid.");
  }
  if (request.data?.amountReceived !== undefined && request.data?.amountReceived !== null) {
    let submittedAmount: number;
    try {
      submittedAmount = parseExactAedAmount(request.data.amountReceived);
    } catch {
      throw new HttpsError("invalid-argument", "Received amount must be a finite AED value exact to the fils (at most 2 decimals).");
    }
    if (submittedAmount !== expectedAmount) {
      throw new HttpsError("failed-precondition", "Received amount must equal the locked 15% mobilisation deposit.");
    }
  }
  // The Admin browser may attest what was received, but the persisted financial amount
  // is always the server-locked schedule value, never a browser-controlled calculation.
  const amountReceived = expectedAmount;
  const receiptHash = crypto.createHash("sha256").update(buffer).digest("hex");
  const downloadToken = crypto.randomUUID();
  const storagePath = `payment-references/owners/${ownerUid}/${paymentId}/${Date.now()}_${filename}`;
  const bucket = admin.storage().bucket();
  await bucket.file(storagePath).save(buffer, {
    resumable: false,
    metadata: {
      contentType,
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
        ownerUid,
        paymentId,
        intakeId,
        evidenceType: "owner_payment_receipt",
        receiptHash,
        uploadedByAdmin: actor.uid,
        uploadedAt: new Date().toISOString(),
      },
    },
  });
  const [metadata] = await bucket.file(storagePath).getMetadata();
  const generation = text(metadata.generation);
  if (!generation) throw new HttpsError("internal", "Stored payment evidence has no immutable generation.");
  const receiptUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;
  const batch = db.batch();
  batch.set(paymentRef, {
    status: "PENDING_ADMIN_APPROVAL",
    paymentStatus: "PENDING_ADMIN_APPROVAL",
    verificationState: "PAYMENT_EVIDENCE_RECORDED",
    paymentMethod: method,
    method,
    paymentReferenceId: reference,
    paymentReference: reference,
    amountReceived,
    paymentConfigVersion: activeConfiguration.version,
    paymentConfigurationVersion: activeConfiguration.version,
    paymentConfigHash: activeConfiguration.configHash,
    paymentConfigurationHash: activeConfiguration.configHash,
    paymentManifest: {
      configVersion: activeConfiguration.version,
      configHash: activeConfiguration.configHash,
      legalBeneficiary: activeConfiguration.legalBeneficiary,
      currency: activeConfiguration.currency,
      officeLocation: activeConfiguration.officeLocation,
      approvedMethods: activeConfiguration.approvedMethods,
      selectedMethod: method,
      capturedAt: new Date().toISOString(),
    },
    paymentProofUrl: receiptUrl,
    paymentProofPath: storagePath,
    paymentProofHash: receiptHash,
    paymentProofGeneration: generation,
    paymentProofEvidence: { receiptUrl, storagePath, receiptHash, generation, recordedBy: actor.uid },
    receiptUrl,
    receiptPath: storagePath,
    receiptHash,
    receiptGeneration: generation,
    updatedAt: ts(),
  }, { merge: true });
  batch.set(db.collection("intake_submissions").doc(intakeId), {
    paymentStatus: "PENDING_ADMIN_APPROVAL",
    paymentEvidenceRecorded: true,
    paymentReferenceId: reference,
    updatedAt: ts(),
  }, { merge: true });
  batch.set(db.collection("audit_logs").doc(), {
    actorId: actor.uid,
    actorRole: "admin",
    action: "RECORD_OWNER_15_PERCENT_PAYMENT_EVIDENCE",
    targetType: "payment_transactions",
    targetId: paymentId,
    metadata: { intakeId, ownerUid, method, reference, amountReceived, receiptHash, generation, paymentConfigVersion: activeConfiguration.version, paymentConfigHash: activeConfiguration.configHash },
    createdAt: ts(),
  });
  await batch.commit();
  return { status: "RECORDED", paymentId, intakeId, amountReceived, method, paymentReferenceId: reference, receiptUrl, receiptHash, generation };
});

import type * as FirebaseFirestore from "firebase-admin/firestore";
