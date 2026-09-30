import type * as FirebaseFirestore from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

// N-22: an Owner APPROVE_CLOSE closed a ticket on its status alone. A ticket can reach a
// reviewable status through Admin / legacy paths that skip the technician evidence flow, so the
// Owner could "approve" work that has no verified completion evidence. Closure now requires the
// same server-confirmed, immutable after-work evidence the technician completion path enforces
// (secureTechnicianOperations.assertLifecycleEvidence), re-checked against the live object.

const text = (value: unknown) => String(value ?? "").trim();

function assignedTechnicianId(data: FirebaseFirestore.DocumentData) {
  return text(data.assignedTechnicianId || data.technicianId || data.assignedTechId || data.technicianUid || data.techId);
}

function storageContentHash(metadata: any) {
  return text(metadata?.md5Hash || metadata?.etag);
}

export async function hasVerifiedAfterWorkEvidence(ticketId: string, ticket: FirebaseFirestore.DocumentData): Promise<boolean> {
  const confirmationId = text(ticket.technicianAfterConfirmationId);
  const afterPhotos = Array.isArray(ticket.technicianAfterPhotos) ? ticket.technicianAfterPhotos : [];
  if (ticket.technicianAfterEvidenceState !== "CONFIRMED" || !confirmationId) return false;
  if (!text(ticket.technicianAfterPhotoUrl) && afterPhotos.length === 0) return false;

  const db = admin.firestore();
  const confirmationSnap = await db.collection("audit_logs").doc(confirmationId).get();
  if (!confirmationSnap.exists) return false;
  const confirmation = confirmationSnap.data() || {};
  const confirmedUrl = text(confirmation.downloadUrl);
  const storagePath = text(confirmation.storagePath);
  const generation = text(confirmation.objectGeneration);
  const contentHash = text(confirmation.contentHash);
  const bucket = admin.storage().bucket();

  const confirmed =
    confirmation.recordType === "TECHNICIAN_EVIDENCE_CONFIRMATION" &&
    confirmation.action === "TECHNICIAN_AFTER_WORK_EVIDENCE_CONFIRMATION" &&
    confirmation.state === "CONFIRMED" &&
    confirmation.ticketId === ticketId &&
    confirmation.evidenceType === "technician_after_work" &&
    Boolean(assignedTechnicianId(ticket)) &&
    confirmation.technicianId === assignedTechnicianId(ticket) &&
    text(confirmation.bucketName) === bucket.name &&
    storagePath.startsWith(`maintenanceTickets/${ticketId}/proofPhotos/`) &&
    Boolean(generation) && Boolean(contentHash);
  const matchesTicket =
    Boolean(confirmedUrl) &&
    (text(ticket.technicianAfterPhotoUrl) === confirmedUrl || afterPhotos.includes(confirmedUrl)) &&
    text(ticket.technicianAfterStoragePath) === storagePath &&
    text(ticket.technicianAfterObjectGeneration) === generation &&
    text(ticket.technicianAfterContentHash) === contentHash;
  if (!confirmed || !matchesTicket) return false;

  try {
    const [metadata] = await bucket.file(storagePath).getMetadata();
    return text(metadata.generation) === generation &&
      storageContentHash(metadata) === contentHash &&
      text(metadata.contentType).toLowerCase() === text(confirmation.contentType).toLowerCase() &&
      Number(metadata.size || 0) === Number(confirmation.sizeBytes || 0);
  } catch {
    return false;
  }
}

export async function assertOwnerClosureEvidence(ticketId: string, ticket: FirebaseFirestore.DocumentData) {
  if (!(await hasVerifiedAfterWorkEvidence(ticketId, ticket))) {
    throw new HttpsError(
      "failed-precondition",
      "This ticket has no verified after-work completion evidence. Request a revisit or escalate instead of approving closure.",
    );
  }
}
