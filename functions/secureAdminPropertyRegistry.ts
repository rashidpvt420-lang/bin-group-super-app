import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "operations_admin", "operations_manager"]);
const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const roleOf = (token: any) => text(token?.role || token?.userRole || token?.primaryRole, 80).toLowerCase();
const secondFactorOf = (token: any) => text(token?.firebase?.sign_in_second_factor || token?.sign_in_second_factor, 120);
const integer = (value: unknown, max: number) => {
  const n = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
};

async function requireMfaAdmin(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const token = auth.token || {};
  const role = roleOf(token);
  const hasAdmin =
    token.admin === true ||
    token.isAdmin === true ||
    token.super_admin === true ||
    token.superAdmin === true ||
    token.ceo === true ||
    ADMIN_ROLES.has(role);
  if (!hasAdmin || token.suspended === true) {
    throw new HttpsError("permission-denied", "Approved Admin authority is required.");
  }

  const [userRecord, profileSnap] = await Promise.all([
    admin.auth().getUser(auth.uid),
    db.collection("users").doc(auth.uid).get(),
  ]);
  const profile = profileSnap.data() || {};
  if (
    userRecord.disabled ||
    profile.suspended === true ||
    ["suspended", "disabled", "rejected", "inactive"].includes(text(profile.status, 80).toLowerCase())
  ) {
    throw new HttpsError("permission-denied", "This Admin account is not active.");
  }
  if ((userRecord.multiFactor?.enrolledFactors || []).length <= 0 || !secondFactorOf(token)) {
    throw new HttpsError("permission-denied", "A verified Admin MFA session is required.");
  }
  return { uid: auth.uid, role: role || "admin", email: userRecord.email || null };
}

function candidatePayload(data: any) {
  const name = text(data?.name, 180);
  const propertyType = text(data?.propertyType, 80);
  const address = text(data?.address, 500);
  const ownerId = text(data?.ownerId, 180);
  const emirate = text(data?.emirate, 120);
  const serviceZone = text(data?.serviceZone, 180);
  const lat = Number(data?.lat);
  const lng = Number(data?.lng);

  if (!name || !address || !ownerId || !emirate) {
    throw new HttpsError("invalid-argument", "Property name, address, owner and emirate are required.");
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) {
    throw new HttpsError("invalid-argument", "A valid non-zero latitude and longitude are required.");
  }

  return {
    companyId: "BIN_GROUP",
    name,
    propertyName: name,
    propertyType,
    address,
    addressLine: address,
    submittedGeo: {
      lat,
      lng,
      address,
      emirate,
      city: serviceZone || emirate,
      area: serviceZone || emirate,
      source: "admin_asset_registry_candidate",
      submittedSource: "admin_asset_registry_candidate",
      verified: false,
      verifiedBy: null,
      verifiedAt: null,
      dispatchReady: false,
      requiresGeoReview: true,
    },
    ownerId,
    emirate,
    city: serviceZone || emirate,
    area: serviceZone || emirate,
    serviceZone,
    unitsCount: integer(data?.unitsCount, 10000),
    floorsCount: integer(data?.floorsCount, 1000),
  };
}

export const adminUpsertPropertyCandidate = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actor = await requireMfaAdmin(request.auth);
    const requestedId = text(request.data?.propertyId, 180);
    if (requestedId && !/^[A-Za-z0-9_-]{1,180}$/.test(requestedId)) {
      throw new HttpsError("invalid-argument", "Invalid propertyId.");
    }
    const payload = candidatePayload(request.data || {});
    const ref = requestedId ? db.collection("properties").doc(requestedId) : db.collection("properties").doc();
    const now = FieldValue.serverTimestamp();

    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (requestedId && !snap.exists) throw new HttpsError("not-found", "Property not found.");
      const before = snap.data() || {};
      const status = text(before.status || before.lifecycleStatus || before.activationStatus, 100).toUpperCase();
      if (requestedId && ["ACTIVE", "ACTIVATED"].includes(status)) {
        throw new HttpsError("failed-precondition", "Active properties must be changed through the controlled lifecycle workflow.");
      }
      if (before.geo?.verified === true || before.geoVerification?.verified === true) {
        throw new HttpsError("failed-precondition", "Verified canonical property location cannot be edited from Asset Registry.");
      }

      transaction.set(ref, {
        ...payload,
        ...(snap.exists ? {} : { status: "PENDING_REVIEW", createdAt: now }),
        updatedAt: now,
      }, { merge: true });
      transaction.create(db.collection("audit_logs").doc(), {
        action: snap.exists ? "ADMIN_UPDATE_PROPERTY_CANDIDATE" : "ADMIN_CREATE_PROPERTY_CANDIDATE",
        actorId: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        targetType: "properties",
        targetId: ref.id,
        before: snap.exists ? { status: status || "UNKNOWN", ownerId: text(before.ownerId, 180) } : null,
        after: { status: snap.exists ? status || "PENDING_REVIEW" : "PENDING_REVIEW", ownerId: payload.ownerId },
        canonicalGeoChanged: false,
        submittedGeoVerified: false,
        mfaVerified: true,
        createdAt: now,
      });
    });

    return { status: "SUCCESS", propertyId: ref.id };
  },
);

export const adminDeletePropertyCandidate = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actor = await requireMfaAdmin(request.auth);
    const propertyId = text(request.data?.propertyId, 180);
    if (!propertyId || !/^[A-Za-z0-9_-]{1,180}$/.test(propertyId)) {
      throw new HttpsError("invalid-argument", "A valid propertyId is required.");
    }

    const ref = db.collection("properties").doc(propertyId);
    const [snap, units, contracts, tickets] = await Promise.all([
      ref.get(),
      db.collection("units").where("propertyId", "==", propertyId).limit(1).get(),
      db.collection("contracts").where("propertyId", "==", propertyId).limit(1).get(),
      db.collection("maintenanceTickets").where("propertyId", "==", propertyId).limit(1).get(),
    ]);
    if (!snap.exists) throw new HttpsError("not-found", "Property not found.");
    const data = snap.data() || {};
    const status = text(data.status || data.lifecycleStatus || data.activationStatus, 100).toUpperCase();
    if (["ACTIVE", "ACTIVATED", "UNDER_REVIEW", "APPROVED"].includes(status)) {
      throw new HttpsError("failed-precondition", "Only non-active review candidates can be deleted.");
    }
    if (!units.empty || !contracts.empty || !tickets.empty) {
      throw new HttpsError("failed-precondition", "Property has dependent records and cannot be hard-deleted.");
    }

    const now = FieldValue.serverTimestamp();
    await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(ref);
      if (!fresh.exists) return;
      transaction.delete(ref);
      transaction.create(db.collection("audit_logs").doc(), {
        action: "ADMIN_DELETE_PROPERTY_CANDIDATE",
        actorId: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        targetType: "properties",
        targetId: propertyId,
        before: { status, ownerId: text(data.ownerId, 180), name: text(data.name || data.propertyName, 180) },
        mfaVerified: true,
        reason: "UNUSED_REVIEW_CANDIDATE",
        createdAt: now,
      });
    });

    return { status: "SUCCESS", propertyId };
  },
);
