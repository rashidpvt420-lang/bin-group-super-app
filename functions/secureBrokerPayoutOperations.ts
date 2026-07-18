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
const money = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
const hashOtp = (otp: string, salt: string) => hash(`${otp}:${salt}`);

function commissionIds(value: unknown): string[] {
  const values = Array.isArray(value) ? value.map((entry) => text(entry)).filter(Boolean) : [];
  return Array.from(new Set<string>(values)).sort().slice(0, 50);
}

function binding(uid: string, ids: string[], amount: number) {
  return hash(`${uid}|${ids.join(",")}|AED|${amount.toFixed(2)}`);
}

async function requireBroker(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Broker login required.");
  const [record, profileSnap, privateKycSnap] = await Promise.all([
    admin.auth().getUser(auth.uid),
    db.collection("users").doc(auth.uid).get(),
    db.collection("broker_kyc_profiles").doc(auth.uid).get(),
  ]);
  const profile = profileSnap.data() || {};
  const privateKyc = privateKycSnap.data() || {};
  const role = lower(record.customClaims?.role || record.customClaims?.userRole || profile.role || profile.userRole);
  if (record.disabled || auth.token?.suspended === true || ["suspended", "disabled", "rejected"].includes(lower(profile.status))) {
    throw new HttpsError("permission-denied", "Broker account is not active.");
  }
  if (!record.emailVerified || !record.email) throw new HttpsError("failed-precondition", "A verified Broker email is required.");
  if (role !== "broker") throw new HttpsError("permission-denied", "Broker role required.");
  if (!privateKycSnap.exists) {
    throw new HttpsError("failed-precondition", "Private Broker KYC profile is required before payout requests.");
  }
  if (
    profile.reraVerified !== true ||
    lower(profile.brokerKycStatus) !== "verified" ||
    profile.ibanVerified !== true ||
    privateKyc.reraVerified !== true ||
    privateKyc.ibanVerified !== true ||
    lower(privateKyc.brokerKycStatus) !== "verified"
  ) {
    throw new HttpsError("failed-precondition", "Broker KYC must be admin verified before payout requests.");
  }
  const submissionHash = text(privateKyc.submissionHash);
  const approvedSubmissionHash = text(privateKyc.approvedSubmissionHash || profile.approvedSubmissionHash);
  if (!submissionHash || approvedSubmissionHash !== submissionHash) {
    throw new HttpsError("failed-precondition", "Broker KYC changed after approval and must be reviewed again.");
  }
  if (profile.commissionAgreementAccepted !== true || privateKyc.commissionAgreementAccepted !== true) {
    throw new HttpsError("failed-precondition", "Commission agreement must be accepted before payout requests.");
  }
  if (!text(privateKyc.bankIban) || !text(privateKyc.bankName) || !text(privateKyc.bankAccountHolder)) {
    throw new HttpsError("failed-precondition", "An admin-verified Broker bank name, account holder, and IBAN are required.");
  }
  return {
    uid: auth.uid,
    email: lower(record.email),
    profile,
    bankProfile: privateKyc,
    approvedSubmissionHash,
  };
}

async function eligible(uid: string, requested: unknown) {
  let ids = commissionIds(requested);
  if (!ids.length) {
    const snap = await db.collection("broker_commissions").where("brokerId", "==", uid).where("status", "==", "APPROVED").limit(50).get();
    ids = snap.docs.filter((doc) => !["REQUESTED", "APPROVED", "PAID"].includes(text(doc.data().payoutStatus).toUpperCase())).map((doc) => doc.id).sort();
  }
  if (!ids.length) throw new HttpsError("failed-precondition", "No approved unpaid commissions are available for payout.");
  const refs = ids.map((id) => db.collection("broker_commissions").doc(id));
  const docs = await Promise.all(refs.map((ref) => ref.get()));
  const invalid = docs.some((doc) => {
    const data = doc.data() || {};
    return !doc.exists || data.brokerId !== uid || text(data.status).toUpperCase() !== "APPROVED" || ["REQUESTED", "APPROVED", "PAID"].includes(text(data.payoutStatus).toUpperCase());
  });
  if (invalid) throw new HttpsError("permission-denied", "One or more commissions are not eligible for this payout.");
  const amount = docs.reduce((sum, doc) => sum + money(doc.data()?.amount), 0);
  if (amount <= 0) throw new HttpsError("failed-precondition", "Payout amount must be greater than zero.");
  return { ids, refs, amount };
}

async function enforceRate(uid: string) {
  const ref = db.collection("broker_payout_otp_rate_limits").doc(uid);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    const now = Date.now();
    const started = data.windowStartedAt?.toMillis?.() || 0;
    const active = started > 0 && now - started < 60 * 60 * 1000;
    const count = active ? Number(data.count || 0) : 0;
    if (count >= MAX_REQUESTS_PER_HOUR) throw new HttpsError("resource-exhausted", "Too many payout OTP requests. Try again after one hour.");
    tx.set(ref, { uid, count: count + 1, windowStartedAt: active ? data.windowStartedAt : admin.firestore.Timestamp.fromMillis(now), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

async function deliverOtp(email: string, otp: string, amount: number, count: number) {
  const user = smtpUser.value() || process.env.SMTP_USER || "";
  const pass = smtpPass.value() || process.env.SMTP_PASS || "";
  if (!user || !pass) throw new HttpsError("failed-precondition", "SMTP email service is not configured.");
  const nodemailer = await import("nodemailer");
  const port = Number(process.env.SMTP_PORT || 465);
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST || "smtp.sendgrid.net", port, secure: port === 465, auth: { user, pass } });
  const info = await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_FROM || "BIN GROUP <ceo@bin-groups.com>",
    to: email,
    subject: "BIN GROUP payout verification code",
    text: `Your payout code is ${otp}. It authorizes AED ${amount.toFixed(2)} across ${count} commission(s) and expires in 10 minutes.`,
  });
  if (!text(info.messageId)) throw new HttpsError("internal", "OTP provider did not confirm delivery.");
  return text(info.messageId);
}

export const requestBrokerPayoutOtp = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true, secrets: [smtpUser, smtpPass] }, async (request) => {
  const broker = await requireBroker(request.auth);
  const commissions = await eligible(broker.uid, request.data?.commissionIds);
  await enforceRate(broker.uid);
  const otp = String(crypto.randomInt(100000, 1000000));
  const salt = crypto.randomBytes(18).toString("hex");
  const ref = db.collection("broker_payout_otps").doc();
  const bindingHash = binding(broker.uid, commissions.ids, commissions.amount);
  const messageId = await deliverOtp(broker.email, otp, commissions.amount, commissions.ids.length);
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + OTP_TTL_MS);
  await ref.set({ uid: broker.uid, email: broker.email, commissionIds: commissions.ids, amount: commissions.amount, currency: "AED", bindingHash, kycSubmissionHash: broker.approvedSubmissionHash, otpHash: hashOtp(otp, salt), salt, attempts: 0, status: "PENDING", expiresAt, delivery: { messageId, sentAt: FieldValue.serverTimestamp() }, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await db.collection("audit_logs").add({ action: "BROKER_PAYOUT_OTP_SENT", actorId: broker.uid, challengeId: ref.id, bindingHash, kycSubmissionHash: broker.approvedSubmissionHash, createdAt: FieldValue.serverTimestamp() });
  return { status: "OTP_SENT", challengeId: ref.id, expiresAt: expiresAt.toMillis(), amount: commissions.amount, commissionCount: commissions.ids.length };
});

export const verifyBrokerPayoutOtp = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const broker = await requireBroker(request.auth);
  const challengeId = text(request.data?.challengeId);
  const otp = text(request.data?.otp);
  if (!challengeId || !/^\d{6}$/.test(otp)) throw new HttpsError("invalid-argument", "Challenge ID and a 6-digit OTP are required.");
  const ref = db.collection("broker_payout_otps").doc(challengeId);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return "NOT_FOUND";
    const data = snap.data() || {};
    if (data.uid !== broker.uid) return "FORBIDDEN";
    if (data.kycSubmissionHash !== broker.approvedSubmissionHash) return "KYC_CHANGED";
    if (data.status === "CONSUMED") return "CONSUMED";
    if ((data.expiresAt?.toMillis?.() || 0) < Date.now()) return "EXPIRED";
    const attempts = Number(data.attempts || 0);
    if (attempts >= MAX_ATTEMPTS) return "MAX_ATTEMPTS";
    const expected = Buffer.from(text(data.otpHash), "hex");
    const submitted = Buffer.from(hashOtp(otp, text(data.salt)), "hex");
    const valid = expected.length > 0 && expected.length === submitted.length && crypto.timingSafeEqual(expected, submitted);
    if (!valid) { tx.set(ref, { attempts: attempts + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); return "INVALID"; }
    tx.set(ref, { status: "VERIFIED", verifiedAt: FieldValue.serverTimestamp(), evidenceExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + EVIDENCE_TTL_MS), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return "VERIFIED";
  });
  const messages: Record<string, [any, string]> = {
    NOT_FOUND: ["not-found", "Payout OTP challenge not found."],
    FORBIDDEN: ["permission-denied", "Payout OTP challenge belongs to another Broker."],
    KYC_CHANGED: ["failed-precondition", "Broker KYC changed after the OTP was issued."],
    CONSUMED: ["failed-precondition", "Payout OTP evidence was already consumed."],
    EXPIRED: ["deadline-exceeded", "Payout OTP expired."],
    MAX_ATTEMPTS: ["resource-exhausted", "Maximum OTP attempts exceeded."],
    INVALID: ["permission-denied", "Invalid payout OTP."],
  };
  if (result !== "VERIFIED") { const [code, message] = messages[result]; throw new HttpsError(code, message); }
  await db.collection("audit_logs").add({ action: "BROKER_PAYOUT_OTP_VERIFIED", actorId: broker.uid, challengeId, kycSubmissionHash: broker.approvedSubmissionHash, createdAt: FieldValue.serverTimestamp() });
  return { status: "VERIFIED", challengeId };
});

export const submitBrokerPayoutRequest = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const broker = await requireBroker(request.auth);
  const challengeId = text(request.data?.challengeId);
  if (!challengeId) throw new HttpsError("failed-precondition", "Verified payout OTP evidence is required.");
  const commissions = await eligible(broker.uid, request.data?.commissionIds);
  const bindingHash = binding(broker.uid, commissions.ids, commissions.amount);
  const challengeRef = db.collection("broker_payout_otps").doc(challengeId);
  const payoutRef = db.collection("broker_payout_requests").doc();
  const now = FieldValue.serverTimestamp();
  await db.runTransaction(async (tx) => {
    const challengeSnap = await tx.get(challengeRef);
    if (!challengeSnap.exists) throw new HttpsError("not-found", "Payout OTP evidence not found.");
    const challenge = challengeSnap.data() || {};
    if (challenge.uid !== broker.uid || challenge.status !== "VERIFIED") throw new HttpsError("permission-denied", "Payout OTP evidence is not valid for this Broker.");
    if (challenge.kycSubmissionHash !== broker.approvedSubmissionHash) throw new HttpsError("failed-precondition", "Broker KYC changed after OTP verification.");
    if ((challenge.evidenceExpiresAt?.toMillis?.() || 0) < Date.now()) throw new HttpsError("deadline-exceeded", "Payout OTP evidence expired.");
    if (challenge.consumedAt || challenge.payoutRequestId) throw new HttpsError("failed-precondition", "Payout OTP evidence was already consumed.");
    if (challenge.bindingHash !== bindingHash) throw new HttpsError("failed-precondition", "Payout OTP evidence does not match the selected commissions and amount.");
    const commissionDocs = await Promise.all(commissions.refs.map((ref) => tx.get(ref)));
    const changed = commissionDocs.some((doc) => !doc.exists || doc.data()?.brokerId !== broker.uid || text(doc.data()?.status).toUpperCase() !== "APPROVED" || ["REQUESTED", "APPROVED", "PAID"].includes(text(doc.data()?.payoutStatus).toUpperCase()));
    if (changed) throw new HttpsError("failed-precondition", "One or more commissions changed after OTP verification.");
    tx.set(payoutRef, {
      brokerId: broker.uid,
      brokerUid: broker.uid,
      brokerEmail: broker.email,
      brokerName: text(broker.bankProfile.displayName || broker.profile.displayName || broker.profile.name) || "Broker",
      brokerCode: text(broker.profile.brokerCode || broker.profile.affiliateCode) || `BIN-${broker.uid.slice(0, 8).toUpperCase()}`,
      amount: commissions.amount,
      currency: "AED",
      commissionIds: commissions.ids,
      commissionCount: commissions.ids.length,
      bankName: text(broker.bankProfile.bankName),
      bankAccountHolder: text(broker.bankProfile.bankAccountHolder || broker.bankProfile.displayName),
      bankIban: text(broker.bankProfile.bankIban),
      kycSubmissionHash: broker.approvedSubmissionHash,
      status: "PENDING_ADMIN_REVIEW",
      approvalStatus: "PENDING",
      paymentStatus: "REQUESTED",
      verificationState: "EMAIL_OTP_SINGLE_USE_PRIVATE_KYC",
      mfaChallengeId: challengeId,
      mfaBindingHash: bindingHash,
      requestedBy: broker.uid,
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    commissionDocs.forEach((doc) => tx.set(doc.ref, { payoutStatus: "REQUESTED", payoutRequestId: payoutRef.id, payoutRequestedAt: now, updatedAt: now }, { merge: true }));
    tx.set(challengeRef, { status: "CONSUMED", consumedAt: now, payoutRequestId: payoutRef.id, updatedAt: now }, { merge: true });
    tx.set(db.collection("audit_logs").doc(), { action: "BROKER_PAYOUT_REQUEST_SUBMITTED_WITH_OTP", actorId: broker.uid, payoutRequestId: payoutRef.id, challengeId, bindingHash, kycSubmissionHash: broker.approvedSubmissionHash, commissionIds: commissions.ids, amount: commissions.amount, createdAt: now });
  });
  return { status: "SUCCESS", payoutRequestId: payoutRef.id, amount: commissions.amount, commissionCount: commissions.ids.length };
});
