import type * as FirebaseFirestore from "firebase-admin/firestore";
import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();

// Job evidence gate (Rashid: "A job should not close until proof is complete or a
// supervisor accepts the exception"). Every server path that completes, resolves or
// closes a maintenance job calls assertJobClosureAllowed. The gate reads only
// server-authored evidence (callable-written arrival GPS, server-confirmed immutable
// Storage photos re-checked against the live object) and server-recorded supervisor
// exceptions stored under maintenanceTickets/{id}/evidence_exceptions (no client
// write path: the global catch-all excludes maintenanceTickets and the ticket block
// has no rule for that subcollection).

export type JobEvidenceItem = "ARRIVAL" | "BEFORE_PHOTO" | "AFTER_PHOTO" | "NOTES" | "SIGNATURE";
export const JOB_EVIDENCE_ITEMS: readonly JobEvidenceItem[] = ["ARRIVAL", "BEFORE_PHOTO", "AFTER_PHOTO", "NOTES", "SIGNATURE"];
export const JOB_EVIDENCE_EXCEPTIONS_SUBCOLLECTION = "evidence_exceptions";
export const MIN_COMPLETION_NOTES = 10;

type Reader = (ref: FirebaseFirestore.DocumentReference) => Promise<FirebaseFirestore.DocumentSnapshot>;

const text = (value: unknown) => String(value ?? "").trim();
const defaultReader: Reader = (ref) => ref.get();

export function assignedTechnicianIdOf(ticket: FirebaseFirestore.DocumentData) {
  return text(ticket.assignedTechnicianId || ticket.technicianId || ticket.assignedTechId || ticket.technicianUid || ticket.techId);
}

function millis(value: any): number | null {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const seconds = value.seconds ?? value._seconds;
  if (Number.isFinite(Number(seconds))) return Number(seconds) * 1000;
  return null;
}

/**
 * Evidence the job needs before it can complete or close. Arrival, before- and after-work
 * photos and completion notes are always required. A customer signature is required only
 * when the job is flagged for it; no server-verified signature capture exists yet, so a
 * flagged job can only close through a supervisor exception (open question for Rashid).
 */
export function requiredJobEvidence(ticket: FirebaseFirestore.DocumentData): JobEvidenceItem[] {
  const required: JobEvidenceItem[] = ["ARRIVAL", "BEFORE_PHOTO", "AFTER_PHOTO", "NOTES"];
  const requirements = ticket.evidenceRequirements && typeof ticket.evidenceRequirements === "object" ? ticket.evidenceRequirements : {};
  if (requirements.signature === true || ticket.requiresCustomerSignature === true || ticket.signatureRequired === true) {
    required.push("SIGNATURE");
  }
  return required;
}

/** Evidence captured before a reopen/revisit belongs to the earlier visit and does not count. */
function isCurrentVisit(ticket: FirebaseFirestore.DocumentData, capturedAt: unknown) {
  const reopenedAtMs = millis(ticket.reopenedAt);
  if (reopenedAtMs === null) return true;
  const capturedAtMs = millis(capturedAt);
  return capturedAtMs !== null && capturedAtMs >= reopenedAtMs;
}

function hasServerArrival(ticket: FirebaseFirestore.DocumentData) {
  const location = ticket.arrivedLocation || {};
  const lat = Number(location.lat ?? location.latitude);
  const lng = Number(location.lng ?? location.longitude);
  const accuracy = Number(location.accuracy);
  return millis(ticket.arrivedAt) !== null && isCurrentVisit(ticket, ticket.arrivedAt) &&
    Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) &&
    Number.isFinite(accuracy) && accuracy > 0 && accuracy <= 100 &&
    ["GPS_VERIFIED", "FUNCTIONAL_ONLY"].includes(text(ticket.onSiteVerification)) &&
    // An arrival an admin marked on the technician's behalf is not technician arrival proof.
    text(ticket.arrivalEvidenceMode) !== "ADMIN_FUNCTIONAL_ONLY";
}

const PHOTO_KINDS = {
  BEFORE_PHOTO: {
    prefix: "technicianBefore",
    action: "TECHNICIAN_BEFORE_WORK_EVIDENCE_CONFIRMATION",
    evidenceType: "technician_before_work",
  },
  AFTER_PHOTO: {
    prefix: "technicianAfter",
    action: "TECHNICIAN_AFTER_WORK_EVIDENCE_CONFIRMATION",
    evidenceType: "technician_after_work",
  },
} as const;

/** Server-confirmed, immutable technician photo evidence, re-checked against the live Storage object. */
export async function hasVerifiedTechnicianPhoto(
  ticketId: string,
  ticket: FirebaseFirestore.DocumentData,
  kind: "BEFORE_PHOTO" | "AFTER_PHOTO",
  read: Reader = defaultReader,
): Promise<boolean> {
  const spec = PHOTO_KINDS[kind];
  const field = (suffix: string) => ticket[`${spec.prefix}${suffix}`];
  const confirmationId = text(field("ConfirmationId"));
  const photos = Array.isArray(field("Photos")) ? field("Photos") as unknown[] : [];
  if (field("EvidenceState") !== "CONFIRMED" || !confirmationId) return false;
  if (!isCurrentVisit(ticket, field("EvidenceAt"))) return false;
  if (!text(field("PhotoUrl")) && photos.length === 0) return false;
  const technicianId = assignedTechnicianIdOf(ticket);
  if (!technicianId) return false;

  const confirmationSnap = await read(admin.firestore().collection("audit_logs").doc(confirmationId));
  if (!confirmationSnap.exists) return false;
  const confirmation = confirmationSnap.data() || {};
  const confirmedUrl = text(confirmation.downloadUrl);
  const storagePath = text(confirmation.storagePath);
  const generation = text(confirmation.objectGeneration);
  const contentHash = text(confirmation.contentHash);
  const bucket = admin.storage().bucket();
  const confirmed =
    confirmation.recordType === "TECHNICIAN_EVIDENCE_CONFIRMATION" &&
    confirmation.action === spec.action &&
    confirmation.state === "CONFIRMED" &&
    confirmation.ticketId === ticketId &&
    confirmation.evidenceType === spec.evidenceType &&
    confirmation.technicianId === technicianId &&
    text(confirmation.bucketName) === bucket.name &&
    storagePath.startsWith(`maintenanceTickets/${ticketId}/proofPhotos/`) &&
    Boolean(generation) && Boolean(contentHash);
  const matchesTicket =
    Boolean(confirmedUrl) &&
    (text(field("PhotoUrl")) === confirmedUrl || photos.includes(confirmedUrl)) &&
    text(field("StoragePath")) === storagePath &&
    text(field("ObjectGeneration")) === generation &&
    text(field("ContentHash")) === contentHash;
  if (!confirmed || !matchesTicket) return false;
  try {
    const [metadata] = await bucket.file(storagePath).getMetadata();
    return text(metadata.generation) === generation &&
      text(metadata.md5Hash || metadata.etag) === contentHash &&
      text(metadata.contentType).toLowerCase() === text(confirmation.contentType).toLowerCase() &&
      Number(metadata.size || 0) === Number(confirmation.sizeBytes || 0);
  } catch {
    return false;
  }
}

export function completionNotesOf(ticket: FirebaseFirestore.DocumentData, candidateNotes?: unknown) {
  // Technician-authored completion notes only; ticket.notes can hold the tenant's request text.
  return [candidateNotes, ticket.technicianNotes, ticket.completionNotes]
    .map(text)
    .find((value) => value.length >= MIN_COMPLETION_NOTES) || "";
}

export type JobEvidenceEvaluation = {
  required: JobEvidenceItem[];
  satisfied: JobEvidenceItem[];
  missing: JobEvidenceItem[];
  arrivalEvidenceMode: string | null;
};

export async function evaluateJobEvidence(
  ticketId: string,
  ticket: FirebaseFirestore.DocumentData,
  options: { candidateNotes?: unknown; read?: Reader } = {},
): Promise<JobEvidenceEvaluation> {
  const read = options.read || defaultReader;
  const required = requiredJobEvidence(ticket);
  const satisfied: JobEvidenceItem[] = [];
  for (const item of required) {
    let ok = false;
    if (item === "ARRIVAL") ok = hasServerArrival(ticket);
    if (item === "BEFORE_PHOTO" || item === "AFTER_PHOTO") ok = await hasVerifiedTechnicianPhoto(ticketId, ticket, item, read);
    if (item === "NOTES") ok = completionNotesOf(ticket, options.candidateNotes).length >= MIN_COMPLETION_NOTES;
    // SIGNATURE: no server-verified customer signature capture exists, so it is never
    // satisfied by client-supplied URLs (signatureUrl is browser/legacy-writable).
    if (ok) satisfied.push(item);
  }
  return {
    required,
    satisfied,
    missing: required.filter((item) => !satisfied.includes(item)),
    arrivalEvidenceMode: hasServerArrival(ticket) ? text(ticket.onSiteVerification) : null,
  };
}

export type ApprovedEvidenceException = {
  exceptionId: string;
  approvedMissingEvidence: JobEvidenceItem[];
  decidedBy: string;
  decidedByRole: string;
  decisionReason: string;
};

/** A supervisor-approved, still-current exception recorded by decideJobEvidenceException. */
export async function loadApprovedEvidenceException(
  ticketId: string,
  ticket: FirebaseFirestore.DocumentData,
  read: Reader = defaultReader,
): Promise<ApprovedEvidenceException | null> {
  const exceptionId = text(ticket.evidenceExceptionId);
  if (!exceptionId) return null;
  const snap = await read(
    admin.firestore().collection("maintenanceTickets").doc(ticketId)
      .collection(JOB_EVIDENCE_EXCEPTIONS_SUBCOLLECTION).doc(exceptionId),
  );
  if (!snap.exists) return null;
  const exception = snap.data() || {};
  const approvedAtMs = millis(exception.decidedAt);
  const reopenedAtMs = millis(ticket.reopenedAt);
  const technicianId = assignedTechnicianIdOf(ticket);
  const decidedBy = text(exception.decidedBy);
  if (
    exception.status !== "APPROVED" ||
    exception.ticketId !== ticketId ||
    exception.recordType !== "JOB_EVIDENCE_EXCEPTION" ||
    // Separation of duties: the technician doing the job can never waive its proof.
    !decidedBy || decidedBy === technicianId ||
    text(exception.decisionReason).length < 20 ||
    approvedAtMs === null ||
    // A reopened / revisited job needs a fresh decision for the new visit.
    (reopenedAtMs !== null && approvedAtMs < reopenedAtMs) ||
    // The exception is bound to the technician it was granted for.
    text(exception.assignedTechnicianId) !== technicianId
  ) return null;
  const approvedMissingEvidence = (Array.isArray(exception.approvedMissingEvidence) ? exception.approvedMissingEvidence : [])
    .filter((item: unknown): item is JobEvidenceItem => JOB_EVIDENCE_ITEMS.includes(item as JobEvidenceItem));
  return {
    exceptionId,
    approvedMissingEvidence,
    decidedBy,
    decidedByRole: text(exception.decidedByRole),
    decisionReason: text(exception.decisionReason),
  };
}

export type JobClosureDecision = {
  mode: "EVIDENCE_COMPLETE" | "SUPERVISOR_EXCEPTION";
  required: JobEvidenceItem[];
  missing: JobEvidenceItem[];
  arrivalEvidenceMode: string | null;
  exceptionId: string | null;
  exceptionApprovedBy: string | null;
};

/**
 * Throws failed-precondition unless every required item is proven or a supervisor
 * exception approved (for this ticket, this technician and this visit) covers every
 * missing item. Returns the decision so callers can persist and audit it.
 */
export async function assertJobClosureAllowed(
  ticketId: string,
  ticket: FirebaseFirestore.DocumentData,
  options: { candidateNotes?: unknown; read?: Reader; action?: string } = {},
): Promise<JobClosureDecision> {
  const evaluation = await evaluateJobEvidence(ticketId, ticket, options);
  if (evaluation.missing.length === 0) {
    return { mode: "EVIDENCE_COMPLETE", ...evaluation, exceptionId: null, exceptionApprovedBy: null };
  }
  const exception = await loadApprovedEvidenceException(ticketId, ticket, options.read);
  if (exception && evaluation.missing.every((item) => exception.approvedMissingEvidence.includes(item))) {
    return {
      mode: "SUPERVISOR_EXCEPTION",
      ...evaluation,
      exceptionId: exception.exceptionId,
      exceptionApprovedBy: exception.decidedBy,
    };
  }
  throw new HttpsError(
    "failed-precondition",
    `This job cannot ${options.action || "close"} until its proof is complete or a supervisor approves an evidence exception. Missing: ${evaluation.missing.join(", ")}.`,
    { reason: "JOB_EVIDENCE_INCOMPLETE", missingEvidence: evaluation.missing, exceptionId: exception?.exceptionId || null },
  );
}

/** Fields persisted on the ticket with the closing write, so the audit trail shows how it closed. */
export function closureGateRecord(decision: JobClosureDecision, path: string) {
  return {
    mode: decision.mode,
    path,
    required: decision.required,
    missing: decision.missing,
    arrivalEvidenceMode: decision.arrivalEvidenceMode,
    exceptionId: decision.exceptionId,
    exceptionApprovedBy: decision.exceptionApprovedBy,
    checkedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}
