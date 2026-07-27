import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  buildFounderVerifiedPropertyGeo,
  hasDispatchReadyPropertyGeo,
  PropertyGeoAuthorityError,
} from "./propertyGeoAuthority";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const CANONICAL_FOUNDER_EMAIL = "ceo@bin-groups.com";
const FOUNDER_ROLES = new Set(["ceo", "super_admin"]);
const REVIEWABLE_STATUSES = new Set([
  "pending",
  "pending_approval",
  "pending_review",
  "pending_admin_approval",
  "pending_admin_review",
  "onboarding",
  "submitted",
  "draft",
  "admin_review",
]);
const APPROVED_STATUSES = new Set(["approved", "active"]);

const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const lower = (value: unknown, max = 500) => text(value, max).toLowerCase();
const normalizedStatus = (value: unknown) => lower(value, 80).replace(/[\s-]+/g, "_");

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

const geoError = (error: unknown) => {
  if (error instanceof PropertyGeoAuthorityError) {
    return new HttpsError("failed-precondition", error.message);
  }
  return error;
};

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
      const status = normalizedStatus(property.status || property.approvalStatus || property.onboardingStatus);
      const pendingReview = REVIEWABLE_STATUSES.has(status);
      const approvedLegacy = APPROVED_STATUSES.has(status);
      const alreadyVerified = hasDispatchReadyPropertyGeo(property);
      const geoOnlyReview = decision === "APPROVE" && approvedLegacy && !alreadyVerified;

      if (!pendingReview && !geoOnlyReview) {
        throw new HttpsError("failed-precondition", "Property is no longer eligible for this Founder review decision.");
      }
      if (decision === "REJECT" && approvedLegacy) {
        throw new HttpsError("failed-precondition", "An approved property cannot be rejected through geo re-verification.");
      }

      const propertyName = text(property.name || property.propertyName || property.address, 240) || "Property";
      const recipientId = text(property.ownerId || property.ownerUid, 240);
      const nextStatus = decision === "APPROVE"
        ? approvedLegacy ? text(property.status, 80) || "APPROVED" : "APPROVED"
        : "REJECTED";
      const update: Record<string, unknown> = {
        status: nextStatus,
        approvalStatus: decision === "APPROVE" ? "APPROVED" : "REJECTED",
        updatedAt: now,
        reviewedAt: now,
        reviewedBy: actor.uid,
        reviewedByRole: actor.role,
      };
      let geoDispatchReady = false;
      let auditAction = decision === "APPROVE" ? "APPROVE_PROPERTY" : "REJECT_PROPERTY";

      if (decision === "APPROVE") {
        try {
          const canonical = buildFounderVerifiedPropertyGeo(property, actor.uid, now);
          update.geo = canonical.geo;
          update.geoVerification = canonical.geoVerification;
          update.geoAnchor = FieldValue.delete();
          update.verifiedGeo = FieldValue.delete();
          update.verified = true;
          update.verifiedBy = actor.uid;
          update.verifiedAt = now;
          update.dispatchReady = true;
          update.requiresGeoReview = false;
          update.geoReviewStatus = "VERIFIED";
          update.geoVerifiedAt = now;
          update.geoVerifiedBy = actor.uid;
          geoDispatchReady = true;
        } catch (error) {
          throw geoError(error);
        }
        update.approvedAt = approvedLegacy ? property.approvedAt || now : now;
        update.approvedBy = approvedLegacy ? property.approvedBy || actor.uid : actor.uid;
        update.rejectionReason = FieldValue.delete();
        if (geoOnlyReview) auditAction = "VERIFY_PROPERTY_GEO";
      } else {
        update.rejectedAt = now;
        update.rejectedBy = actor.uid;
        update.rejectionReason = rejectionReason;
      }
      transaction.update(propertyRef, update);

      transaction.set(auditRef, {
        actorId: actor.uid,
        actorRole: actor.role,
        action: auditAction,
        targetType: "PROPERTY",
        targetId: propertyId,
        before: {
          status: property.status || null,
          geoDispatchReady: alreadyVerified,
        },
        after: {
          status: nextStatus,
          reason: decision === "REJECT" ? rejectionReason : null,
          geoDispatchReady,
        },
        metadata: { propertyName, geoOnlyReview },
        source: "ADMIN_REVIEW_OWNER_PROPERTY_CALLABLE",
        trustLevel: "SERVER_AUTHORITATIVE",
        createdAt: now,
      });

      if (recipientId) {
        const geoOnlyMessage = geoOnlyReview;
        transaction.set(notificationRef, {
          recipientId,
          userId: recipientId,
          recipientRole: "owner",
          toRole: "owner",
          title: decision === "APPROVE"
            ? geoOnlyMessage ? "PROPERTY LOCATION VERIFIED" : "PROPERTY APPROVED"
            : "PROPERTY REJECTED",
          body: decision === "APPROVE"
            ? geoOnlyMessage
              ? `The dispatch location for "${propertyName}" has been verified by BIN GROUP.`
              : `Your property "${propertyName}" has been approved by BIN GROUP.`
            : `Your property "${propertyName}" was rejected. Reason: ${rejectionReason}`,
          read: false,
          type: decision === "APPROVE"
            ? geoOnlyMessage ? "PROPERTY_GEO_VERIFIED" : "PROPERTY_APPROVAL"
            : "PROPERTY_REJECTION",
          link: "/owner/properties",
          source: "ADMIN_REVIEW_OWNER_PROPERTY_CALLABLE",
          createdAt: now,
        });
      }

      return {
        propertyName,
        nextStatus,
        notificationCreated: Boolean(recipientId),
        geoDispatchReady,
        geoOnlyReview,
      };
    });

    return {
      success: true,
      propertyId,
      status: result.nextStatus,
      notificationCreated: result.notificationCreated,
      geoDispatchReady: result.geoDispatchReady,
      geoOnlyReview: result.geoOnlyReview,
      hardLaunchClaim: false,
    };
  },
);
