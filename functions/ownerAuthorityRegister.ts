/**
 * Owner Trust Centre — Owner Authority Register (gap audit 2026-11-01, item 8).
 * Records who may act for the owner under a Power of Attorney or management agreement: the scope,
 * per-person permissions, expiry, and a grant/revoke history. These are records the owner keeps.
 * The platform does not verify the legal validity of the documents.
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const OPTS = { cors: true, region: "europe-west3", enforceAppCheck: true } as const;
export const AUTHORITY_TYPES = ["POWER_OF_ATTORNEY", "MANAGEMENT_AGREEMENT"] as const;
export const PERMISSIONS = ["VIEW_STATEMENTS", "VIEW_MAINTENANCE", "REQUEST_MAINTENANCE", "MANAGE_TENANTS", "DISCUSS_LEASES"] as const;
const text = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const MAX_YEARS = 10;

async function ownerGate(auth: { uid: string; token: Record<string, unknown> } | undefined) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in required. / يلزم تسجيل الدخول.");
  const role = text(auth.token?.role || auth.token?.userRole, 40).toLowerCase();
  if (role !== "owner" || auth.token?.suspended === true) throw new HttpsError("permission-denied", "Owner access only. / للمالك فقط.");
  if ((await admin.firestore().doc(`users/${auth.uid}`).get()).data()?.suspended === true) throw new HttpsError("permission-denied", "Account suspended. / الحساب موقوف.");
  return auth.uid;
}

export function authorityState(d: { status?: string; expiresAt?: { toMillis(): number } }, now = Date.now()) {
  if (d.status === "REVOKED") return "REVOKED";
  if (d.expiresAt && d.expiresAt.toMillis() <= now) return "EXPIRED";
  return "ACTIVE";
}

export const ownerGrantAuthority = onCall(OPTS, async (request) => {
  const ownerId = await ownerGate(request.auth as never);
  const db = admin.firestore();
  const d = request.data || {};
  const type = text(d.type, 40).toUpperCase();
  const holderName = text(d.holderName, 120);
  const holderEmail = text(d.holderEmail, 160).toLowerCase();
  const scope = text(d.scope, 1000);
  const permissions = Array.isArray(d.permissions) ? [...new Set(d.permissions.map((p: unknown) => text(p, 40).toUpperCase()))] : [];
  const expiresMs = Date.parse(text(d.expiresOn, 20));
  const documentUrl = text(d.documentUrl, 600);
  if (!(AUTHORITY_TYPES as readonly string[]).includes(type)) throw new HttpsError("invalid-argument", "Choose Power of Attorney or management agreement. / اختر وكالة أو اتفاقية إدارة.");
  if (!holderName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(holderEmail)) throw new HttpsError("invalid-argument", "Holder name and a valid email are required. / الاسم والبريد الصحيح مطلوبان.");
  if (scope.length < 5) throw new HttpsError("invalid-argument", "Describe the scope. / صف النطاق.");
  if (!permissions.length || permissions.some((p) => !(PERMISSIONS as readonly string[]).includes(p as string))) throw new HttpsError("invalid-argument", "Choose valid permissions. / اختر صلاحيات صحيحة.");
  if (!Number.isFinite(expiresMs) || expiresMs <= Date.now() || expiresMs > Date.now() + MAX_YEARS * 365 * 864e5) throw new HttpsError("invalid-argument", "Expiry must be a future date within 10 years. / يجب أن يكون الانتهاء تاريخاً مستقبلياً خلال 10 سنوات.");
  if (documentUrl && !/^https:\/\/firebasestorage\.googleapis\.com\//.test(documentUrl)) throw new HttpsError("invalid-argument", "Document must be an uploaded file. / يجب أن يكون المستند ملفاً مرفوعاً.");
  const ref = db.collection("owner_authorities").doc();
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.create(ref, { ownerId, type, holderName, holderEmail, scope, permissions, documentUrl: documentUrl || null, expiresAt: Timestamp.fromMillis(expiresMs), status: "ACTIVE", legalValidityVerified: false, createdAt: now, updatedAt: now });
  batch.create(db.collection("owner_authority_events").doc(), { ownerId, authorityId: ref.id, event: "GRANTED", holderEmail, permissions, createdAt: now });
  batch.create(db.collection("audit_logs").doc(), { action: "OWNER_GRANTED_AUTHORITY", actorId: ownerId, actorRole: "owner", targetOwnerId: ownerId, targetType: "owner_authorities", targetId: ref.id, createdAt: now });
  await batch.commit();
  return { status: "SUCCESS", authorityId: ref.id };
});

export const ownerRevokeAuthority = onCall(OPTS, async (request) => {
  const ownerId = await ownerGate(request.auth as never);
  const db = admin.firestore();
  const id = text(request.data?.authorityId, 160);
  const reason = text(request.data?.reason, 500);
  if (!id) throw new HttpsError("invalid-argument", "authorityId required. / المعرف مطلوب.");
  const ref = db.doc(`owner_authorities/${id}`);
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists || s.data()?.ownerId !== ownerId) throw new HttpsError("not-found", "Not found. / غير موجود.");
    if (s.data()?.status === "REVOKED") return;
    const now = FieldValue.serverTimestamp();
    tx.update(ref, { status: "REVOKED", revokedAt: now, revokeReason: reason, updatedAt: now });
    tx.create(db.collection("owner_authority_events").doc(), { ownerId, authorityId: id, event: "REVOKED", reason, createdAt: now });
    tx.create(db.collection("audit_logs").doc(), { action: "OWNER_REVOKED_AUTHORITY", actorId: ownerId, actorRole: "owner", targetOwnerId: ownerId, targetType: "owner_authorities", targetId: id, createdAt: now });
  });
  return { status: "SUCCESS" };
});

export const getOwnerAuthorityRegister = onCall(OPTS, async (request) => {
  const ownerId = await ownerGate(request.auth as never);
  const db = admin.firestore();
  const [a, e] = await Promise.all([
    db.collection("owner_authorities").where("ownerId", "==", ownerId).limit(100).get(),
    db.collection("owner_authority_events").where("ownerId", "==", ownerId).limit(300).get(),
  ]);
  const ms = (t: unknown) => (t && typeof (t as Timestamp).toMillis === "function" ? (t as Timestamp).toMillis() : null);
  return {
    authorities: a.docs.map((d) => {
      const x = d.data();
      return { id: d.id, type: x.type, holderName: x.holderName, holderEmail: x.holderEmail, scope: x.scope, permissions: x.permissions, expiresAtMs: ms(x.expiresAt), state: authorityState(x), hasDocument: !!x.documentUrl };
    }),
    history: e.docs.map((d) => ({ id: d.id, authorityId: d.data().authorityId, event: d.data().event, atMs: ms(d.data().createdAt) })).sort((x, y) => (y.atMs || 0) - (x.atMs || 0)),
  };
});
