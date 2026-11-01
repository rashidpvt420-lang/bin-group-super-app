// Owner referral rewards.
//
// Security model:
//   - Every write runs here; firestore.rules deny all browser writes (Admin sessions included).
//   - An owner gets one personal code. A NEW owner (no recorded payments yet) may apply one code,
//     once, and never their own. The subject is always request.auth.uid.
//   - The programme is OFF until an Admin (verified MFA session) enables it and sets the reward in
//     AED. Every change is versioned and audited.
//   - A reward is never automatic and never decided by AI. A Finance Admin (MFA) approves it only
//     after linking a real, unvoided, cash/cheque payment_collection_records entry paid by the
//     referred owner. The approver can be neither the referrer nor the referred owner. A record can
//     back only one referral.
//   - The reward is a service credit on the referrer's account (no cash payout, no card).
import * as admin from "firebase-admin";
import { randomInt } from "node:crypto";
import type * as FirebaseFirestore from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requirePrivilegedMfaSession } from "./adminMfaSession";
import { requireMfaFinanceAdminActor } from "./financeAdminMfa";

if (!admin.apps.length) admin.initializeApp();

const db = () => admin.firestore();
const REGION = "europe-west3";
export const REFERRAL_POLICY_VERSION = "BIN-OWNER-REFERRAL-2026-11";
export const REFERRAL_ALLOWED_METHODS = ["cash", "cheque"] as const;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
const CONFIG_PATH = "owner_referral_program/config";

export class ReferralRuleError extends Error {}
const text = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const isAdmin = (auth: any) => auth?.token?.admin === true || auth?.token?.role === "admin" || auth?.token?.role === "super_admin";
const isOwner = (auth: any) => String(auth?.token?.role ?? "").toLowerCase() === "owner";
const asHttps = (e: unknown) => (e instanceof ReferralRuleError ? new HttpsError("invalid-argument", e.message) : e);

export function generateReferralCode(rand: (max: number) => number = randomInt): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[rand(CODE_ALPHABET.length)];
  return `BIN-${s}`;
}

export function normaliseCode(value: unknown): string {
  const raw = text(value, 20).toUpperCase().replace(/\s+/g, "");
  const code = raw.startsWith("BIN-") ? raw : `BIN-${raw}`;
  if (!new RegExp(`^BIN-[${CODE_ALPHABET}]{8}$`).test(code)) throw new ReferralRuleError("Enter a valid referral code.");
  return code;
}

/** Exact AED to the fils; 0 < reward <= 10,000. */
export function parseRewardAed(value: unknown): number {
  const raw = typeof value === "number" ? String(value) : text(value, 20);
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(raw)) throw new ReferralRuleError("Reward must be AED with at most 2 decimals.");
  const n = Number(raw);
  if (!(n > 0) || n > 10000) throw new ReferralRuleError("Reward must be between AED 0.01 and AED 10,000.");
  return n;
}

function audit(tx: FirebaseFirestore.Transaction, action: string, actorUid: string, data: Record<string, unknown>) {
  tx.set(db().collection("audit_logs").doc(), {
    action, actorUid, targetType: "owner_referrals", policyVersion: REFERRAL_POLICY_VERSION, ...data, at: FieldValue.serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Admin: programme switch + reward amount (OFF by default)
// ---------------------------------------------------------------------------
export const adminSetOwnerReferralProgram = onCall({ cors: true, region: REGION, enforceAppCheck: true }, async (request) => {
  if (!isAdmin(request.auth)) throw new HttpsError("permission-denied", "Admin only.");
  await requirePrivilegedMfaSession(request.auth);
  const enabled = request.data?.enabled === true;
  let rewardAed: number;
  try { rewardAed = parseRewardAed(request.data?.rewardAed); } catch (e) { throw asHttps(e); }
  const uid = request.auth!.uid;
  const ref = db().doc(CONFIG_PATH);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const version = Number(snap.get("version") ?? 0) + 1;
    const cfg = { enabled, rewardAed, currency: "AED", rewardType: "SERVICE_CREDIT", version };
    tx.set(ref, { ...cfg, updatedBy: uid, updatedAt: FieldValue.serverTimestamp() });
    tx.set(ref.collection("history").doc(`v${version}`), { ...cfg, changedBy: uid, changedAt: FieldValue.serverTimestamp() });
    audit(tx, "OWNER_REFERRAL_PROGRAM_SET", uid, { enabled, rewardAed, version });
    return cfg;
  });
});

// ---------------------------------------------------------------------------
// Owner: get (or create) my code
// ---------------------------------------------------------------------------
export const ownerGetReferralCode = onCall({ cors: true, region: REGION, enforceAppCheck: true }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!isOwner(request.auth)) throw new HttpsError("permission-denied", "Owners only.");
  const uid = request.auth.uid;
  const profileRef = db().collection("owner_referral_profiles").doc(uid);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    const codeRef = db().collection("owner_referral_codes").doc(code);
    const result = await db().runTransaction(async (tx) => {
      const [profile, taken] = await Promise.all([tx.get(profileRef), tx.get(codeRef)]);
      if (profile.exists && profile.get("code")) return { code: String(profile.get("code")), created: false };
      if (taken.exists) return null;
      tx.create(codeRef, { ownerUid: uid, createdAt: FieldValue.serverTimestamp() });
      tx.set(profileRef, { ownerUid: uid, code, createdAt: FieldValue.serverTimestamp() });
      audit(tx, "OWNER_REFERRAL_CODE_CREATED", uid, { code });
      return { code, created: true };
    });
    if (result) return result;
  }
  throw new HttpsError("unavailable", "Could not create a code. Try again.");
});

// ---------------------------------------------------------------------------
// Owner (new): apply a code once
// ---------------------------------------------------------------------------
export const ownerApplyReferralCode = onCall({ cors: true, region: REGION, enforceAppCheck: true }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.");
  if (!isOwner(request.auth)) throw new HttpsError("permission-denied", "Owners only.");
  const uid = request.auth.uid;
  let code: string;
  try { code = normaliseCode(request.data?.code); } catch (e) { throw asHttps(e); }
  const cfg = await db().doc(CONFIG_PATH).get();
  if (cfg.get("enabled") !== true) throw new HttpsError("failed-precondition", "The referral programme is not open right now.");
  const paid = await db().collection("payment_collection_records").where("payerUid", "==", uid).limit(1).get();
  if (!paid.empty) throw new HttpsError("failed-precondition", "Referral codes are for new owners only.");
  const codeRef = db().collection("owner_referral_codes").doc(code);
  const refRef = db().collection("owner_referrals").doc(uid);
  return db().runTransaction(async (tx) => {
    const [codeSnap, existing] = await Promise.all([tx.get(codeRef), tx.get(refRef)]);
    if (existing.exists) {
      if (existing.get("code") === code) return { referralId: uid, status: String(existing.get("status")), idempotent: true };
      throw new HttpsError("already-exists", "You have already used a referral code.");
    }
    if (!codeSnap.exists) throw new HttpsError("not-found", "Referral code not found.");
    const referrerUid = String(codeSnap.get("ownerUid"));
    if (referrerUid === uid) throw new HttpsError("failed-precondition", "You cannot use your own code.");
    tx.create(refRef, {
      referredUid: uid, referrerUid, code, status: "PENDING_VERIFIED_PAYMENT", policyVersion: REFERRAL_POLICY_VERSION,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    audit(tx, "OWNER_REFERRAL_APPLIED", uid, { referralId: uid, referrerUid, code });
    return { referralId: uid, status: "PENDING_VERIFIED_PAYMENT" };
  });
});

// ---------------------------------------------------------------------------
// Finance (MFA, human): approve after a verified cash/cheque payment by the referred owner
// ---------------------------------------------------------------------------
export const financeApproveOwnerReferralReward = onCall({ cors: true, region: REGION, enforceAppCheck: true }, async (request) => {
  const actor = await requireMfaFinanceAdminActor(request);
  const referralId = text(request.data?.referralId, 128);
  if (!referralId || referralId.includes("/")) throw new HttpsError("invalid-argument", "referralId is required.");
  const recordId = text(request.data?.collectionRecordId, 64);
  if (!/^[a-f0-9]{32}$/.test(recordId)) throw new HttpsError("invalid-argument", "A payment collection record is required.");
  const refRef = db().collection("owner_referrals").doc(referralId);
  const recRef = db().collection("payment_collection_records").doc(recordId);
  const voidRef = db().collection("payment_collection_voids").doc(recordId);
  const useRef = db().collection("owner_referral_record_uses").doc(recordId);
  const cfgRef = db().doc(CONFIG_PATH);
  return db().runTransaction(async (tx) => {
    const [ref, rec, voided, used, cfg] = await Promise.all([tx.get(refRef), tx.get(recRef), tx.get(voidRef), tx.get(useRef), tx.get(cfgRef)]);
    if (!ref.exists) throw new HttpsError("not-found", "Referral not found.");
    if (ref.get("status") === "REWARD_APPROVED") return { referralId, status: "REWARD_APPROVED", idempotent: true };
    if (ref.get("status") !== "PENDING_VERIFIED_PAYMENT") throw new HttpsError("failed-precondition", "Referral is not awaiting approval.");
    if (actor.uid === ref.get("referrerUid") || actor.uid === ref.get("referredUid")) {
      throw new HttpsError("permission-denied", "You cannot approve a referral you are part of.");
    }
    if (cfg.get("enabled") !== true) throw new HttpsError("failed-precondition", "The referral programme is switched off.");
    if (!rec.exists) throw new HttpsError("not-found", "Payment collection record not found.");
    if (voided.exists) throw new HttpsError("failed-precondition", "That collection record was voided.");
    if (used.exists) throw new HttpsError("failed-precondition", "That collection record already backs a referral.");
    const r = rec.data()!;
    if (r.payerUid !== ref.get("referredUid")) throw new HttpsError("failed-precondition", "The record was not paid by the referred owner.");
    if (!(REFERRAL_ALLOWED_METHODS as readonly string[]).includes(String(r.method))) throw new HttpsError("failed-precondition", "Only cash or cheque collections count.");
    if (r.status !== "collected") throw new HttpsError("failed-precondition", "The collection is not in collected status.");
    const rewardAed = Number(cfg.get("rewardAed"));
    const referrerUid = String(ref.get("referrerUid"));
    tx.update(refRef, {
      status: "REWARD_APPROVED", rewardAed, rewardCurrency: "AED", rewardType: "SERVICE_CREDIT", programVersion: Number(cfg.get("version") ?? 0),
      collectionRecordId: recordId, approvedBy: actor.uid, approvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    tx.create(useRef, { referralId, at: FieldValue.serverTimestamp() });
    tx.create(db().collection("owner_referral_credits").doc(referralId), {
      ownerUid: referrerUid, referralId, amountAed: rewardAed, currency: "AED", type: "SERVICE_CREDIT", status: "AVAILABLE",
      approvedBy: actor.uid, createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(db().collection("notifications").doc(`referral_reward_${referralId}`), {
      recipientId: referrerUid, userId: referrerUid, type: "OWNER_REFERRAL_REWARD",
      title: "Referral reward approved", titleAr: "تمت الموافقة على مكافأة الإحالة",
      body: `AED ${rewardAed.toFixed(2)} service credit was added to your account.`,
      bodyAr: `تمت إضافة رصيد خدمات بقيمة ${rewardAed.toFixed(2)} درهم إلى حسابك.`,
      read: false, createdAt: FieldValue.serverTimestamp(),
    });
    audit(tx, "OWNER_REFERRAL_REWARD_APPROVED", actor.uid, { referralId, referrerUid, collectionRecordId: recordId, rewardAed });
    return { referralId, status: "REWARD_APPROVED", rewardAed };
  });
});

export const financeRejectOwnerReferral = onCall({ cors: true, region: REGION, enforceAppCheck: true }, async (request) => {
  const actor = await requireMfaFinanceAdminActor(request);
  const referralId = text(request.data?.referralId, 128);
  const reason = text(request.data?.reason, 500);
  if (!referralId || referralId.includes("/")) throw new HttpsError("invalid-argument", "referralId is required.");
  if (reason.length < 5) throw new HttpsError("invalid-argument", "A written reason is required.");
  const refRef = db().collection("owner_referrals").doc(referralId);
  return db().runTransaction(async (tx) => {
    const ref = await tx.get(refRef);
    if (!ref.exists) throw new HttpsError("not-found", "Referral not found.");
    if (ref.get("status") !== "PENDING_VERIFIED_PAYMENT") throw new HttpsError("failed-precondition", "Referral is not awaiting approval.");
    if (actor.uid === ref.get("referrerUid") || actor.uid === ref.get("referredUid")) {
      throw new HttpsError("permission-denied", "You cannot decide a referral you are part of.");
    }
    tx.update(refRef, { status: "REJECTED", rejectionReason: reason, rejectedBy: actor.uid, updatedAt: FieldValue.serverTimestamp() });
    audit(tx, "OWNER_REFERRAL_REJECTED", actor.uid, { referralId, reason });
    return { referralId, status: "REJECTED" };
  });
});
