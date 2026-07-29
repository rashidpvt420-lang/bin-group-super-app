import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const ts = admin.firestore.FieldValue.serverTimestamp;
const MIN_DISPUTE_REASON = 8;
const MAX_REVIEW_TEXT = 1000;
const TENANT_REVIEW_STATUSES = new Set([
  "COMPLETED",
  "RESOLVED",
  "PENDING_TENANT_REVIEW",
  "COMPLETED_PENDING_APPROVAL",
  "COMPLETED_PENDING_TENANT_APPROVAL",
]);
const DEFINITIVE_AUTH_LOOKUP_ERRORS = new Set([
  "auth/user-not-found",
  "auth/invalid-uid",
]);

function normalizedStatus(value: unknown) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "_");
}

function cleanText(value: unknown, maxLength = MAX_REVIEW_TEXT) {
  return String(value || "").trim().slice(0, maxLength);
}

function firstTenantId(data: FirebaseFirestore.DocumentData) {
  return cleanText(data.tenantId || data.tenantUid || data.userId || data.requesterId, 128);
}

async function verifiedTenantEmail(tenantId: string) {
  try {
    const account = await admin.auth().getUser(tenantId);
    if (account.disabled || !account.emailVerified) return "";
    return cleanText(account.email, 320).toLowerCase();
  } catch (error) {
    const errorCode = (error as { code?: string })?.code || "unknown";
    if (DEFINITIVE_AUTH_LOOKUP_ERRORS.has(errorCode)) {
      console.error("[TenantCompletionNotification] Authoritative Tenant account is unavailable", {
        tenantId,
        errorCode,
      });
      return "";
    }
    console.error("[TenantCompletionNotification] Transient authoritative Tenant lookup failure; retrying event", {
      tenantId,
      errorCode,
    });
    throw error;
  }
}

/**
 * Creates an immutable, idempotent Tenant notification packet only when a real
 * ticket lifecycle transition enters Tenant review. The notification document
 * is then processed by deliverNotificationPush, while the mail document is
 * processed by sendQueuedMailOnCreate. Their provider receipts remain attached
 * to the source documents for protected production evidence.
 */
export const onTenantCompletionReviewRequired = onDocumentUpdated(
  { document: "maintenanceTickets/{ticketId}", region: "europe-west3", retry: true },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    const beforeStatus = normalizedStatus(before.status);
    const afterStatus = normalizedStatus(after.status);

    if (!TENANT_REVIEW_STATUSES.has(afterStatus) || TENANT_REVIEW_STATUSES.has(beforeStatus)) return;

    const tenantId = firstTenantId(after);
    if (!tenantId) {
      console.error("[TenantCompletionNotification] Missing Tenant identity", { ticketId: event.params.ticketId });
      return;
    }

    const ticketId = event.params.ticketId;
    const completionVersion = event.data?.after.updateTime?.toMillis?.()
      || after.completedAt?.toMillis?.()
      || Date.now();
    const packetId = `tenant_completion_${ticketId}_${completionVersion}`.slice(0, 240);
    const notificationRef = db.collection("notifications").doc(packetId);
    const mailRef = db.collection("mail").doc(packetId);
    const auditRef = db.collection("audit_logs").doc(`audit_${packetId}`.slice(0, 240));
    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    const tenantEmail = await verifiedTenantEmail(tenantId);

    const propertyName = cleanText(after.propertyName || after.property?.name || "your property", 160);
    const category = cleanText(after.category || after.complaintCategory || after.trade || "maintenance request", 120);
    const link = `/tenant/ticket/${encodeURIComponent(ticketId)}`;
    const title = "Work completed — your review is required";
    const body = `The technician completed the ${category} work at ${propertyName}. Review the evidence, then approve or dispute within 48 hours.`;

    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(notificationRef);
      if (existing.exists) return;

      transaction.create(notificationRef, {
        recipientId: tenantId,
        recipientRole: "tenant",
        type: "COMPLETION_REQUEST",
        title,
        body,
        ticketId,
        link,
        metadata: {
          lifecycleStatus: afterStatus,
          propertyId: cleanText(after.propertyId, 128) || null,
          unitId: cleanText(after.unitId, 128) || null,
          assignedTechnicianId: cleanText(after.assignedTechnicianId || after.technicianId, 128) || null,
          completionVersion,
        },
        read: false,
        createdAt: ts(),
        createdByUid: cleanText(after.assignedTechnicianId || after.technicianId, 128) || "SYSTEM",
        deliverySource: "trigger:onTenantCompletionReviewRequired",
      });

      if (tenantEmail) {
        transaction.create(mailRef, {
          to: tenantEmail,
          message: {
            subject: "BIN GROUP: completed maintenance work requires your review",
            text: `${body}\n\nOpen the Tenant Portal: https://bin-group-57c60.web.app${link}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;padding:24px"><h2>${title}</h2><p>${body}</p><p><a href="https://bin-group-57c60.web.app${link}">Review completed work</a></p><p>Ticket: ${ticketId}</p></div>`,
          },
          metadata: {
            type: "tenant_completion_review",
            ticketId,
            tenantId,
            notificationId: notificationRef.id,
            completionVersion,
            recipientSource: "firebase_auth_verified_email",
          },
          createdAt: ts(),
        });
      }

      transaction.create(auditRef, {
        actorId: cleanText(after.assignedTechnicianId || after.technicianId, 128) || "SYSTEM",
        actorRole: cleanText(after.assignedTechnicianId || after.technicianId, 128) ? "technician" : "system",
        action: "TENANT_COMPLETION_REVIEW_NOTIFICATION_QUEUED",
        targetType: "maintenanceTickets",
        targetId: ticketId,
        metadata: {
          notificationId: notificationRef.id,
          mailId: tenantEmail ? mailRef.id : null,
          tenantId,
          tenantEmailPresent: Boolean(tenantEmail),
          tenantEmailSource: tenantEmail ? "firebase_auth_verified_email" : "none",
          completionVersion,
        },
        createdAt: ts(),
      });

      transaction.set(ticketRef, {
        tenantCompletionNotificationId: notificationRef.id,
        tenantCompletionMailId: tenantEmail ? mailRef.id : null,
        tenantCompletionNotificationQueuedAt: ts(),
        updatedAt: ts(),
      }, { merge: true });
    });
  },
);

export const tenantReviewTicketCompletion = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

    const tenantId = request.auth.uid;
    const role = String(
      request.auth.token?.role ||
      request.auth.token?.userRole ||
      request.auth.token?.primaryRole ||
      "",
    ).trim().toLowerCase();
    if (role !== "tenant") {
      throw new HttpsError("permission-denied", "A tenant custom claim is required.");
    }

    const ticketId = cleanText(request.data?.ticketId, 128);
    const action = cleanText(request.data?.action, 24).toLowerCase();
    const feedback = cleanText(request.data?.feedback);
    const disputeReason = cleanText(request.data?.disputeReason);
    const rating = Number(request.data?.rating);

    if (!ticketId || !action) {
      throw new HttpsError("invalid-argument", "Missing ticketId or action.");
    }
    if (!["approve", "dispute"].includes(action)) {
      throw new HttpsError("invalid-argument", "Action must be 'approve' or 'dispute'.");
    }
    if (action === "approve" && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
      throw new HttpsError("invalid-argument", "A whole-number rating from 1 to 5 is required.");
    }
    if (action === "dispute" && disputeReason.length < MIN_DISPUTE_REASON) {
      throw new HttpsError("invalid-argument", `A dispute reason of at least ${MIN_DISPUTE_REASON} characters is required.`);
    }

    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    await db.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(ticketRef);
      if (!docSnap.exists) {
        throw new HttpsError("not-found", "Ticket not found.");
      }

      const data = docSnap.data() as any;
      if (
        data.tenantId !== tenantId &&
        data.tenantUid !== tenantId &&
        data.userId !== tenantId &&
        data.requesterId !== tenantId
      ) {
        throw new HttpsError("permission-denied", "Only the assigned tenant can review this ticket.");
      }

      const currentStatus = normalizedStatus(data.status);
      if (!TENANT_REVIEW_STATUSES.has(currentStatus)) {
        throw new HttpsError("failed-precondition", "Ticket is not in a valid state for tenant review.");
      }

      const completedAtMs = data.completedAt?.toMillis?.() || data.updatedAt?.toMillis?.() || 0;
      const disputeDeadlineMs = completedAtMs + (48 * 60 * 60 * 1000);
      if (action === "dispute" && (!completedAtMs || Date.now() > disputeDeadlineMs)) {
        throw new HttpsError("deadline-exceeded", "The 48-hour dispute window has expired.");
      }

      const auditRef = db.collection("audit_logs").doc();
      if (action === "approve") {
        transaction.update(ticketRef, {
          closureStatus: "tenant_approved",
          tenantApproved: true,
          tenantApprovalStatus: "APPROVED",
          status: "CLOSED",
          rating,
          feedback: feedback || null,
          closedAt: ts(),
          finalApproval: true,
          updatedAt: ts(),
        });
        transaction.set(auditRef, {
          actorId: tenantId,
          actorRole: "tenant",
          action: "TENANT_APPROVED_TICKET",
          targetType: "maintenanceTickets",
          targetId: ticketId,
          metadata: { rating, feedback: feedback || null },
          createdAt: ts(),
        });
      } else {
        transaction.update(ticketRef, {
          status: "DISPUTED",
          closureStatus: "disputed",
          requiresAdminReview: true,
          adminReviewStatus: "pending",
          disputeStatus: "open",
          disputeReason,
          tenantApproved: false,
          tenantApprovalStatus: "DISPUTED",
          finalApproval: false,
          updatedAt: ts(),
        });
        transaction.set(auditRef, {
          actorId: tenantId,
          actorRole: "tenant",
          action: "TENANT_DISPUTED_TICKET",
          targetType: "maintenanceTickets",
          targetId: ticketId,
          metadata: { disputeReason, disputeDeadlineMs },
          createdAt: ts(),
        });
      }
    });

    return { success: true };
  },
);

import type * as FirebaseFirestore from "firebase-admin/firestore";