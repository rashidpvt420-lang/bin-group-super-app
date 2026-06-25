import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function asObject(value: any, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", `${label} is required.`);
  }
  return value;
}

function timestampToMillis(value: any) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function serialize(value: any): any {
  if (value === undefined || value === null) return null;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === "object") {
    const out: Record<string, any> = {};
    Object.entries(value).forEach(([key, entry]) => {
      if (typeof entry !== "function") out[key] = serialize(entry);
    });
    return out;
  }
  return value;
}

function ownerMatches(doc: any, uid: string, email: string) {
  return doc.ownerId === uid || doc.ownerUid === uid || doc.userId === uid || normalizeEmail(doc.ownerEmail) === email;
}

async function loadOwnerInspection(id: string, uid: string, email: string) {
  const ref = db.collection("propertyInspections").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Inspection not found.");
  const data = snap.data() || {};
  if (!ownerMatches(data, uid, email)) {
    throw new HttpsError("permission-denied", "This inspection is not linked to this owner.");
  }
  return { ref, data };
}

export const listOwnerHandoverInspections = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
  const uid = request.auth.uid;
  const email = normalizeEmail(request.auth.token?.email);
  const byId = new Map<string, any>();

  const queries = [
    db.collection("propertyInspections").where("ownerId", "==", uid).limit(100),
    db.collection("propertyInspections").where("ownerUid", "==", uid).limit(100),
  ];
  if (email) queries.push(db.collection("propertyInspections").where("ownerEmail", "==", email).limit(100));

  const snapshots = await Promise.all(queries.map((query) => query.get()));
  snapshots.forEach((snap) => {
    snap.docs.forEach((doc) => {
      const data = doc.data();
      if (ownerMatches(data, uid, email)) byId.set(doc.id, { id: doc.id, ...serialize(data) });
    });
  });

  const inspections = Array.from(byId.values()).sort((a, b) => timestampToMillis(b.submittedAt || b.createdAt) - timestampToMillis(a.submittedAt || a.createdAt));
  return { inspections };
});

export const updateOwnerHandoverInspection = onCall({ cors: true }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");
  const uid = request.auth.uid;
  const email = normalizeEmail(request.auth.token?.email);
  const payload = asObject(request.data || {}, "Action payload");
  const inspectionId = String(payload.inspectionId || "").trim();
  const action = String(payload.action || "").trim().toUpperCase();

  if (!inspectionId) throw new HttpsError("invalid-argument", "inspectionId is required.");
  if (!["APPROVED", "REINSPECTION_REQUESTED", "SETTLEMENT_REQUESTED"].includes(action)) {
    throw new HttpsError("invalid-argument", "Unsupported owner handover action.");
  }

  const { ref, data } = await loadOwnerInspection(inspectionId, uid, email);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const update: Record<string, any> = {
    status: action,
    ownerAction: action,
    ownerActionAt: now,
    ownerActionBy: uid,
    ownerActionByEmail: email,
    updatedAt: now,
  };

  if (action === "APPROVED") {
    const type = String(data.inspectionType || data.type || "").toUpperCase().replace(/[\s-]+/g, "_");
    update.approvedByOwner = true;
    update.ownerApprovedAt = now;
    update.settlementStatus = type === "MOVE_OUT" ? "APPROVED_FOR_SETTLEMENT" : "NO_SETTLEMENT_REQUIRED";
  }
  if (action === "REINSPECTION_REQUESTED") {
    update.damageClaimStatus = "OWNER_REQUESTED_REINSPECTION";
    update.reinspectionRequestedAt = now;
  }
  if (action === "SETTLEMENT_REQUESTED") {
    update.settlementStatus = "OWNER_REQUESTED_SETTLEMENT";
    update.settlementRequestedAt = now;
    if (payload.settlementLedger && typeof payload.settlementLedger === "object") {
      update.settlementLedger = payload.settlementLedger;
    }
  }

  await ref.update(update);
  await db.collection("audit_logs").add({
    actorId: uid,
    actorRole: "owner",
    action: `OWNER_HANDOVER_${action}`,
    targetType: "propertyInspections",
    targetId: inspectionId,
    createdAt: now,
  });

  return { ok: true, inspectionId, action };
});
