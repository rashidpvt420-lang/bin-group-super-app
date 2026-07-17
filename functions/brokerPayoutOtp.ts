import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const smtpUser = defineSecret("SMTP_USER");
const smtpPass = defineSecret("SMTP_PASS");
const OTP_TTL_MS = 10 * 60 * 1000;
const EVIDENCE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_REQUESTS_PER_HOUR = 5;

const asText = (value: unknown): string => String(value ?? "").trim();
const asLower = (value: unknown): string => asText(value).toLowerCase();
const sha256 = (value: string): string => crypto.createHash("sha256").update(value).digest("hex");
const hashOtp = (otp: string, salt: string): string => sha256(`${otp}:${salt}`);
const makeOtp = (): string => String(crypto.randomInt(100000, 1000000));

function normalizeCommissionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.map((entry: unknown) => asText(entry)).filter((entry: string) => entry.length > 0);
  return Array.from(new Set<string>(ids)).sort().slice(0, 50);
}

async function requireVerifiedBroker(auth: any): Promise<{ uid: string; email: string }> {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Broker login required.");
  const [record, profileSnap] = await Promise.all([
    admin.auth().getUser(auth.uid),
    db.collection("users").doc(auth.uid).get(),
  ]);
  const profile = profileSnap.data() || {};
  const role = asLower(record.customClaims?.role || record.customClaims?.userRole || profile.role || profile.userRole);
  const email = asLower(record.email || auth.token?.email || profile.email);
  if (record.disabled || auth.token?.suspended === true || ["suspended", "disabled", "rejected"].includes(asLower(profile.status))) {
    throw new HttpsError("permission-denied", "Broker account is not active.");
  }
  if (role !== "broker") throw new HttpsError("permission-denied", "Broker role required.");
  if (record.emailVerified !== true || !email) throw new HttpsError("failed-precondition", "A verified Broker email is required.");
  if (profile.reraVerified !== true || asLower(profile.brokerKycStatus) !== "verified") {
    throw new HttpsError("failed-precondition", "Broker KYC must be admin verified before payout verification.");
  }
  return { uid: auth.uid, email };
}

async function loadPayoutBinding(uid: string, requestedIds: unknown): Promise<{ commissionIds: string[]; amount: number; bindingHash: string }> {
  const commissionIds = normalizeCommissionIds(requestedIds);
  if (!commissionIds.length) throw new HttpsError("invalid-argument", "At least one commission ID is required.");
  const refs = commissionIds.map((id: string) => db.collection("broker_commissions").doc(id));
  const docs = await Promise.all(refs.map((ref) => ref.get()));
  let amount = 0;
  for (const document of docs) {
    const data = document.data() || {};
    const payoutStatus = asText(data.payoutStatus).toUpperCase();
    if (!document.exists || data.brokerId !== uid || asText(data.status).toUpperCase() !== "APPROVED" || ["REQUESTED", "APPROVED", "PAID"].includes(payoutStatus)) {
      throw new HttpsError("permission-denied", "One or more commissions are not eligible for this Broker payout verification.");
    }
    const value = Number(data.amount || 0);
    if (!Number.isFinite(value)) throw new HttpsError("failed-precondition", "Commission amount is invalid.");
    amount += value;
  }
  if (amount <= 0) throw new HttpsError("failed-precondition", "Payout amount must be greater than zero.");
  const bindingHash = sha256(`${uid}|${commissionIds.join(",")}|AED|${amount.toFixed(2)}`);
  return { commissionIds, amount, bindingHash };
}

async function enforceRateLimit(uid: string): Promise<void> {
  const ref = db.collection("broker_payout_otp_rate_limits").doc(uid);
  const nowMs = Date.now();
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const data = snap.data() || {};
    const windowStartedAt = data.windowStartedAt?.toMillis?.() || 0;
    const currentWindow = windowStartedAt > 0 && nowMs - windowStartedAt < 60 * 60 * 1000;
    const count = currentWindow ? Number(data.count || 0) : 0;
    if (count >= MAX_REQUESTS_PER_HOUR) throw new HttpsError("resource-exhausted", "Too many payout OTP requests. Try again after one hour.");
    transaction.set(ref, {
      uid,
      count: count + 1,
      windowStartedAt: currentWindow ? data.windowStartedAt : admin.firestore.Timestamp.fromMillis(nowMs),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function deliverOtp(email: string, otp: string, amount: number, commissionCount: number): Promise<string> {
  const user = smtpUser.value() || process.env.SMTP_USER || "";
  const pass = smtpPass.value() || process.env.SMTP_PASS || "";
  if (!user || !pass) throw new HttpsError("failed-precondition", "SMTP email service is not configured. Broker payout OTP cannot be requested.");
  const nodemailer = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.sendgrid.net",
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  const info = await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_FROM || "BIN GROUP <ceo@bin-groups.com>",
    to: email,
    subject: "BIN GROUP Broker payout verification code",
    text: `Your BIN GROUP Broker payout OTP is ${otp}. It authorizes AED ${amount.toFixed(2)} across ${commissionCount} commission(s) and expires in 10 minutes.`,
  });
  const messageId = asText(info.messageId);
  if (!messageId) throw new HttpsError("internal", "OTP delivery provider did not return a message ID.");
  return messageId;
}

export const requestBrokerPayoutOtp = onCall({
  cors: true,
  region: "europe-west3",
  enforceAppCheck: true,
  secrets: [smtpUser, smtpPass],
}, async (request) => {
  const broker = await requireVerifiedBroker(request.auth);
  const binding = await loadPayoutBinding(broker.uid, request.data?.commissionIds);
  await enforceRateLimit(broker.uid);
  const otp = makeOtp();
  const salt = crypto.randomBytes(18).toString("hex");
  const challengeRef = db.collection("broker_payout_otps").doc();
  const messageId = await deliverOtp(broker.email, otp, binding.amount, binding.commissionIds.length);
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + OTP_TTL_MS);
  await challengeRef.set({
    uid: broker.uid,
    email: broker.email,
    commissionIds: binding.commissionIds,
    amount: binding.amount,
    currency: "AED",
    bindingHash: binding.bindingHash,
    otpHash: hashOtp(otp, salt),
    salt,
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    status: "PENDING",
    expiresAt,
    delivery: { provider: "smtp", messageId, sentAt: FieldValue.serverTimestamp() },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db.collection("audit_logs").add({
    action: "BROKER_PAYOUT_OTP_SENT",
    actorId: broker.uid,
    challengeId: challengeRef.id,
    bindingHash: binding.bindingHash,
    amount: binding.amount,
    commissionIds: binding.commissionIds,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { status: "OTP_SENT", challengeId: challengeRef.id, expiresAt: expiresAt.toMillis(), amount: binding.amount, commissionCount: binding.commissionIds.length };
});

export const verifyBrokerPayoutOtp = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const broker = await requireVerifiedBroker(request.auth);
  const challengeId = asText(request.data?.challengeId);
  const otp = asText(request.data?.otp);
  if (!challengeId || !/^\d{6}$/.test(otp)) throw new HttpsError("invalid-argument", "Challenge ID and a 6-digit OTP are required.");
  const challengeRef = db.collection("broker_payout_otps").doc(challengeId);
  const result = await db.runTransaction(async (transaction): Promise<string> => {
    const snap = await transaction.get(challengeRef);
    if (!snap.exists) return "NOT_FOUND";
    const data = snap.data() || {};
    if (data.uid !== broker.uid) return "FORBIDDEN";
    if (data.status === "CONSUMED") return "CONSUMED";
    if (data.status === "VERIFIED" && (data.evidenceExpiresAt?.toMillis?.() || 0) > Date.now()) return "VERIFIED";
    const attempts = Number(data.attempts || 0);
    if (attempts >= MAX_ATTEMPTS) return "MAX_ATTEMPTS";
    if ((data.expiresAt?.toMillis?.() || 0) < Date.now()) {
      transaction.set(challengeRef, { status: "EXPIRED", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return "EXPIRED";
    }
    const expected = Buffer.from(asText(data.otpHash), "hex");
    const submitted = Buffer.from(hashOtp(otp, asText(data.salt)), "hex");
    const valid = expected.length > 0 && expected.length === submitted.length && crypto.timingSafeEqual(expected, submitted);
    if (!valid) {
      transaction.set(challengeRef, { attempts: attempts + 1, lastFailedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return "INVALID";
    }
    transaction.set(challengeRef, {
      status: "VERIFIED",
      verifiedAt: FieldValue.serverTimestamp(),
      evidenceExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + EVIDENCE_TTL_MS),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return "VERIFIED";
  });
  if (result === "NOT_FOUND") throw new HttpsError("not-found", "Payout OTP challenge not found.");
  if (result === "FORBIDDEN") throw new HttpsError("permission-denied", "Payout OTP challenge does not belong to this Broker.");
  if (result === "CONSUMED") throw new HttpsError("failed-precondition", "Payout OTP evidence has already been consumed.");
  if (result === "MAX_ATTEMPTS") throw new HttpsError("resource-exhausted", "Maximum OTP attempts exceeded. Request a new code.");
  if (result === "EXPIRED") throw new HttpsError("deadline-exceeded", "Payout OTP expired. Request a new code.");
  if (result === "INVALID") throw new HttpsError("permission-denied", "Invalid payout OTP.");
  await db.collection("audit_logs").add({ action: "BROKER_PAYOUT_OTP_VERIFIED", actorId: broker.uid, challengeId, createdAt: FieldValue.serverTimestamp() });
  return { status: "VERIFIED", challengeId };
});
