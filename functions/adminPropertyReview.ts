import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const CANONICAL_FOUNDER_EMAIL = "ceo@bin-groups.com";
const FOUNDER_ROLES = new Set(["ceo", "super_admin"]);
const REVIEWABLE_STATUSES = new Set([
  "pending",
  "pending_approval",
  "pending-review",
  "pending_review",
  "onboarding",
  "submitted",
  "draft",
  "pending review",
  "admin review",
]);

const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const lower = (value: unknown, max = 500) => text(value, max).toLowerCase();
const finite = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function canonicalVerifiedGeo(property: Record<string, any>, actorUid: string, now: unknown) {
  const candidate = property.submittedGeo || property.geo || property.location;
  if (!candidate || typeof candidate !== "object") {
    throw new HttpsError("failed-precondition", "A reviewed property location is required before approval.");
  }
  const lat = finite(candidate.lat ?? candidate.latitude);
  const lng = finite(candidate.lng ?? candidate.longitude);
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) {
    throw new HttpsError("failed-precondition", "The submitted property coordinates are invalid.");
  }
  const address = text(candidate.address || property.address, 500);
  const emirate = text(candidate.emirate || property.emirate, 120);
  const city = text(candidate.city || property.city, 120);
  const area = text(candidate.area || property.area, 160);
  if (!address || !emirate || (!city && !area)) {
    throw new HttpsError("failed-precondition", "Address, emirate, and city or area are required before geo verification.");
  }
  const accuracy = finite(candidate.accuracyMeters);
  return {
    point: new admin.firestore.GeoPoint(lat, lng),
    lat,
    lng,
    geohash: text(candidate.geohash, 120),
    address,
    emirate,
    city,
    area,
    placeId: text(candidate.placeId || property.googlePlaceId, 240) || null,
    source: "admin_manual",
    submittedSource: text(candidate.source, 80) || "owner_submission",
    verified: true,
    verifiedBy: actorUid,
    verifiedAt: now,
    updatedAt: now,
    requiresGeoReview: false,
    dispatchReady: true,
    accuracyMeters: accuracy === null ? null : Math.max(0, accuracy),
    capturedAt: candidate.capturedAt || now,
    verificationVersion: 1,
  };
}

function roleOf(token: Record<string, unknown> = {}) {
  const role = lower(token.role || token.userRole || token.primaryRole, 80);
  if (role) return role;
  if (token.ceo === true) return "ceo";
  if (token.super_admin === true || token.superAdmin === true) return "super_admin";
  return "";
}

async function requireVerifiedFounderSession(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Founder authentication is required.");
  const token = auth.token || {};
  if (lower(token.email, 320) !== CANONICAL_FOUNDER_EMAIL || !FOUNDER_ROLES.has(roleOf(token))) {
    throw new HttpsError("permission-denied", "The canonical BIN GROUP founder account is required.");
  }
  if (token.email_verified !== true) {
    throw new HttpsError("permission-denied", "Verified founder email is required.");
  }
  if (!token.firebase?.sign_in_second_factor) {
    throw new HttpsError("permission-denied", "A verified founder MFA session is required.");
  }
  const user = await admin.auth().getUser(auth.uid);
  if (user.disabled || !user.emailVerified || lower(user.email, 320) !== CANONICAL_FOUNDER_EMAIL) {
    throw new HttpsError("permission-denied", "The canonical founder account is not active and verified.");
  }
  return { uid: auth.uid, role: roleOf(token) };
}

export const adminReviewOwnerProperty = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actor = await requireVerifiedFounderSession(request.auth);
    const propertyId = text(request.data?.propertyId, 240);
    const decision = text(request.data?.decision, 20).toUpperCase();
    const rejectionReason = text(request.data?.reason, 1000);

    if (!propertyId) throw new HttpsError("invalid-argument", "propertyId is required.");
    if (!new Set(["APPROVE", "REJECT"]).has(decision)) {
      throw new HttpsError("invalid-argument", "decision must be APPROVE or REJECT.");
    }
    if (decision === "REJECT" && rejectionReason.length < 8) {
      throw new HttpsError("invalid-argument", "A clear rejection reason of at least 8 characters is required.");
    }

    const propertyRef = db.collection("properties").doc(propertyId);
    const auditRef = db.collection("audit_logs").doc();
    const notificationRef = db.collection("notifications").doc();
    const now = FieldValue.serverTimestamp();

    const result = await db.runTransaction(async (transaction) => {
      const propertySnap = await transaction.get(propertyRef);
      if (!propertySnap.exists) throw new HttpsError("not-found", "Property not found.");
      const property = propertySnap.data() || {};
      const currentStatus = lower(property.status, 80);
      if (!REVIEWABLE_STATUSES.has(currentStatus)) {
        throw new HttpsError("failed-precondition", "Property is no longer pending founder review.");
      }

      const propertyName = text(property.name || property.propertyName || property.address, 240) || "Property";
      const recipientId = text(property.ownerId || property.ownerUid, 240);
      const nextStatus = decision === "APPROVE" ? "APPROVED" : "REJECTED";
      const update: Record<string, unknown> = {
        status: nextStatus,
        updatedAt: now,
        reviewedAt: now,
        reviewedBy: actor.uid,
        reviewedByRole: actor.role,
      };
      let geoDispatchReady = false;
      if (decision === "APPROVE") {
        const canonicalGeo = canonicalVerifiedGeo(property, actor.uid, now);
        update.approvedAt = now;
        update.approvedBy = actor.uid;
        update.rejectionReason = FieldValue.delete();
        update.geo = canonicalGeo;
        update.geoVerification = {
          state: "VERIFIED",
          source: "FOUNDER_MFA_REVIEW",
          verifiedBy: actor.uid,
          verifiedAt: now,
          submittedSource: canonicalGeo.submittedSource,
          verificationVersion: 1,
        };
        geoDispatchReady = true;
      } else {
        update.rejectedAt = now;
        update.rejectedBy = actor.uid;
        update.rejectionReason = rejectionReason;
      }
      transaction.update(propertyRef, update);

      transaction.set(auditRef, {
        actorId: actor.uid,
        actorRole: actor.role,
        action: decision === "APPROVE" ? "APPROVE_PROPERTY" : "REJECT_PROPERTY",
        targetType: "PROPERTY",
        targetId: propertyId,
        before: { status: property.status || null },
        after: {
          status: nextStatus,
          reason: decision === "REJECT" ? rejectionReason : null,
          geoDispatchReady,
        },
        metadata: { propertyName },
        source: "ADMIN_REVIEW_OWNER_PROPERTY_CALLABLE",
        trustLevel: "SERVER_AUTHORITATIVE",
        createdAt: now,
      });

      if (recipientId) {
        transaction.set(notificationRef, {
          recipientId,
          userId: recipientId,
          recipientRole: "owner",
          toRole: "owner",
          title: decision === "APPROVE" ? "PROPERTY APPROVED" : "PROPERTY REJECTED",
          body: decision === "APPROVE"
            ? `Your property "${propertyName}" has been approved by BIN GROUP.`
            : `Your property "${propertyName}" was rejected. Reason: ${rejectionReason}`,
          read: false,
          type: decision === "APPROVE" ? "PROPERTY_APPROVAL" : "PROPERTY_REJECTION",
          link: "/owner/properties",
          source: "ADMIN_REVIEW_OWNER_PROPERTY_CALLABLE",
          createdAt: now,
        });
      }

      return { propertyName, nextStatus, notificationCreated: Boolean(recipientId), geoDispatchReady };
    });

    return {
      success: true,
      propertyId,
      status: result.nextStatus,
      notificationCreated: result.notificationCreated,
      geoDispatchReady: result.geoDispatchReady,
      hardLaunchClaim: false,
    };
  },
);
