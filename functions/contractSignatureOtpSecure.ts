import { FieldValue } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const smtpUser = defineSecret("SMTP_USER");
const smtpPass = defineSecret("SMTP_PASS");

const OTP_TTL_MINUTES = 10;
const VERIFIED_EVIDENCE_TTL_HOURS = 2;
const MAX_ATTEMPTS = 5;
const MAX_REQUESTS_PER_HOUR = 5;
const OTP_HASH_ALGORITHM = "HMAC_SHA256_SMTP_SECRET_V1";
const TEST_EVIDENCE_ALGORITHM = "AES_256_GCM_SMTP_SECRET_V1";

function asText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeEmail(value: unknown) {
  return asText(value).toLowerCase();
}

function roleOf(token: Record<string, unknown> | undefined) {
  return asText(token?.role || token?.userRole || token?.primaryRole).toLowerCase();
}

function makeOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function requireOtpSecret() {
  const pass = smtpPass.value() || process.env.SMTP_PASS || "";
  if (!pass) {
    throw new HttpsError("failed-precondition", "OTP verification secret is not configured.");
  }
  return pass;
}

function hashOtp(otp: string, salt: string, pepper: string) {
  return crypto.createHmac("sha256", pepper).update(`${otp}:${salt}`).digest("hex");
}

function testEvidenceKey(secret: string) {
  return crypto.createHmac("sha256", secret)
    .update("BIN_GROUP_CONTRACT_OTP_TEST_EVIDENCE_V1")
    .digest();
}

function encryptTestEvidence(otp: string, secret: string, requestId: string, uid: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", testEvidenceKey(secret), iv);
  cipher.setAAD(Buffer.from(`${requestId}:${uid}`, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(otp, "utf8"), cipher.final()]);
  return {
    algorithm: TEST_EVIDENCE_ALGORITHM,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    retrieved: false,
  };
}

function decryptTestEvidence(
  evidence: FirebaseFirestore.DocumentData,
  secret: string,
  requestId: string,
  uid: string,
) {
  if (asText(evidence.algorithm) !== TEST_EVIDENCE_ALGORITHM) {
    throw new HttpsError("failed-precondition", "Protected OTP test evidence is unavailable or uses an unsupported format.");
  }
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      testEvidenceKey(secret),
      Buffer.from(asText(evidence.iv), "base64"),
    );
    decipher.setAAD(Buffer.from(`${requestId}:${uid}`, "utf8"));
    decipher.setAuthTag(Buffer.from(asText(evidence.authTag), "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(asText(evidence.ciphertext), "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new HttpsError("failed-precondition", "Protected OTP test evidence could not be decrypted.");
  }
}

async function createTransporter() {
  const nodemailer = await import("nodemailer");
  const user = smtpUser.value() || process.env.SMTP_USER || "";
  const pass = requireOtpSecret();
  if (!user) {
    throw new HttpsError("failed-precondition", "SMTP email service is not configured. Contract OTP cannot be delivered.");
  }
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.sendgrid.net",
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

async function sendOtpEmail(args: {
  to: string;
  otp: string;
  contractId: string;
  propertyName: string;
  requestId: string;
}) {
  const from = process.env.MAIL_FROM || process.env.SMTP_FROM || "BIN GROUP <ceo@bin-groups.com>";
  const replyTo = process.env.MAIL_REPLY_TO || process.env.SMTP_REPLY_TO || "BIN GROUP Admin <ceo@bin-groups.com>";
  const subject = "BIN GROUP contract signature OTP";
  const safePropertyName = args.propertyName || "your property contract";
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h2>BIN GROUP Contract Signature Verification</h2>
      <p>Your one-time passcode for <strong>${safePropertyName}</strong> is:</p>
      <p style="font-size:28px;font-weight:800;letter-spacing:4px">${args.otp}</p>
      <p>This code expires in ${OTP_TTL_MINUTES} minutes. Do not share it with anyone.</p>
      <p>Contract reference: ${args.contractId || args.requestId}</p>
    </div>
  `;
  const text = `BIN GROUP contract signature OTP: ${args.otp}. Expires in ${OTP_TTL_MINUTES} minutes. Contract reference: ${args.contractId || args.requestId}.`;
  const info = await (await createTransporter()).sendMail({ from, replyTo, to: args.to, subject, html, text });
  const messageId = asText(info.messageId);
  if (!messageId) throw new Error("SMTP provider did not return a message ID.");
  return messageId;
}

async function enforceOtpRequestRate(uid: string) {
  const ref = db.collection("contract_signature_otp_rate_limits").doc(uid);
  const nowMs = Date.now();
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const data = snap.data() || {};
    const windowStartedAt = data.windowStartedAt?.toMillis?.() || 0;
    const inCurrentWindow = windowStartedAt > 0 && nowMs - windowStartedAt < 60 * 60 * 1000;
    const count = inCurrentWindow ? Number(data.count || 0) : 0;
    if (count >= MAX_REQUESTS_PER_HOUR) {
      throw new HttpsError("resource-exhausted", "Too many OTP requests. Try again after one hour.");
    }
    transaction.set(ref, {
      uid,
      count: count + 1,
      windowStartedAt: inCurrentWindow
        ? data.windowStartedAt
        : admin.firestore.Timestamp.fromMillis(nowMs),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

export const requestContractSignatureOtp = onCall(
  {
    cors: true,
    region: "europe-west3",
    enforceAppCheck: true,
    secrets: [smtpUser, smtpPass],
  },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in before requesting a contract signature OTP.");
    if (
      request.auth.token?.email_verified !== true ||
      request.auth.token?.suspended === true ||
      roleOf(request.auth.token) !== "owner"
    ) {
      throw new HttpsError("permission-denied", "A verified, active Owner account is required for contract OTP.");
    }

    const uid = request.auth.uid;
    const authEmail = normalizeEmail(request.auth.token?.email);
    const requestedEmail = normalizeEmail(request.data?.email);
    if (!authEmail) throw new HttpsError("failed-precondition", "An Auth email is required to deliver the OTP.");
    if (requestedEmail && requestedEmail !== authEmail) {
      throw new HttpsError("permission-denied", "OTP email must match the authenticated account.");
    }
    await enforceOtpRequestRate(uid);

    const contractId = asText(
      request.data?.contractId || request.data?.propertyId || "contract-pending",
      "contract-pending",
    ).slice(0, 120);
    const contractHash = asText(request.data?.contractHash).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(contractHash)) {
      throw new HttpsError("failed-precondition", "A server-authoritative contract quote hash is required.");
    }
    const propertyName = asText(
      request.data?.propertyName || request.data?.address || "BIN GROUP contract",
      "BIN GROUP contract",
    ).slice(0, 180);
    const otp = makeOtp();
    const salt = crypto.randomBytes(18).toString("hex");
    const requestRef = db.collection("contract_signature_otps").doc();
    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    const secret = requireOtpSecret();

    let messageId = "";
    try {
      messageId = await sendOtpEmail({ to: authEmail, otp, contractId, propertyName, requestId: requestRef.id });
    } catch (error: any) {
      await db.collection("contract_signature_otp_audit").add({
        uid,
        contractId,
        propertyName,
        email: authEmail,
        status: "DELIVERY_FAILED",
        error: error?.message || "OTP delivery failed",
        createdAt: FieldValue.serverTimestamp(),
      });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "OTP delivery failed. Check SMTP provider configuration.");
    }

    const testEvidence = request.auth.token?.testAccount === true
      ? encryptTestEvidence(otp, secret, requestRef.id, uid)
      : null;
    await requestRef.set({
      uid,
      contractId,
      contractHash,
      propertyName,
      email: authEmail,
      channel: "email",
      otpHash: hashOtp(otp, salt, secret),
      otpHashAlgorithm: OTP_HASH_ALGORITHM,
      salt,
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      status: "PENDING",
      delivery: {
        provider: "smtp",
        messageId,
        sentAt: FieldValue.serverTimestamp(),
      },
      ...(testEvidence ? { testEvidence } : {}),
      expiresAt,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await db.collection("contract_signature_otp_audit").add({
      uid,
      contractId,
      propertyName,
      email: authEmail,
      channel: "email",
      otpRequestId: requestRef.id,
      status: "OTP_SENT",
      otpHashAlgorithm: OTP_HASH_ALGORITHM,
      testEvidenceAvailable: Boolean(testEvidence),
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      requestId: requestRef.id,
      channel: "email",
      expiresAt: expiresAt.toMillis(),
      message: "OTP sent to the verified owner email address.",
    };
  },
);

export const verifyContractSignatureOtp = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true, secrets: [smtpPass] },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in before verifying a contract signature OTP.");
    if (roleOf(request.auth.token) !== "owner") {
      throw new HttpsError("permission-denied", "Only an Owner account may verify a contract signature OTP.");
    }

    const uid = request.auth.uid;
    const requestId = asText(request.data?.requestId);
    const otp = asText(request.data?.otp);
    const signature = asText(request.data?.signature).slice(0, 180);
    if (!requestId || !/^\d{6}$/.test(otp)) {
      throw new HttpsError("invalid-argument", "OTP request ID and a 6-digit OTP are required.");
    }
    if (!signature) throw new HttpsError("invalid-argument", "Digital signature name is required.");
    const secret = requireOtpSecret();

    const ref = db.collection("contract_signature_otps").doc(requestId);
    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) return { outcome: "NOT_FOUND" as const, data: {} as FirebaseFirestore.DocumentData };
      const data = snap.data() || {};
      if (data.uid !== uid) return { outcome: "FORBIDDEN" as const, data };
      if (data.status === "VERIFIED") {
        return asText(data.signature) === signature
          ? { outcome: "ALREADY_VERIFIED" as const, data }
          : { outcome: "SIGNATURE_MISMATCH" as const, data };
      }

      const attempts = Number(data.attempts || 0);
      if (attempts >= MAX_ATTEMPTS) return { outcome: "MAX_ATTEMPTS" as const, data };
      const expiresAt = data.expiresAt?.toMillis ? data.expiresAt.toMillis() : 0;
      if (!expiresAt || Date.now() > expiresAt) {
        transaction.set(ref, { status: "EXPIRED", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return { outcome: "EXPIRED" as const, data };
      }
      if (asText(data.otpHashAlgorithm) !== OTP_HASH_ALGORITHM) {
        transaction.set(ref, { status: "REISSUE_REQUIRED", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        return { outcome: "REISSUE_REQUIRED" as const, data };
      }

      const expectedHash = asText(data.otpHash);
      const submittedHash = hashOtp(otp, asText(data.salt), secret);
      const expectedBuffer = Buffer.from(expectedHash, "hex");
      const submittedBuffer = Buffer.from(submittedHash, "hex");
      const matches = expectedBuffer.length === submittedBuffer.length &&
        expectedBuffer.length > 0 &&
        crypto.timingSafeEqual(expectedBuffer, submittedBuffer);
      if (!matches) {
        transaction.set(ref, {
          attempts: attempts + 1,
          lastFailedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return { outcome: "INVALID" as const, data };
      }

      transaction.set(ref, {
        status: "VERIFIED",
        signature,
        verifiedAt: FieldValue.serverTimestamp(),
        evidenceExpiresAt: admin.firestore.Timestamp.fromMillis(
          Date.now() + VERIFIED_EVIDENCE_TTL_HOURS * 60 * 60 * 1000,
        ),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { outcome: "VERIFIED" as const, data };
    });

    if (result.outcome === "NOT_FOUND") throw new HttpsError("not-found", "OTP request not found.");
    if (result.outcome === "FORBIDDEN") throw new HttpsError("permission-denied", "OTP request does not belong to this user.");
    if (result.outcome === "MAX_ATTEMPTS") throw new HttpsError("resource-exhausted", "Maximum OTP attempts exceeded. Request a new code.");
    if (result.outcome === "EXPIRED") throw new HttpsError("deadline-exceeded", "OTP expired. Request a new code.");
    if (result.outcome === "REISSUE_REQUIRED") throw new HttpsError("failed-precondition", "Request a new OTP before signing this contract.");
    if (result.outcome === "INVALID") throw new HttpsError("permission-denied", "Invalid OTP.");
    if (result.outcome === "SIGNATURE_MISMATCH") {
      throw new HttpsError("failed-precondition", "The verified OTP is bound to a different signature name.");
    }
    if (result.outcome === "ALREADY_VERIFIED") {
      return {
        ok: true,
        alreadyVerified: true,
        verificationId: requestId,
        channel: result.data.channel || "email",
        contractId: result.data.contractId || "",
      };
    }

    await db.collection("contract_signature_otp_audit").add({
      uid,
      contractId: result.data.contractId || "",
      propertyName: result.data.propertyName || "",
      otpRequestId: requestId,
      status: "OTP_VERIFIED",
      channel: result.data.channel || "email",
      otpHashAlgorithm: OTP_HASH_ALGORITHM,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      verificationId: requestId,
      channel: result.data.channel || "email",
      contractId: result.data.contractId || "",
      verifiedAt: Date.now(),
    };
  },
);

export const retrieveContractSignatureOtpForTestEvidence = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true, secrets: [smtpPass] },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in before retrieving protected OTP test evidence.");
    }
    if (
      request.auth.token?.email_verified !== true ||
      request.auth.token?.suspended === true ||
      request.auth.token?.testAccount !== true ||
      roleOf(request.auth.token) !== "owner"
    ) {
      throw new HttpsError("permission-denied", "Protected OTP test evidence is restricted to verified E2E Owner accounts.");
    }

    const uid = request.auth.uid;
    const requestId = asText(request.data?.requestId);
    if (!requestId) throw new HttpsError("invalid-argument", "OTP request ID is required.");
    const secret = requireOtpSecret();
    const ref = db.collection("contract_signature_otps").doc(requestId);

    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", "OTP request not found.");
      const data = snap.data() || {};
      if (data.uid !== uid || normalizeEmail(data.email) !== normalizeEmail(request.auth?.token?.email)) {
        throw new HttpsError("permission-denied", "OTP request does not belong to this test account.");
      }
      if (data.status !== "PENDING") throw new HttpsError("failed-precondition", "OTP request is not pending verification.");
      const expiresAt = data.expiresAt?.toMillis ? data.expiresAt.toMillis() : 0;
      if (!expiresAt || Date.now() > expiresAt) throw new HttpsError("deadline-exceeded", "OTP expired. Request a new code.");
      const evidence = data.testEvidence || {};
      if (evidence.retrieved === true || !asText(evidence.ciphertext)) {
        throw new HttpsError("failed-precondition", "Protected OTP test evidence has already been retrieved.");
      }
      const otp = decryptTestEvidence(evidence, secret, requestId, uid);
      if (!/^\d{6}$/.test(otp)) throw new HttpsError("failed-precondition", "Protected OTP test evidence is invalid.");
      const providerMessageId = asText(data.delivery?.messageId);
      if (!providerMessageId) throw new HttpsError("failed-precondition", "SMTP provider acceptance evidence is missing.");

      transaction.update(ref, {
        "testEvidence.retrieved": true,
        "testEvidence.retrievedAt": FieldValue.serverTimestamp(),
        "testEvidence.retrievedBy": uid,
        "testEvidence.ciphertext": FieldValue.delete(),
        "testEvidence.iv": FieldValue.delete(),
        "testEvidence.authTag": FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { otp, providerMessageId, contractId: asText(data.contractId) };
    });

    await db.collection("contract_signature_otp_audit").add({
      uid,
      otpRequestId: requestId,
      contractId: result.contractId,
      status: "OTP_TEST_EVIDENCE_RETRIEVED",
      channel: "protected_test_callable",
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      requestId,
      otp: result.otp,
      providerMessageId: result.providerMessageId,
      channel: "protected_test_callable",
    };
  },
);

export {
  assertVerifiedContractSignatureOtp,
  consumeVerifiedContractSignatureOtp,
  validateVerifiedContractSignatureOtp,
} from "./contractSignatureOtp";

import type * as FirebaseFirestore from "firebase-admin/firestore";