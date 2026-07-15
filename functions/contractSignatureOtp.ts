import { FieldValue } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onCall, HttpsError } from "firebase-functions/v2/https";
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

function asText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeEmail(value: unknown) {
  return asText(value).toLowerCase();
}

function makeOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtp(otp: string, salt: string) {
  return crypto.createHash("sha256").update(`${otp}:${salt}`).digest("hex");
}

async function createTransporter() {
  const nodemailer = await import("nodemailer");
  const user = smtpUser.value() || process.env.SMTP_USER || "";
  const pass = smtpPass.value() || process.env.SMTP_PASS || "";
  if (!user || !pass) throw new HttpsError("failed-precondition", "SMTP secrets are not configured. Contract OTP cannot be delivered.");
  const port = Number(process.env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.sendgrid.net",
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

async function sendOtpEmail(args: { to: string; otp: string; contractId: string; propertyName: string; requestId: string }) {
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
    if (request.auth.token?.email_verified !== true || request.auth.token?.suspended === true) {
      throw new HttpsError("permission-denied", "A verified, active owner email is required for contract OTP.");
    }

    const user = smtpUser.value() || process.env.SMTP_USER || "";
    const pass = smtpPass.value() || process.env.SMTP_PASS || "";
    if (!user || !pass) {
      throw new HttpsError("failed-precondition", "SMTP email service is not configured. Contract signature OTP cannot be requested.");
    }

    const uid = request.auth.uid;
    const authEmail = normalizeEmail(request.auth.token?.email);
    const requestedEmail = normalizeEmail(request.data?.email);
    if (!authEmail) {
      throw new HttpsError("failed-precondition", "An Auth email is required to deliver the OTP.");
    }
    if (requestedEmail && requestedEmail !== authEmail) {
      throw new HttpsError("permission-denied", "OTP email must match the authenticated account.");
    }
    const email = authEmail;
    await enforceOtpRequestRate(uid);

    const contractId = asText(request.data?.contractId || request.data?.propertyId || "contract-pending", "contract-pending").slice(0, 120);
    const contractHash = asText(request.data?.contractHash).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(contractHash)) {
      throw new HttpsError("failed-precondition", "A server-authoritative contract quote hash is required.");
    }
    const propertyName = asText(request.data?.propertyName || request.data?.address || "BIN GROUP contract", "BIN GROUP contract").slice(0, 180);
    const otp = makeOtp();
    const salt = crypto.randomBytes(18).toString("hex");
    const requestRef = db.collection("contract_signature_otps").doc();
    const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    let messageId = "";
    try {
      messageId = await sendOtpEmail({ to: email, otp, contractId, propertyName, requestId: requestRef.id });
    } catch (error: any) {
      await db.collection("contract_signature_otp_audit").add({
        uid,
        contractId,
        propertyName,
        email,
        status: "DELIVERY_FAILED",
        error: error?.message || "OTP delivery failed",
        createdAt: FieldValue.serverTimestamp(),
      });
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "OTP delivery failed. Check SMTP provider configuration.");
    }

    await requestRef.set({
      uid,
      contractId,
      contractHash,
      propertyName,
      email,
      channel: "email",
      otpHash: hashOtp(otp, salt),
      salt,
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      status: "PENDING",
      delivery: {
        provider: "smtp",
        messageId,
        sentAt: FieldValue.serverTimestamp(),
      },
      expiresAt,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await db.collection("contract_signature_otp_audit").add({
      uid,
      contractId,
      propertyName,
      email,
      channel: "email",
      otpRequestId: requestRef.id,
      status: "OTP_SENT",
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      requestId: requestRef.id,
      channel: "email",
      expiresAt: expiresAt.toMillis(),
      message: "OTP sent to the verified owner email address.",
    };
  }
);

export const verifyContractSignatureOtp = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in before verifying a contract signature OTP.");

    const uid = request.auth.uid;
    const requestId = asText(request.data?.requestId);
    const otp = asText(request.data?.otp);
    const signature = asText(request.data?.signature).slice(0, 180);
    if (!requestId || !otp || otp.length < 6) throw new HttpsError("invalid-argument", "OTP request ID and 6-digit OTP are required.");
    if (!signature) throw new HttpsError("invalid-argument", "Digital signature name is required.");

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

      const expectedHash = asText(data.otpHash);
      const submittedHash = hashOtp(otp, asText(data.salt));
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
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      verificationId: requestId,
      channel: result.data.channel || "email",
      contractId: result.data.contractId || "",
      verifiedAt: Date.now(),
    };
  }
);

type VerifiedOtpArgs = {
  verificationId: string;
  uid: string;
  contractId: string;
  signature: string;
  contractHash: string;
};

function assertVerifiedEvidence(data: FirebaseFirestore.DocumentData, args: VerifiedOtpArgs) {
  const contractId = asText(args.contractId);
  const signature = asText(args.signature);
  const contractHash = asText(args.contractHash).toLowerCase();
  const evidenceExpiresAt = data.evidenceExpiresAt?.toMillis ? data.evidenceExpiresAt.toMillis() : 0;
  if (
    data.status !== "VERIFIED" ||
    data.uid !== args.uid ||
    asText(data.contractId) !== contractId ||
    asText(data.contractHash).toLowerCase() !== contractHash ||
    asText(data.signature) !== signature ||
    !evidenceExpiresAt ||
    Date.now() > evidenceExpiresAt
  ) {
    throw new HttpsError("failed-precondition", "Contract OTP evidence is invalid, expired, or belongs to another contract.");
  }
  const consumedFor = asText(data.consumedFor);
  if (consumedFor) {
    throw new HttpsError("failed-precondition", "Contract OTP evidence has already been consumed.");
  }
}

export async function validateVerifiedContractSignatureOtp(args: VerifiedOtpArgs) {
  const verificationId = asText(args.verificationId);
  const contractId = asText(args.contractId);
  const signature = asText(args.signature);
  const contractHash = asText(args.contractHash).toLowerCase();
  if (!verificationId || !contractId || !signature || !/^[a-f0-9]{64}$/.test(contractHash)) {
    throw new HttpsError("failed-precondition", "Verified contract OTP evidence is required.");
  }
  const snap = await db.collection("contract_signature_otps").doc(verificationId).get();
  if (!snap.exists) throw new HttpsError("failed-precondition", "Contract OTP verification was not found.");
  assertVerifiedEvidence(snap.data() || {}, args);
  return { verificationId, contractId };
}

export async function consumeVerifiedContractSignatureOtp(
  transaction: FirebaseFirestore.Transaction,
  args: VerifiedOtpArgs,
) {
  const verificationId = asText(args.verificationId);
  const contractId = asText(args.contractId);
  const signature = asText(args.signature);
  const contractHash = asText(args.contractHash).toLowerCase();
  if (!verificationId || !contractId || !signature || !/^[a-f0-9]{64}$/.test(contractHash)) {
    throw new HttpsError("failed-precondition", "Verified contract OTP evidence is required.");
  }

  const ref = db.collection("contract_signature_otps").doc(verificationId);
  const snap = await transaction.get(ref);
  if (!snap.exists) throw new HttpsError("failed-precondition", "Contract OTP verification was not found.");
  const data = snap.data() || {};
  assertVerifiedEvidence(data, args);
  transaction.set(ref, {
    consumedFor: contractId,
    consumedAt: data.consumedAt || FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { verificationId, contractId };
}

export async function assertVerifiedContractSignatureOtp(args: VerifiedOtpArgs) {
  return db.runTransaction(async (transaction) =>
    consumeVerifiedContractSignatureOtp(transaction, args)
  );
}
