import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "ceo",
  "manager",
  "operations_admin",
]);
const REVIEWABLE_STATUSES = new Set([
  "pending",
  "pending_approval",
  "onboarding",
]);

function text(value: unknown, maxLength = 240) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function roleOf(token: Record<string, unknown>) {
  return text(token.role || token.userRole || token.primaryRole, 80).toLowerCase();
}

function requireAdmin(token: Record<string, unknown>) {
  const role = roleOf(token);
  const authorized = token.admin === true || token.isAdmin === true || token.ceo === true || ADMIN_ROLES.has(role);
  if (!authorized) throw new HttpsError("permission-denied", "Admin property-review authority is required.");
  return role || "admin";
}

export const adminReviewProperty = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");

    const token = (request.auth.token || {}) as Record<string, unknown>;
    const actorRole = requireAdmin(token);
    const propertyId = text(request.data?.propertyId, 160);
    const decision = text(request.data?.decision, 20).toUpperCase();
    const reason = text(request.data?.reason, 500);

    if (!propertyId || !/^[A-Za-z0-9_-]{1,160}$/.test(propertyId)) {
      throw new HttpsError("invalid-argument", "A valid propertyId is required.");
    }
    if (!new Set(["APPROVE", "REJECT"]).has(decision)) {
      throw new HttpsError("invalid-argument", "decision must be APPROVE or REJECT.");
    }
    if (decision === "REJECT" && !reason) {
      throw new HttpsError("invalid-argument", "A rejection reason is required.");
    }

    const propertyRef = db.collection("properties").doc(propertyId);
    const auditRef = db.collection("audit_logs").doc();
    const notificationRef = db.collection("notifications").doc();
    const now = FieldValue.serverTimestamp();

    const result = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(propertyRef);
      if (!snapshot.exists) throw new HttpsError("not-found", "Property was not found.");

      const property = snapshot.data() || {};
      const previousStatus = text(property.status, 80).toLowerCase();
      const targetStatus = decision === "APPROVE" ? "APPROVED" : "REJECTED";
      if (previousStatus === targetStatus.toLowerCase()) {
        return { status: targetStatus, idempotent: true, notificationCreated: false };
      }
      if (!REVIEWABLE_STATUSES.has(previousStatus)) {
        throw new HttpsError(
          "failed-precondition",
          `Property cannot be reviewed from status ${previousStatus || "missing"}.`,
        );
      }

      const propertyName = text(property.name || property.propertyName, 160) || "Property";
      const recipientId = text(property.ownerId || property.ownerUid, 160);
      const reviewUpdate = decision === "APPROVE"
        ? {
            status: targetStatus,
            approvedAt: now,
            approvedBy: request.auth!.uid,
            rejectionReason: FieldValue.delete(),
            rejectedAt: FieldValue.delete(),
          }
        : {
            status: targetStatus,
            rejectionReason: reason,
            rejectedAt: now,
            rejectedBy: request.auth!.uid,
          };

      transaction.update(propertyRef, {
        ...reviewUpdate,
        updatedAt: now,
      });
      transaction.set(auditRef, {
        actorId: request.auth!.uid,
        actorRole,
        actorEmail: text(token.email, 160) || null,
        action: decision === "APPROVE" ? "APPROVE_PROPERTY" : "REJECT_PROPERTY",
        targetType: "PROPERTY",
        targetId: propertyId,
        before: { status: previousStatus || "missing" },
        after: {
          status: targetStatus,
          ...(decision === "REJECT" ? { reason } : {}),
        },
        metadata: { propertyName },
        source: "CALLABLE_ADMIN_REVIEW_PROPERTY",
        createdAt: now,
      });

      if (recipientId) {
        transaction.set(notificationRef, {
          recipientId,
          recipientRole: "owner",
          title: decision === "APPROVE" ? "PROPERTY APPROVED" : "PROPERTY REJECTED",
          body: decision === "APPROVE"
            ? `Your property "${propertyName}" has been approved by the admin.`
            : `Your property "${propertyName}" was rejected. Reason: ${reason}`,
          type: decision === "APPROVE" ? "PROPERTY_APPROVAL" : "PROPERTY_REJECTION",
          link: "/owner/properties",
          metadata: { propertyId },
          read: false,
          createdByUid: request.auth!.uid,
          deliverySource: "callable:adminReviewProperty",
          createdAt: now,
        });
      }

      return { status: targetStatus, idempotent: false, notificationCreated: Boolean(recipientId) };
    });

    return {
      success: true,
      propertyId,
      ...result,
    };
  },
);
