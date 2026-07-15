import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

const db = admin.firestore();
const ts = admin.firestore.FieldValue.serverTimestamp;

export const tenantReviewTicketCompletion = onCall({ cors: true }, async (request) => {
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

  const { ticketId, action, rating, feedback, disputeReason } = request.data;

  if (!ticketId || !action) {
    throw new HttpsError("invalid-argument", "Missing ticketId or action.");
  }
  if (!["approve", "dispute"].includes(action)) {
    throw new HttpsError("invalid-argument", "Action must be 'approve' or 'dispute'.");
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
      data.userId !== tenantId
    ) {
      throw new HttpsError("permission-denied", "Only the assigned tenant can review this ticket.");
    }

    const currentStatus = String(data.status || "").toUpperCase().replace(/ /g, "_");
    const validReviewStates = [
      "COMPLETED",
      "RESOLVED",
      "PENDING_TENANT_REVIEW",
      "COMPLETED_PENDING_APPROVAL",
    ];
    if (!validReviewStates.includes(currentStatus)) {
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
        rating: rating || null,
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
        metadata: { rating, feedback },
        createdAt: ts(),
      });
    } else {
      transaction.update(ticketRef, {
        status: "DISPUTED",
        closureStatus: "disputed",
        requiresAdminReview: true,
        adminReviewStatus: "pending",
        disputeStatus: "open",
        disputeReason: disputeReason || "No reason provided",
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
});
