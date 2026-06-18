import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

export const onOwnerApprovalDecision = onDocumentUpdated(
  {
    region: "europe-west3",
    document: "owner_approval_requests/{approvalId}",
  },
  async (event) => {
    const before = event.data?.before.data() || {};
    const after = event.data?.after.data() || {};
    const approvalId = event.params.approvalId;

    if (before.status === after.status && before.decision === after.decision) return;
    if (!after.decision) return;

    const statusByDecision: Record<string, string> = {
      APPROVED: "owner_approved",
      EMERGENCY_APPROVED: "owner_approved_emergency",
      REJECTED: "owner_rejected",
      REQUEST_MORE_QUOTES: "more_quotes_requested",
    };

    const derivedStatus = statusByDecision[String(after.decision)] || String(after.status || "owner_decision_recorded");
    const batch = db.batch();

    if (after.rfqId) {
      batch.set(db.collection("vendor_rfqs").doc(String(after.rfqId)), {
        status: derivedStatus,
        ownerDecision: after.decision,
        ownerDecisionNote: after.decisionNote || "",
        ownerDecisionAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    if (after.ticketId) {
      batch.set(db.collection("maintenanceTickets").doc(String(after.ticketId)), {
        ownerApprovalStatus: derivedStatus,
        ownerDecision: after.decision,
        ownerDecisionNote: after.decisionNote || "",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    batch.set(db.collection("maintenance_ledger").doc(), {
      source: "owner_trust_workflow_function",
      ledgerEvent: "OWNER_APPROVAL_DECISION_SYNCED",
      approvalRequestId: approvalId,
      rfqId: after.rfqId || "",
      ticketId: after.ticketId || "",
      propertyId: after.propertyId || "",
      ownerId: after.ownerId || "",
      decision: after.decision || "",
      status: derivedStatus,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await batch.commit();
  }
);
