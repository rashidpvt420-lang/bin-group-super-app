import { FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
const defineSecret = (name: string) => ({ value: () => process.env[name] || "" });
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import * as nodemailer from "nodemailer";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const smtpUser = defineSecret("SMTP_USER");
const smtpPass = defineSecret("SMTP_PASS");

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

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

function createTransporter() {
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
  const info = await createTransporter().sendMail({ from, replyTo, to: args.to, subject, html, text });
  return info.messageId || "";
}

export const requestContractSignatureOtp = onCall(
  { cors: true, region: "europe-west3" },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in before requesting a contract signature OTP.");

    const user = smtpUser.value() || process.env.SMTP_USER || "";
    const pass = smtpPass.value() || process.env.SMTP_PASS || "";
    if (!user || !pass) {
      throw new HttpsError("failed-precondition", "SMTP email service is not configured. Contract signature OTP cannot be requested.");
    }

    const uid = request.auth.uid;
    const email = normalizeEmail(request.data?.email || request.auth.token?.email);
    if (!email) throw new HttpsError("invalid-argument", "A verified email address is required to deliver the OTP.");

    const contractId = asText(request.data?.contractId || request.data?.propertyId || "contract-pending", "contract-pending").slice(0, 120);
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
  { cors: true, region: "europe-west3" },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in before verifying a contract signature OTP.");

    const uid = request.auth.uid;
    const requestId = asText(request.data?.requestId);
    const otp = asText(request.data?.otp);
    const signature = asText(request.data?.signature).slice(0, 180);
    if (!requestId || !otp || otp.length < 6) throw new HttpsError("invalid-argument", "OTP request ID and 6-digit OTP are required.");
    if (!signature) throw new HttpsError("invalid-argument", "Digital signature name is required.");

    const ref = db.collection("contract_signature_otps").doc(requestId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "OTP request not found.");
    const data = snap.data() || {};
    if (data.uid !== uid) throw new HttpsError("permission-denied", "OTP request does not belong to this user.");
    if (data.status === "VERIFIED") return { ok: true, alreadyVerified: true, verificationId: requestId, channel: data.channel || "email" };

    const attempts = Number(data.attempts || 0);
    if (attempts >= MAX_ATTEMPTS) throw new HttpsError("resource-exhausted", "Maximum OTP attempts exceeded. Request a new code.");
    const expiresAt = data.expiresAt?.toMillis ? data.expiresAt.toMillis() : 0;
    if (!expiresAt || Date.now() > expiresAt) {
      await ref.set({ status: "EXPIRED", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      throw new HttpsError("deadline-exceeded", "OTP expired. Request a new code.");
    }

    const expectedHash = asText(data.otpHash);
    const salt = asText(data.salt);
    const submittedHash = hashOtp(otp, salt);
    if (submittedHash !== expectedHash) {
      await ref.set({
        attempts: FieldValue.increment(1),
        lastFailedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      throw new HttpsError("permission-denied", "Invalid OTP.");
    }

    await ref.set({
      status: "VERIFIED",
      signature,
      verifiedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await db.collection("contract_signature_otp_audit").add({
      uid,
      contractId: data.contractId || "",
      propertyName: data.propertyName || "",
      otpRequestId: requestId,
      status: "OTP_VERIFIED",
      channel: data.channel || "email",
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      ok: true,
      verificationId: requestId,
      channel: data.channel || "email",
      contractId: data.contractId || "",
      verifiedAt: Date.now(),
    };
  }
);
