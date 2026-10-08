import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

function clean(value: unknown, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}

export const confirmTenantParcelCollection = onCall(
  { cors: true, enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Tenant authentication is required.");
    }

    const parcelId = clean(request.data?.parcelId, 180);
    if (!parcelId || parcelId.includes("/") || parcelId === "." || parcelId === "..") {
      throw new HttpsError("invalid-argument", "A valid parcel ID is required.");
    }

    const parcelRef = db.collection("parcels").doc(parcelId);
    const auditRef = db.collection("audit_logs").doc();

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(parcelRef);
      if (!snap.exists) {
        throw new HttpsError("not-found", "Parcel record not found.");
      }

      const parcel = snap.data() || {};
      const tenantUid = clean(parcel.tenantUid || parcel.tenantId, 180);
      if (!tenantUid || tenantUid !== request.auth?.uid) {
        throw new HttpsError("permission-denied", "This parcel is not assigned to the signed-in Tenant.");
      }

      const currentStatus = clean(parcel.status, 60).toLowerCase();
      if (currentStatus === "collected") return;
      if (!["received", "notified"].includes(currentStatus)) {
        throw new HttpsError("failed-precondition", "Only received parcels can be confirmed as collected.");
      }

      const now = FieldValue.serverTimestamp();
      const actorLabel =
        clean(request.auth?.token?.name, 180) ||
        clean(request.auth?.token?.email, 320) ||
        "Tenant";

      tx.set(parcelRef, {
        status: "collected",
        collectedBy: actorLabel,
        collectedByUid: request.auth.uid,
        collectedAt: now,
        updatedAt: now,
      }, { merge: true });

      tx.create(auditRef, {
        action: "TENANT_PARCEL_COLLECTION_CONFIRMED",
        actorId: request.auth.uid,
        actorRole: "tenant",
        targetType: "parcels",
        targetId: parcelId,
        propertyId: clean(parcel.propertyId, 180) || null,
        unitId: clean(parcel.unitId, 180) || null,
        serverAuthoritative: true,
        createdAt: now,
      });
    });

    return { success: true, parcelId };
  },
);
