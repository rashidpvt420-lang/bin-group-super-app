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

const text = (value: unknown) => String(value ?? "").trim();
const lower = (value: unknown) => text(value).toLowerCase();
const numberValue = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const otpHash = (otp: string, salt: string) => hash(`${otp}:${salt}`);
const makeOtp = () => String(crypto.randomInt(100000, 1000000));

function normalizedCommissionIds(value: unknown) {
  const ids = Array.isArray(value) ? value.map(text).filter(Boolean) : [];
  return Array.from(new Set(ids)).sort().slice(0, 50);
}

function payoutBinding(uid: string, commissionIds: string[], amount: number) {
  return hash(`${uid}|${commissionIds.join(",")}|AED|${amount.toFixed(2)}`);
}

async function requireBroker(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Broker login required.");
  if (auth.token?.suspended === true || auth.token?.email_verified !== true) {
    throw new HttpsError("permission-denied", "A verified, active Broker email is required.");
  }
  const [record, profileSnap] = await Promise.all([
    admin.auth().getUser(auth.uid),
    db.collection("users").doc(auth.uid).get(),
  ]);
  const profile = profileSnap.data() || {};
  const role = lower(record.customClaims?.role || record.customClaims?.userRole || profile.role || profile.userRole);
  if (record.disabled || ["suspended", "disabled", "rejected"].includes(lower(profile.status))) {
    throw new HttpsError("permission-denied", "Broker account is not active.");
  }
  if (role !== "broker") throw new HttpsError("permission-denied", "Broker role required.");
  if (profile.reraVerified !== true || lower(profile.brokerKycStatus) !== "verified") {
    throw new HttpsError("failed-precondition", "Broker KYC must be admin verified before payout requests.");
  }
  if (profile.commissionAgreementAccepted !== true) {
    throw new HttpsError("failed-precondition", "Commission agreement must be accepted before payout requests.");
  }
  if (!text(profile.bankIban || profile.iban) || !text(profile.bankName) || profile.ibanVerified !== true) {
    throw new HttpsError("failed-precondition", "An admin-verified Broker bank name and IBAN are required.");
  }
  return { uid: auth.uid, email: lower(record.email || auth.token?.email || profile.email), profile };
}

async function loadEligibleCommissions(uid: string, requested: unknown) {
  let ids = normalizedCommissionIds(requested);
  if (!ids.length) {
    const snap = await db.collection("broker_commissions")
      .where("brokerId", "==", uid)
      .where("status", "==", "APPROVED")
      .limit(50)
      .get();
    ids = snap.docs
      .filter((document) => !["REQUESTED", "APPROVED", "PAID"].includes(text(document.data().payoutStatus).toUpperCase()))
      .map((document) => document.id)
      .sort();
  }
  if (!ids.length) throw new HttpsError("failed-precondition", "No approved unpaid commissions are available for payout.");
  const refs = ids.map((id) => db.collection("broker_commissions").doc(id));
  const docs = await Promise.all(refs.map((ref) => ref.get()));
  const invalid = docs.find((document) => {
    const data = document.data() || {};
    return !document.exists || data.brokerId !== uid || text(data.status).toUpperCase() !== "APPROVED" ||
      ["REQUESTED", "APPROVED", "PAID"].includes(text(data.payoutStatus).toUpperCase());
  });
  if (invalid) throw new HttpsError("permission-denied", "One or more commissions are not eligible for this Broker payout request.");
  const amount = docs.reduce((sum, document) => sum + numberValue(document.data()?.amount), 0);
  if (amount <= 0) throw new HttpsError("failed-precondition", "Payout amount must be greater than zero.");
  return { ids, refs, amount };
}

async function enforceRate(uid: string) {
  const ref = db.collection("broker_payout_otp_rate_limits").doc(uid);
  const now = Date.now();
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const data = snap.data() || {};
    const started = data.windowStartedAt?.toMillis?.() || 0;
    const current = started > 0 && now - started < 60 * 60 * 1000;
    const count = current ? Number(data.count || 0) : 0;
    if (count >= MAX_REQUESTS_PER_HOUR) throw new HttpsError("resource-exhausted", "Too many payout OTP requests. Try again after one hour.");
    transaction.set(ref, {
      uid,
      count: count + 1,
      windowStartedAt: current ? data.windowStartedAt : admin.firestore.Timestamp.fromMillis(now),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
}

async function sendOtp(email: string, otp: string, amount: number, count: number) {
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
  const from = process.env.MAIL_FROM || process.env.SMTP_FROM || "BIN GROUP <ceo@bin-groups.com>";
  const info = await transport.sendMail({
    from,
    to: email,
    subject: "BIN GROUP Broker payout verification code",
    text: `Your BIN GROUP Broker payout OTP is ${otp}. It authorizes AED ${amount.toFixed(2)} across ${count} commission(s) and expires in 10 minutes.`,
    html: `<div style="font-family:Arial,sans-serif"><h2>Broker payout verification</h2><p>Your one-time code is:</p><p style="font-size:28px;font-weight:800;letter-spacing:4px">${otp}</p><p>Amount: <strong>AED ${amount.toFixed(2)}</strong><br/>Commissions: ${count}</p><p>This code expires in 10 minutes. Do not share it.</p></div>`,
  });
  if (!text(info.messageId)) throw new HttpsError("internal", "OTP delivery provider did not return a message ID.");
  return text(info.messageId);
}

export const requestBrokerPayoutOtp = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true, secrets: [smtpUser, smtpPass] }, async (request) => {
  const broker = await requireBroker(request.auth);
  const commissions = await loadEligibleCommissions(broker.uid, request.data?.commissionIds);
  await enforceRate(broker.uid);
  const otp = makeOtp();
  const salt = crypto.randomBytes(18).toString("hex");
  const challengeRef = db.collection("broker_payout_otps").doc();
  const bindingHash = payoutBinding(broker.uid, commissions.ids, commissions.amount);
  const messageId = await sendOtp(broker.email, otp, commissions.amount, commissions.ids.length);
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + OTP_TTL_MS);
  await challengeRef.set({
    uid: broker.uid,
    email: broker.email,
    commissionIds: commissions.ids,
    commissionCount: commissions.ids.length,
    amount: commissions.amount,
    currency: "AED",
    bindingHash,
    otpHash: otpHash(otp, salt),
    salt,
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    status: "PENDING",
    delivery: { provider: "smtp", messageId, sentAt: FieldValue.serverTimestamp() },
    expiresAt,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await db.collection("audit_logs").add({
    action: "BROKER_PAYOUT_OTP_SENT",
    actorId: broker.uid,
    actorEmail: broker.email,
    challengeId: challengeRef.id,
    bindingHash,
    amount: commissions.amount,
    commissionIds: commissions.ids,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { status: "OTP_SENT", challengeId: challengeRef.id, expiresAt: expiresAt.toMillis(), amount: commissions.amount, commissionCount: commissions.ids.length };
});

export const verifyBrokerPayoutOtp = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const broker = await requireBroker(request.auth);
  const challengeId = text(request.data?.challengeId);
  const otp = text(request.data?.otp);
  if (!challengeId || !/^\d{6}$/.test(otp)) throw new HttpsError("invalid-argument", "Challenge ID and a 6-digit OTP are required.");
  const ref = db.collection("broker_payout_otps").doc(challengeId);
  const result = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) return "NOT_FOUND";
    const data = snap.data() || {};
    if (data.uid !== broker.uid) return "FORBIDDEN";
    if (data.status === "CONSUMED") return "CONSUMED";
    if (data.status === "VERIFIED" && (data.evidenceExpiresAt?.toMillis?.() || 0) > Date.now()) return "VERIFIED";
    const attempts = Number(data.attempts || 0);
    if (attempts >= MAX_ATTEMPTS) return "MAX_ATTEMPTS";
    if ((data.expiresAt?.toMillis?.() || 0) < Date.now()) {
      transaction.set(ref, { status: "EXPIRED", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return "EXPIRED";
    }
    const expected = Buffer.from(text(data.otpHash), "hex");
    const submitted = Buffer.from(otpHash(otp, text(data.salt)), "hex");
    const valid = expected.length > 0 && expected.length === submitted.length && crypto.timingSafeEqual(expected, submitted);
    if (!valid) {
      transaction.set(ref, { attempts: attempts + 1, lastFailedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return "INVALID";
    }
    transaction.set(ref, {
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

export const submitBrokerPayoutRequest = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const broker = await requireBroker(request.auth);
  const challengeId = text(request.data?.challengeId || request.data?.mfaEvidenceId);
  if (!challengeId) throw new HttpsError("failed-precondition", "Verified payout MFA evidence is required.");
  const commissions = await loadEligibleCommissions(broker.uid, request.data?.commissionIds);
  const bindingHash = payoutBinding(broker.uid, commissions.ids, commissions.amount);
  const payoutRef = db.collection("broker_payout_requests").doc();
  const challengeRef = db.collection("broker_payout_otps").doc(challengeId);
  const now = FieldValue.serverTimestamp();
  await db.runTransaction(async (transaction) => {
    const [challengeSnap, ...commissionDocs] = await Promise.all([
      transaction.get(challengeRef),
      ...commissions.refs.map((ref) => transaction.get(ref)),
    ]);
    if (!challengeSnap.exists) throw new HttpsError("not-found", "Payout MFA evidence not found.");
    const challenge = challengeSnap.data() || {};
    if (challenge.uid !== broker.uid) throw new HttpsError("permission-denied", "Payout MFA evidence belongs to another Broker.");
    if (challenge.status !== "VERIFIED") throw new HttpsError("failed-precondition", "Payout MFA evidence is not verified.");
    if ((challenge.evidenceExpiresAt?.toMillis?.() || 0) < Date.now()) throw new HttpsError("deadline-exceeded", "Payout MFA evidence expired.");
    if (challenge.consumedAt || challenge.payoutRequestId) throw new HttpsError("failed-precondition", "Payout MFA evidence has already been consumed.");
    if (challenge.bindingHash !== bindingHash) throw new HttpsError("failed-precondition", "Payout MFA evidence does not match the selected commissions and amount.");
    const invalid = commissionDocs.find((document) => {
      const data = document.data() || {};
      return !document.exists || data.brokerId !== broker.uid || text(data.status).toUpperCase() !== "APPROVED" ||
        ["REQUESTED", "APPROVED", "PAID"].includes(text(data.payoutStatus).toUpperCase());
    });
    if (invalid) throw new HttpsError("permission-denied", "One or more commissions changed after MFA verification.");
    transaction.set(payoutRef, {
      brokerId: broker.uid,
      brokerUid: broker.uid,
      brokerEmail: broker.email,
      brokerName: text(broker.profile.displayName || broker.profile.name, "Broker"),
      brokerCode: text(broker.profile.brokerCode || broker.profile.affiliateCode || `BIN-${broker.uid.slice(0, 8).toUpperCase()}`),
      amount: commissions.amount,
      currency: "AED",
      commissionIds: commissions.ids,
      commissionCount: commissions.ids.length,
      bankName: text(broker.profile.bankName),
      bankAccountHolder: text(broker.profile.bankAccountHolder || broker.profile.displayName || broker.profile.name),
      bankIban: text(broker.profile.bankIban || broker.profile.iban),
      status: "PENDING_ADMIN_REVIEW",
      approvalStatus: "PENDING",
      paymentStatus: "REQUESTED",
      verificationState: "MFA_VERIFIED_ADMIN_FINANCE_REVIEW_REQUIRED",
      mfaChallengeId: challengeId,
      mfaBindingHash: bindingHash,
      requestedBy: broker.uid,
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    commissionDocs.forEach((document) => transaction.set(document.ref, {
      payoutStatus: "REQUESTED",
      payoutRequestId: payoutRef.id,
      payoutRequestedAt: now,
      updatedAt: now,
    }, { merge: true }));
    transaction.set(challengeRef, { status: "CONSUMED", consumedAt: now, payoutRequestId: payoutRef.id, updatedAt: now }, { merge: true });
    transaction.set(db.collection("audit_logs").doc(), {
      action: "BROKER_PAYOUT_REQUEST_SUBMITTED",
      actorId: broker.uid,
      actorEmail: broker.email,
      brokerId: broker.uid,
      payoutRequestId: payoutRef.id,
      challengeId,
      bindingHash,
      commissionIds: commissions.ids,
      amount: commissions.amount,
      mfaAuthority: "EMAIL_OTP_SINGLE_USE",
      createdAt: now,
    });
  });
  return { status: "SUCCESS", payoutRequestId: payoutRef.id, amount: commissions.amount, commissionCount: commissions.ids.length };
});
