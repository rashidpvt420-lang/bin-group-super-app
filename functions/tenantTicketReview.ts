import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

const db = admin.firestore();
const ts = admin.firestore.FieldValue.serverTimestamp;

export const tenantReviewTicketCompletion = onCall({ cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }
  
  const tenantId = request.auth.uid;
  const { ticketId, action, rating, feedback, disputeReason } = request.data;
  
  if (!ticketId || !action) {
    throw new HttpsError("invalid-argument", "Missing ticketId or action.");
  }

  const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
  const docSnap = await ticketRef.get();
  
  if (!docSnap.exists) {
    throw new HttpsError("not-found", "Ticket not found.");
  }
  
  const data = docSnap.data() as any;
  
  // Verify ownership
  if (
    data.tenantId !== tenantId && 
    data.tenantUid !== tenantId && 
    data.userId !== tenantId && 
    data.ownerId !== tenantId
  ) {
    throw new HttpsError("permission-denied", "Only the tenant can review this ticket.");
  }

  if (action === "approve") {
    await ticketRef.update({
      closureStatus: "tenant_approved",
      tenantApproved: true,
      tenantApprovalStatus: "APPROVED",
      status: "CLOSED",
      rating: rating || null,
      feedback: feedback || null,
      closedAt: ts(),
      finalApproval: true,
      updatedAt: ts()
    });

    await db.collection("audit_logs").add({
      actorId: tenantId,
      actorRole: "tenant",
      action: "TENANT_APPROVED_TICKET",
      targetType: "maintenanceTickets",
      targetId: ticketId,
      metadata: { rating, feedback },
      createdAt: ts()
    });

  } else if (action === "dispute") {
    await ticketRef.update({
      status: "DISPUTED",
      closureStatus: "disputed",
      requiresAdminReview: true,
      adminReviewStatus: "pending",
      disputeStatus: "open",
      disputeReason: disputeReason || "No reason provided",
      tenantApproved: false,
      tenantApprovalStatus: "DISPUTED",
      finalApproval: false,
      updatedAt: ts()
    });

    await db.collection("audit_logs").add({
      actorId: tenantId,
      actorRole: "tenant",
      action: "TENANT_DISPUTED_TICKET",
      targetType: "maintenanceTickets",
      targetId: ticketId,
      metadata: { disputeReason },
      createdAt: ts()
    });

  } else {
    throw new HttpsError("invalid-argument", "Action must be 'approve' or 'dispute'.");
  }

  return { success: true };
});
