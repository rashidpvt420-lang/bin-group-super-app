/**
 * Owner Trust Centre — Privacy Centre (gap audit 2026-11-01, item 5).
 *
 * - Access log: recorded audit events that touched the owner's data (audit_logs where
 *   targetOwnerId == owner, or actions by the owner). Only what was recorded; no inference.
 * - Data export: the owner's own records from a fixed list of owner-keyed collections (JSON).
 * - Correction requests: owner files; Admin resolves. Server writes only.
 * - Sharing with expiry: time-limited, scoped share grants (1–90 days) with revoke. Expired grants
 *   are reported as EXPIRED and never treated as active.
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const text = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
export const EXPORT_COLLECTIONS = ["properties", "leases", "property_assets", "owner_approval_requests", "compliance_reminders", "owner_correction_requests", "privacy_shares"];
export const SHARE_SCOPES = ["PROPERTY_PASSPORT", "STATEMENTS", "COMPLIANCE_CALENDAR"];
export const CORRECTION_FIELDS = ["PROFILE", "PROPERTY", "LEASE", "PAYMENT_RECORD", "OTHER"];
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[A-Za-z]{2,24}$/;
const iso = (v: any) => (v && typeof v.toDate === "function" ? v.toDate().toISOString() : v ?? null);

async function requireOwner(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in required. / يلزم تسجيل الدخول.");
  const role = text(auth.token?.role || auth.token?.userRole, 40).toLowerCase();
  if (role !== "owner" || auth.token?.suspended === true) throw new HttpsError("permission-denied", "Owner access only. / للمالك فقط.");
  const prof = await admin.firestore().doc(`users/${auth.uid}`).get();
  if (prof.data()?.suspended === true) throw new HttpsError("permission-denied", "Account suspended. / الحساب موقوف.");
  return auth.uid as string;
}

export function shareState(share: any, nowMs: number) {
  if (share?.revokedAt) return "REVOKED";
  const exp = share?.expiresAt?.toMillis ? share.expiresAt.toMillis() : Date.parse(String(share?.expiresAt));
  return Number.isFinite(exp) && exp > nowMs ? "ACTIVE" : "EXPIRED";
}

export const getOwnerPrivacyCentre = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const uid = await requireOwner(request.auth);
  const db = admin.firestore();
  const [about, byMe, shares, corrections] = await Promise.all([
    db.collection("audit_logs").where("targetOwnerId", "==", uid).limit(100).get(),
    db.collection("audit_logs").where("actorId", "==", uid).limit(100).get(),
    db.collection("privacy_shares").where("ownerId", "==", uid).limit(100).get(),
    db.collection("owner_correction_requests").where("ownerId", "==", uid).limit(100).get(),
  ]);
  const seen = new Set<string>();
  const accessLog = [...about.docs, ...byMe.docs].filter((d) => !seen.has(d.id) && seen.add(d.id)).map((d) => {
    const x = d.data();
    return { id: d.id, action: text(x.action, 120), actorRole: text(x.actorRole, 40) || (x.actorId === uid ? "owner" : null), byYou: x.actorId === uid, targetType: text(x.targetType, 80), at: iso(x.createdAt) };
  }).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const now = Date.now();
  return {
    accessLog,
    shares: shares.docs.map((d) => ({ shareId: d.id, granteeEmail: d.data().granteeEmail, scope: d.data().scope, expiresAt: iso(d.data().expiresAt), state: shareState(d.data(), now) })),
    corrections: corrections.docs.map((d) => ({ requestId: d.id, field: d.data().field, status: d.data().status, details: d.data().details, createdAt: iso(d.data().createdAt) })),
  };
});

export const ownerExportMyData = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const uid = await requireOwner(request.auth);
  const db = admin.firestore();
  const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), ownerId: uid };
  const profile = (await db.doc(`users/${uid}`).get()).data() || {};
  out.profile = Object.fromEntries(Object.entries(profile).map(([k, v]) => [k, iso(v)]));
  for (const c of EXPORT_COLLECTIONS) {
    const s = await db.collection(c).where("ownerId", "==", uid).limit(1000).get();
    out[c] = s.docs.map((d) => ({ id: d.id, ...Object.fromEntries(Object.entries(d.data()).map(([k, v]) => [k, iso(v)])) }));
  }
  await db.collection("audit_logs").add({ action: "OWNER_DATA_EXPORT", actorId: uid, actorRole: "owner", targetOwnerId: uid, targetType: "owner_data", createdAt: FieldValue.serverTimestamp() });
  return out;
});

export const ownerSubmitCorrectionRequest = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const uid = await requireOwner(request.auth);
  const field = text(request.data?.field, 30).toUpperCase();
  const details = text(request.data?.details, 1000);
  if (!CORRECTION_FIELDS.includes(field) || details.length < 5) throw new HttpsError("invalid-argument", "Choose what to correct and describe it. / اختر ما تريد تصحيحه وصِفه.");
  const db = admin.firestore();
  const open = await db.collection("owner_correction_requests").where("ownerId", "==", uid).where("status", "==", "OPEN").limit(20).get();
  if (open.size >= 10) throw new HttpsError("resource-exhausted", "Too many open requests. / طلبات مفتوحة كثيرة.");
  const ref = await db.collection("owner_correction_requests").add({ ownerId: uid, field, details, recordRef: text(request.data?.recordRef, 200) || null, status: "OPEN", createdAt: FieldValue.serverTimestamp() });
  await db.collection("audit_logs").add({ action: "OWNER_CORRECTION_REQUEST", actorId: uid, actorRole: "owner", targetOwnerId: uid, targetType: "owner_correction_requests", targetId: ref.id, createdAt: FieldValue.serverTimestamp() });
  return { status: "SUCCESS", requestId: ref.id };
});

export const ownerCreateDataShare = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const uid = await requireOwner(request.auth);
  const granteeEmail = text(request.data?.granteeEmail, 254).toLowerCase();
  const scope = text(request.data?.scope, 40).toUpperCase();
  const days = Number(request.data?.expiresInDays);
  if (!EMAIL_RE.test(granteeEmail) || !SHARE_SCOPES.includes(scope) || !Number.isInteger(days) || days < 1 || days > 90) {
    throw new HttpsError("invalid-argument", "A valid email, scope and 1–90 day expiry are required. / يلزم بريد ونطاق ومدة 1–90 يوماً.");
  }
  const db = admin.firestore();
  const ref = await db.collection("privacy_shares").add({ ownerId: uid, granteeEmail, scope, expiresAt: Timestamp.fromMillis(Date.now() + days * 86_400_000), revokedAt: null, createdAt: FieldValue.serverTimestamp() });
  await db.collection("audit_logs").add({ action: "OWNER_DATA_SHARE_CREATED", actorId: uid, actorRole: "owner", targetOwnerId: uid, targetType: "privacy_shares", targetId: ref.id, createdAt: FieldValue.serverTimestamp() });
  return { status: "SUCCESS", shareId: ref.id };
});

export const ownerRevokeDataShare = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const uid = await requireOwner(request.auth);
  const shareId = text(request.data?.shareId, 180);
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(shareId)) throw new HttpsError("invalid-argument", "shareId required. / المعرف مطلوب.");
  const db = admin.firestore();
  const ref = db.doc(`privacy_shares/${shareId}`);
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists || s.data()?.ownerId !== uid) throw new HttpsError("not-found", "Share not found. / المشاركة غير موجودة.");
    if (!s.data()?.revokedAt) tx.update(ref, { revokedAt: FieldValue.serverTimestamp() });
    tx.create(db.collection("audit_logs").doc(), { action: "OWNER_DATA_SHARE_REVOKED", actorId: uid, actorRole: "owner", targetOwnerId: uid, targetType: "privacy_shares", targetId: shareId, createdAt: FieldValue.serverTimestamp() });
  });
  return { status: "SUCCESS" };
});
