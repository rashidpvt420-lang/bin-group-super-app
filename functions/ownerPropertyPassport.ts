/**
 * Owner Trust Centre — Property Passport (gap audit 2026-11-01, item 4).
 *
 * Owner-scoped asset register: each asset has serial number, warranty expiry, room, room photos
 * (Firebase Storage URLs only) and a stable QR link. The passport view links the owner's
 * inspections for the same properties. All writes go through this callable after a property
 * ownership check; clients cannot write `property_assets` directly.
 */
import { randomBytes } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
export const MAX_PHOTOS = 6;
export const WARRANTY_SOON_DAYS = 60;
const DAY = 86_400_000;
const text = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const ymdOk = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const safeId = (v: unknown, f: string) => {
  const s = text(v, 180);
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(s)) throw new HttpsError("invalid-argument", `A valid ${f} is required. / ${f} غير صالح.`);
  return s;
};
export const dubaiToday = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const PHOTO_RE = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/[A-Za-z0-9._-]+\/o\/[^\s]+$/;
export const CATEGORIES = ["HVAC", "PLUMBING", "ELECTRICAL", "APPLIANCE", "FIXTURE", "SAFETY", "OTHER"];

export function cleanPhotos(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > MAX_PHOTOS) throw new HttpsError("invalid-argument", `Up to ${MAX_PHOTOS} photos. / حتى ${MAX_PHOTOS} صور.`);
  return raw.map((u) => {
    const s = text(u, 1000);
    if (!PHOTO_RE.test(s)) throw new HttpsError("invalid-argument", "Photos must be uploaded to BIN storage. / يجب رفع الصور إلى تخزين BIN.");
    return s;
  });
}

export function warrantyState(expiry: unknown, today: string) {
  const e = text(expiry, 10);
  if (!ymdOk(e)) return { state: "NOT_RECORDED", expiry: null as string | null, daysLeft: null as number | null };
  const d = Math.round((Date.parse(`${e}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
  return { state: d < 0 ? "EXPIRED" : d <= WARRANTY_SOON_DAYS ? "EXPIRING" : "ACTIVE", expiry: e, daysLeft: d };
}

async function requireOwner(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in required. / يلزم تسجيل الدخول.");
  const role = text(auth.token?.role || auth.token?.userRole, 40).toLowerCase();
  if (role !== "owner" || auth.token?.suspended === true) throw new HttpsError("permission-denied", "Owner access only. / للمالك فقط.");
  const prof = await admin.firestore().doc(`users/${auth.uid}`).get();
  if (prof.data()?.suspended === true) throw new HttpsError("permission-denied", "Account suspended. / الحساب موقوف.");
  return auth.uid as string;
}
const ownsProperty = (p: any, uid: string) => !!p && (p.ownerId === uid || p.ownerUid === uid);

export const ownerUpsertPropertyAsset = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const uid = await requireOwner(request.auth);
  const db = admin.firestore();
  const d = request.data || {};
  const propertyId = safeId(d.propertyId, "propertyId");
  const name = text(d.name, 120);
  if (!name) throw new HttpsError("invalid-argument", "Asset name is required. / اسم الأصل مطلوب.");
  const category = text(d.category, 20).toUpperCase() || "OTHER";
  if (!CATEGORIES.includes(category)) throw new HttpsError("invalid-argument", "Unknown category. / فئة غير معروفة.");
  const warrantyExpiry = text(d.warrantyExpiry, 10) || null;
  if (warrantyExpiry && !ymdOk(warrantyExpiry)) throw new HttpsError("invalid-argument", "Warranty expiry must be YYYY-MM-DD. / تاريخ غير صالح.");
  const fields = {
    propertyId, unitId: text(d.unitId, 160) || null, name, category,
    serialNumber: text(d.serialNumber, 120) || null, warrantyExpiry, room: text(d.room, 80) || null,
    photoUrls: cleanPhotos(d.photoUrls), notes: text(d.notes, 500) || null,
  };
  const prop = await db.doc(`properties/${propertyId}`).get();
  if (!ownsProperty(prop.data(), uid)) throw new HttpsError("permission-denied", "Not your property. / ليس عقارك.");
  const now = FieldValue.serverTimestamp();
  if (d.assetId) {
    const assetId = safeId(d.assetId, "assetId");
    const ref = db.doc(`property_assets/${assetId}`);
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.data()?.ownerId !== uid) throw new HttpsError("not-found", "Asset not found. / الأصل غير موجود.");
      tx.update(ref, { ...fields, updatedAt: now });
      tx.create(db.collection("audit_logs").doc(), { action: "OWNER_UPDATE_PROPERTY_ASSET", actorId: uid, targetType: "property_assets", targetId: assetId, createdAt: now });
    });
    return { status: "SUCCESS", assetId };
  }
  const ref = db.collection("property_assets").doc();
  const batch = db.batch();
  batch.create(ref, { ...fields, ownerId: uid, qrToken: randomBytes(12).toString("hex"), createdAt: now, updatedAt: now });
  batch.create(db.collection("audit_logs").doc(), { action: "OWNER_CREATE_PROPERTY_ASSET", actorId: uid, targetType: "property_assets", targetId: ref.id, createdAt: now });
  await batch.commit();
  return { status: "SUCCESS", assetId: ref.id };
});

export const getOwnerPropertyPassport = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const uid = await requireOwner(request.auth);
  const db = admin.firestore();
  const today = dubaiToday();
  const [byOwnerId, byOwnerUid, assetsSnap] = await Promise.all([
    db.collection("properties").where("ownerId", "==", uid).limit(100).get(),
    db.collection("properties").where("ownerUid", "==", uid).limit(100).get(),
    db.collection("property_assets").where("ownerId", "==", uid).limit(500).get(),
  ]);
  const props = new Map<string, string>();
  for (const p of [...byOwnerId.docs, ...byOwnerUid.docs]) props.set(p.id, text(p.data().name || p.data().title || p.data().address, 160) || p.id);
  const assets = assetsSnap.docs
    .filter((a) => props.has(text(a.data().propertyId, 180)))
    .map((a) => {
      const x = a.data();
      return { assetId: a.id, propertyId: x.propertyId, unitId: x.unitId || null, name: x.name, category: x.category, serialNumber: x.serialNumber || null,
        room: x.room || null, photoUrls: Array.isArray(x.photoUrls) ? x.photoUrls : [], qrPath: `/owner?asset=${a.id}`, warranty: warrantyState(x.warrantyExpiry, today) };
    });
  const inspections: any[] = [];
  for (const pid of props.keys()) {
    const s = await db.collection("inspections").where("propertyId", "==", pid).limit(20).get();
    for (const i of s.docs) {
      const x = i.data();
      inspections.push({ inspectionId: i.id, propertyId: pid, type: text(x.type || x.inspectionType, 60) || null, status: text(x.status, 60) || null });
    }
  }
  return { properties: [...props].map(([propertyId, label]) => ({ propertyId, label })), assets, inspections };
});
