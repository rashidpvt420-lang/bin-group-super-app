import { FieldValue } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const smtpUser = defineSecret("SMTP_USER");
const smtpPass = defineSecret("SMTP_PASS");
const ownerContractOtpPepper = defineSecret("OWNER_CONTRACT_OTP_PEPPER");

const OTP_TTL_MINUTES = 10;
const VERIFIED_EVIDENCE_TTL_HOURS = 2;
const MAX_ATTEMPTS = 5;
const MAX_REQUESTS_PER_HOUR = 5;
const OTP_HASH_ALGORITHM = "HMAC_SHA256_OWNER_CONTRACT_V1";
const BRANDED_FROM = "BIN GROUP <ceo@bin-groups.com>";
const BRANDED_REPLY_TO = "BIN GROUP Admin <ceo@bin-groups.com>";

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

function requireOtpPepper() {
  const secret = ownerContractOtpPepper.value() || process.env.OWNER_CONTRACT_OTP_PEPPER || "";
  if (secret.length < 32) {
    throw new HttpsError(
      "failed-precondition",
      "Owner contract OTP verification is not securely configured.",
    );
  }
  return secret;
}

function otpDigest(args: {
  requestId: string;
  uid: string;
  contractHash: string;
  otp: string;
  salt: string;
  pepper: string;
}) {
  const payload = [
    OTP_HASH_ALGORITHM,
    args.requestId,
    args.uid,
    args.contractHash,
    args.otp,
    args.salt,
  ].join("\n");
  return crypto.createHmac("sha256", args.pepper).update(payload).digest("hex");
}

function timingSafeHexEqual(expected: string, submitted: string) {
  if (!/^[a-f0-9]{64}$/i.test(expected) || !/^[a-f0-9]{64}$/i.test(submitted)) return false;
  const expectedBuffer = Buffer.from(expected, "hex");
  const submittedBuffer = Buffer.from(submitted, "hex");
  return expectedBuffer.length === submittedBuffer.length &&
    expectedBuffer.length > 0 &&
    crypto.timingSafeEqual(expectedBuffer, submittedBuffer);
}

async function createTransporter() {
  const nodemailer = await import("nodemailer");
  const user = smtpUser.value() || process.env.SMTP_USER || "";
  const pass = smtpPass.value() || process.env.SMTP_PASS || "";
  if (!user || !pass) {
    throw new HttpsError(
      "failed-precondition",
      "SMTP email service is not configured. Contract OTP cannot be delivered.",
    );
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
  const from = process.env.MAIL_FROM || process.env.SMTP_FROM || BRANDED_FROM;
  const replyTo = process.env.MAIL_REPLY_TO || process.env.SMTP_REPLY_TO || BRANDED_REPLY_TO;
  if (from !== BRANDED_FROM || replyTo !== BRANDED_REPLY_TO) {
    throw new HttpsError(
      "failed-precondition",
      "Owner contract OTP email must use the approved BIN GROUP sender identity.",
    );
  }

  const subject = "BIN GROUP contract signature OTP";
  const safePropertyName = args.propertyName || "your property contract";
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
      <h2>BIN GROUP Contract Signature Verification</h2>
      <p>Your one-time passcode for <strong>${safePropertyName}</strong> is:</p>
      <p style="font-size:28px;font-weight:800;letter-spacing:4px">${args.otp}</p>
      <p>This code expires in ${OTP_TTL_MINUTES} minutes. Do not share it with anyone.</p>
      <p>Contract reference: ${args.contractId || args.requestId}</p>
    <p>Verification reference: <code>${args.requestId}</code></p>
    </div>
  `;
  const text = `BIN GROUP contract signature OTP: ${args.otp}. Expires in ${OTP_TTL_MINUTES} minutes. Contract reference: ${args.contractId || args.requestId}. Verification reference: ${args.requestId}.`;
  const info = await (await createTransporter()).sendMail({
    from,
    replyTo,
    to: args.to,
    subject,
    html,
    text,
  });

  const messageId = asText(info.messageId);
  const accepted = Array.isArray(info.accepted)
    ? info.accepted.map((entry) => normalizeEmail(entry)).filter(Boolean)
    : [];
  const rejected = Array.isArray(info.rejected)
    ? info.rejected.map((entry) => normalizeEmail(entry)).filter(Boolean)
    : [];
  if (!messageId || !accepted.includes(normalizeEmail(args.to)) || rejected.length > 0) {
    throw new HttpsError(
      "internal",
      "SMTP provider did not accept the verified Owner mailbox.",
    );
  }

  return {
    provider: "smtp",
    messageId,
    from,
    replyTo,
    recipient: normalizeEmail(args.to),
    accepted,
    rejected,
    providerAccepted: true,
  };
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
    secrets: [smtpUser, smtpPass, ownerContractOtpPepper],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in before requesting a contract signature OTP.");
    }
    if (
      request.auth.token?.email_verified !== true ||
      request.auth.token?.suspended === true ||
      roleOf(request.auth.token) !== "owner"
    ) {
      throw new HttpsError(
        "permission-denied",
        "A verified, active Owner account is required for contract OTP.",
      );
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

    const contractId = asText(
      request.data?.contractId || request.data?.propertyId || "contract-pending",
      "contract-pending",
    ).slice(0, 120);
    const contractHash = asText(request.data?.contractHash).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(contractHash)) {
      throw new HttpsError(
        "failed-precondition",
        "A server-authoritative contract quote hash is required.",
      );
    }
    const propertyName = asText(
      request.data?.propertyName || request.data?.address || "BIN GROUP contract",
      "BIN GROUP contract",
    ).slice(0, 180);

    await enforceOtpRequestRate(uid);
    const pepper = requireOtpPepper();
    const requestRef = db.collection("contract_signature_otps").doc();
    const otp = makeOtp();
    const salt = crypto.randomBytes(18).toString("hex");
    const expiresAt = admin.firestore.Timestamp.fromMillis(
      Date.now() + OTP_TTL_MINUTES * 60 * 1000,
    );

    let delivery;
    try {
      delivery = await sendOtpEmail({
        to: authEmail,
        otp,
        contractId,
        propertyName,
        requestId: requestRef.id,
      });
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

    const otpHash = otpDigest({
      requestId: requestRef.id,
      uid,
      contractHash,
      otp,
      salt,
      pepper,
    });
    await requestRef.set({
      uid,
      contractId,
      contractHash,
      propertyName,
      email: authEmail,
      channel: "email",
      otpHash,
      otpHashAlgorithm: OTP_HASH_ALGORITHM,
      salt,
      attempts: 0,
      maxAttempts: MAX_ATTEMPTS,
      status: "PENDING",
      delivery: { ...delivery, sentAt: FieldValue.serverTimestamp() },
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
      providerMessageId: delivery.messageId,
      brandedSenderVerified: delivery.from === BRANDED_FROM,
      providerAccepted: delivery.providerAccepted,
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      requestId: requestRef.id,
      channel: "email",
      expiresAt: expiresAt.toMillis(),
      deliveryConfirmed: delivery.providerAccepted,
      brandedSenderVerified: delivery.from === BRANDED_FROM,
      message: "OTP sent to the verified owner email address.",
    };
  },
);

export const verifyContractSignatureOtp = onCall(
  {
    cors: true,
    region: "europe-west3",
    enforceAppCheck: true,
    secrets: [ownerContractOtpPepper],
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in before verifying a contract signature OTP.");
    }
    if (
      request.auth.token?.email_verified !== true ||
      request.auth.token?.suspended === true ||
      roleOf(request.auth.token) !== "owner"
    ) {
      throw new HttpsError("permission-denied", "Only a verified, active Owner may verify this OTP.");
    }

    const uid = request.auth.uid;
    const requestId = asText(request.data?.requestId);
    const otp = asText(request.data?.otp);
    const signature = asText(request.data?.signature).slice(0, 180);
    if (!requestId || !/^\d{6}$/.test(otp)) {
      throw new HttpsError("invalid-argument", "OTP request ID and a 6-digit OTP are required.");
    }
    if (!signature) {
      throw new HttpsError("invalid-argument", "Digital signature name is required.");
    }
    const pepper = requireOtpPepper();

    const ref = db.collection("contract_signature_otps").doc(requestId);
    const result = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) {
        return { outcome: "NOT_FOUND" as const, data: {} as FirebaseFirestore.DocumentData };
      }
      const data = snap.data() || {};
      if (
        data.uid !== uid ||
        normalizeEmail(data.email) !== normalizeEmail(request.auth?.token?.email)
      ) {
        return { outcome: "FORBIDDEN" as const, data };
      }
      if (data.status === "VERIFIED") {
        return asText(data.signature) === signature
          ? { outcome: "ALREADY_VERIFIED" as const, data }
          : { outcome: "SIGNATURE_MISMATCH" as const, data };
      }

      const attempts = Number(data.attempts || 0);
      if (attempts >= MAX_ATTEMPTS) return { outcome: "MAX_ATTEMPTS" as const, data };
      const expiresAt = data.expiresAt?.toMillis ? data.expiresAt.toMillis() : 0;
      if (!expiresAt || Date.now() > expiresAt) {
        transaction.set(ref, {
          status: "EXPIRED",
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return { outcome: "EXPIRED" as const, data };
      }
      if (asText(data.otpHashAlgorithm) !== OTP_HASH_ALGORITHM) {
        transaction.set(ref, {
          status: "REISSUE_REQUIRED",
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return { outcome: "REISSUE_REQUIRED" as const, data };
      }

      const submittedHash = otpDigest({
        requestId,
        uid,
        contractHash: asText(data.contractHash).toLowerCase(),
        otp,
        salt: asText(data.salt),
        pepper,
      });
      if (!timingSafeHexEqual(asText(data.otpHash), submittedHash)) {
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

    if (result.outcome === "NOT_FOUND") {
      throw new HttpsError("not-found", "OTP request not found.");
    }
    if (result.outcome === "FORBIDDEN") {
      throw new HttpsError("permission-denied", "OTP request does not belong to this user.");
    }
    if (result.outcome === "MAX_ATTEMPTS") {
      throw new HttpsError("resource-exhausted", "Maximum OTP attempts exceeded. Request a new code.");
    }
    if (result.outcome === "EXPIRED") {
      throw new HttpsError("deadline-exceeded", "OTP expired. Request a new code.");
    }
    if (result.outcome === "REISSUE_REQUIRED") {
      throw new HttpsError("failed-precondition", "Request a new OTP before signing this contract.");
    }
    if (result.outcome === "INVALID") {
      throw new HttpsError("permission-denied", "Invalid OTP.");
    }
    if (result.outcome === "SIGNATURE_MISMATCH") {
      throw new HttpsError(
        "failed-precondition",
        "The verified OTP is bound to a different signature name.",
      );
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

export {
  assertVerifiedContractSignatureOtp,
  consumeVerifiedContractSignatureOtp,
  validateVerifiedContractSignatureOtp,
} from "./contractSignatureOtp";

import type * as FirebaseFirestore from "firebase-admin/firestore";