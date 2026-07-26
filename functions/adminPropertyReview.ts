import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const REVIEW_ROLES = new Set([
  "admin",
  "super_admin",
  "ceo",
  "manager",
  "operations_admin",
  "account_manager",
]);
const REVIEWABLE_STATUSES = new Set([
  "pending",
  "pending_approval",
  "pending-review",
  "pending_review",
  "onboarding",
]);

const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const lower = (value: unknown, max = 500) => text(value, max).toLowerCase();

function roleOf(token: Record<string, unknown> = {}) {
  const role = lower(token.role || token.userRole || token.primaryRole, 80);
  if (role) return role;
  if (token.ceo === true) return "ceo";
  if (token.super_admin === true || token.superAdmin === true) return "super_admin";
  if (token.admin === true || token.isAdmin === true) return "admin";
  return "";
}

async function requireVerifiedPrivilegedSession(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin authentication is required.");
  const token = auth.token || {};
  const role = roleOf(token);
  const privileged = token.admin === true || token.isAdmin === true || token.superAdmin === true || token.ceo === true || REVIEW_ROLES.has(role);
  if (!privileged || token.suspended === true) {
    throw new HttpsError("permission-denied", "Privileged Owner/property review authority is required.");
  }
  if (token.email_verified !== true) {
    throw new HttpsError("permission-denied", "A verified Admin email is required.");
  }
  if (!token.firebase?.sign_in_second_factor) {
    throw new HttpsError("permission-denied", "A verified Admin MFA session is required.");
  }

  const user = await admin.auth().getUser(auth.uid);
  if (user.disabled || !user.emailVerified || !user.email) {
    throw new HttpsError("permission-denied", "The Admin account is not active and verified.");
  }
  return { uid: auth.uid, role, email: lower(user.email, 320) };
}

export const adminReviewOwnerProperty = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actor = await requireVerifiedPrivilegedSession(request.auth);
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
        throw new HttpsError("failed-precondition", "Property is no longer pending Admin review.");
      }

      const propertyName = text(property.name || property.propertyName || property.address, 240) || "Property";
      const recipientId = text(property.ownerId || property.ownerUid, 240);
      const nextStatus = decision === "APPROVE" ? "APPROVED" : "REJECTED";
      const update: Record<string, unknown> = {
        status: nextStatus,
        updatedAt: now,
        reviewedAt: now,
        reviewedBy: actor.uid,
        reviewedByEmail: actor.email,
        reviewedByRole: actor.role,
      };
      if (decision === "APPROVE") {
        update.approvedAt = now;
        update.approvedBy = actor.uid;
        update.rejectionReason = FieldValue.delete();
      } else {
        update.rejectedAt = now;
        update.rejectedBy = actor.uid;
        update.rejectionReason = rejectionReason;
      }
      transaction.update(propertyRef, update);

      transaction.set(auditRef, {
        actorId: actor.uid,
        actorEmail: actor.email,
        actorRole: actor.role,
        action: decision === "APPROVE" ? "APPROVE_PROPERTY" : "REJECT_PROPERTY",
        targetType: "PROPERTY",
        targetId: propertyId,
        before: { status: property.status || null },
        after: { status: nextStatus, reason: decision === "REJECT" ? rejectionReason : null },
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

      return { nextStatus, notificationCreated: Boolean(recipientId) };
    });

    return {
      success: true,
      propertyId,
      status: result.nextStatus,
      notificationCreated: result.notificationCreated,
      hardLaunchClaim: false,
    };
  },
);
