import { FieldValue } from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const ALLOWED_DECISIONS = new Set(["APPROVED", "REJECTED", "REQUEST_MORE_QUOTES", "EMERGENCY_APPROVED"]);

function asText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function statusForDecision(decision: string) {
  if (decision === "APPROVED") return "owner_approved";
  if (decision === "EMERGENCY_APPROVED") return "owner_approved_emergency";
  if (decision === "REJECTED") return "owner_rejected";
  return "more_quotes_requested";
}

export const submitOwnerApprovalDecision = onCall(
  { cors: true, region: "europe-west3" },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Owner authentication is required.");

    const ownerId = request.auth.uid;
    const approvalId = asText(request.data?.approvalRequestId || request.data?.requestId).slice(0, 160);
    const decision = asText(request.data?.decision).toUpperCase();
    const decisionNote = asText(request.data?.decisionNote).slice(0, 2000);

    if (!approvalId) throw new HttpsError("invalid-argument", "approvalRequestId is required.");
    if (!ALLOWED_DECISIONS.has(decision)) throw new HttpsError("invalid-argument", "Unsupported owner decision.");

    const ref = db.collection("owner_approval_requests").doc(approvalId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError("not-found", "Owner approval request not found.");
    const data = snap.data() || {};
    if (data.ownerId !== ownerId) throw new HttpsError("permission-denied", "This approval request does not belong to the signed-in owner.");

    const status = statusForDecision(decision);
    await ref.set({
      status,
      decision,
      decisionNote,
      ownerDecisionBy: ownerId,
      decidedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await db.collection("data_governance_events").add({
      source: "submitOwnerApprovalDecision",
      actorId: ownerId,
      actorRole: "owner",
      eventType: "OWNER_APPROVAL_DECISION_SUBMITTED",
      approvalRequestId: approvalId,
      rfqId: data.rfqId || "",
      ticketId: data.ticketId || "",
      propertyId: data.propertyId || "",
      decision,
      status,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { ok: true, approvalRequestId: approvalId, decision, status };
  }
);

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

    const derivedStatus = statusForDecision(String(after.decision));
    const batch = db.batch();

    if (after.rfqId) {
      batch.set(db.collection("vendor_rfqs").doc(String(after.rfqId)), {
        status: derivedStatus,
        ownerDecision: after.decision,
        ownerDecisionNote: after.decisionNote || "",
        ownerDecisionAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    if (after.ticketId) {
      batch.set(db.collection("maintenanceTickets").doc(String(after.ticketId)), {
        ownerApprovalStatus: derivedStatus,
        ownerDecision: after.decision,
        ownerDecisionNote: after.decisionNote || "",
        updatedAt: FieldValue.serverTimestamp(),
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
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();
  }
);
