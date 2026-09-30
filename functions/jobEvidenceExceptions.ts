import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  JOB_EVIDENCE_EXCEPTIONS_SUBCOLLECTION,
  assignedTechnicianIdOf,
  evaluateJobEvidence,
} from "./jobEvidenceGate";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// Supervisor exception flow for the job evidence gate. The assigned technician (or
// operations staff) requests an exception with a reason; a supervisor-tier actor who is
// neither the assigned technician nor the requester approves or rejects it with a
// reason. Every step is written server-side with who / why / when and an audit_logs
// entry; the gate (jobEvidenceGate.assertJobClosureAllowed) honours only APPROVED
// records for the same ticket, technician and visit.

const CALLABLE = { cors: true, region: "europe-west3", enforceAppCheck: true } as const;
// Open question for Rashid: exact supervisor roster. Dispatchers are deliberately excluded.
export const JOB_EVIDENCE_SUPERVISOR_ROLES = new Set(["supervisor", "operations_manager", "operations_admin", "admin", "super_admin"]);
const OPERATIONS_REQUESTER_ROLES = new Set([...JOB_EVIDENCE_SUPERVISOR_ROLES, "dispatcher"]);
const NOT_EXCEPTIONABLE_STATUSES = new Set(["CLOSED", "CANCELLED", "REJECTED", "TENANT_APPROVED"]);
const MIN_REASON = 20;
const MAX_REASON = 1000;

const text = (value: unknown, max = 200) => String(value ?? "").trim().slice(0, max);
const roleOf = (claims: Record<string, any>) => text(claims.role || claims.userRole || claims.primaryRole, 60).toLowerCase();
const isAdminClaim = (claims: Record<string, any>) => claims.admin === true || claims.super_admin === true || claims.superAdmin === true;

async function liveActor(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in is required.");
  if (auth.token?.suspended === true) throw new HttpsError("permission-denied", "Suspended accounts cannot act on job evidence.");
  const user = await admin.auth().getUser(auth.uid);
  const claims = user.customClaims || {};
  if (user.disabled || claims.suspended === true) throw new HttpsError("permission-denied", "Inactive accounts cannot act on job evidence.");
  // Authority comes from the live Auth claims, not a possibly stale ID token.
  const role = isAdminClaim(claims) && !roleOf(claims) ? "admin" : roleOf(claims);
  return {
    uid: auth.uid,
    role,
    email: text(user.email, 320).toLowerCase() || null,
    mfa: Boolean(auth.token?.firebase?.sign_in_second_factor),
    supervisor: isAdminClaim(claims) || JOB_EVIDENCE_SUPERVISOR_ROLES.has(role),
  };
}

function cleanReason(value: unknown) {
  const reason = text(value, MAX_REASON);
  if (reason.length < MIN_REASON) {
    throw new HttpsError("invalid-argument", `A clear reason of at least ${MIN_REASON} characters is required.`);
  }
  return reason;
}

export const requestJobEvidenceException = onCall(CALLABLE, async (request) => {
  const actor = await liveActor(request.auth);
  const ticketId = text(request.data?.ticketId, 160);
  if (!ticketId) throw new HttpsError("invalid-argument", "ticketId is required.");
  const reason = cleanReason(request.data?.reason);
  const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
  const exceptionsRef = ticketRef.collection(JOB_EVIDENCE_EXCEPTIONS_SUBCOLLECTION);

  return db.runTransaction(async (transaction) => {
    const ticketSnap = await transaction.get(ticketRef);
    if (!ticketSnap.exists) throw new HttpsError("not-found", "Job not found.");
    const ticket = ticketSnap.data() || {};
    const technicianId = assignedTechnicianIdOf(ticket);
    if (!technicianId) throw new HttpsError("failed-precondition", "Evidence exceptions apply only to jobs with an assigned technician.");
    const isAssignedTechnician = actor.uid === technicianId && ["technician", "tech"].includes(actor.role);
    if (!isAssignedTechnician && !actor.supervisor && !OPERATIONS_REQUESTER_ROLES.has(actor.role)) {
      throw new HttpsError("permission-denied", "Only the assigned technician or operations staff can request an evidence exception.");
    }
    const status = text(ticket.status, 80).toUpperCase();
    if (NOT_EXCEPTIONABLE_STATUSES.has(status)) {
      throw new HttpsError("failed-precondition", `A ${status} job cannot receive an evidence exception.`);
    }

    const currentId = text(ticket.evidenceExceptionId, 160);
    if (currentId && text(ticket.evidenceExceptionStatus, 40) === "PENDING") {
      const current = await transaction.get(exceptionsRef.doc(currentId));
      if (current.exists && current.data()?.status === "PENDING") {
        return { ok: true, idempotent: true, ticketId, exceptionId: currentId, status: "PENDING" };
      }
    }

    const evaluation = await evaluateJobEvidence(ticketId, ticket, { read: (ref) => transaction.get(ref) });
    if (evaluation.missing.length === 0) {
      throw new HttpsError("failed-precondition", "This job's proof is already complete; no exception is needed.");
    }

    const exceptionRef = exceptionsRef.doc();
    const now = FieldValue.serverTimestamp();
    transaction.create(exceptionRef, {
      recordType: "JOB_EVIDENCE_EXCEPTION",
      exceptionId: exceptionRef.id,
      ticketId,
      assignedTechnicianId: technicianId,
      status: "PENDING",
      requiredEvidence: evaluation.required,
      requestedMissingEvidence: evaluation.missing,
      ticketStatusAtRequest: status || null,
      requestedBy: actor.uid,
      requestedByRole: actor.role,
      requestedByEmail: actor.email,
      requestReason: reason,
      requestedAt: now,
    });
    transaction.update(ticketRef, {
      evidenceExceptionId: exceptionRef.id,
      evidenceExceptionStatus: "PENDING",
      evidenceExceptionRequestedAt: now,
      updatedAt: now,
    });
    transaction.create(db.collection("audit_logs").doc(), {
      action: "JOB_EVIDENCE_EXCEPTION_REQUESTED",
      actorId: actor.uid,
      actorRole: actor.role,
      targetType: "maintenanceTickets",
      targetId: ticketId,
      reason,
      metadata: { exceptionId: exceptionRef.id, missingEvidence: evaluation.missing, assignedTechnicianId: technicianId, ticketStatus: status || null },
      createdAt: now,
    });
    return { ok: true, idempotent: false, ticketId, exceptionId: exceptionRef.id, status: "PENDING", missingEvidence: evaluation.missing };
  });
});

export const decideJobEvidenceException = onCall(CALLABLE, async (request) => {
  const actor = await liveActor(request.auth);
  if (!actor.supervisor) throw new HttpsError("permission-denied", "Supervisor authority is required to decide an evidence exception.");
  const ticketId = text(request.data?.ticketId, 160);
  const exceptionId = text(request.data?.exceptionId, 160);
  const decision = text(request.data?.decision, 20).toUpperCase();
  if (!ticketId || !exceptionId) throw new HttpsError("invalid-argument", "ticketId and exceptionId are required.");
  if (!["APPROVE", "REJECT"].includes(decision)) throw new HttpsError("invalid-argument", "decision must be APPROVE or REJECT.");
  const reason = cleanReason(request.data?.reason);
  const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
  const exceptionRef = ticketRef.collection(JOB_EVIDENCE_EXCEPTIONS_SUBCOLLECTION).doc(exceptionId);

  const result = await db.runTransaction(async (transaction) => {
    const [ticketSnap, exceptionSnap] = await Promise.all([transaction.get(ticketRef), transaction.get(exceptionRef)]);
    if (!ticketSnap.exists || !exceptionSnap.exists) throw new HttpsError("not-found", "Evidence exception not found.");
    const ticket = ticketSnap.data() || {};
    const exception = exceptionSnap.data() || {};
    const technicianId = assignedTechnicianIdOf(ticket);
    if (exception.ticketId !== ticketId || text(ticket.evidenceExceptionId, 160) !== exceptionId) {
      throw new HttpsError("failed-precondition", "This exception is not the job's current evidence exception.");
    }
    if (exception.status !== "PENDING") {
      throw new HttpsError("failed-precondition", `This exception was already ${String(exception.status || "decided").toLowerCase()}.`);
    }
    if (text(exception.assignedTechnicianId, 160) !== technicianId) {
      throw new HttpsError("failed-precondition", "The job was reassigned after the exception was requested; request a new exception.");
    }
    if (actor.uid === technicianId) throw new HttpsError("permission-denied", "The assigned technician cannot decide their own evidence exception.");
    if (actor.uid === text(exception.requestedBy, 160)) {
      throw new HttpsError("permission-denied", "The requester cannot decide their own evidence exception; a second supervisor must decide.");
    }

    const evaluation = await evaluateJobEvidence(ticketId, ticket, { read: (ref) => transaction.get(ref) });
    if (decision === "APPROVE" && evaluation.missing.length === 0) {
      throw new HttpsError("failed-precondition", "The job's proof is now complete; reject this exception instead of approving it.");
    }
    const status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const now = FieldValue.serverTimestamp();
    transaction.update(exceptionRef, {
      status,
      approvedMissingEvidence: decision === "APPROVE" ? evaluation.missing : [],
      missingEvidenceAtDecision: evaluation.missing,
      decidedBy: actor.uid,
      decidedByRole: actor.role,
      decidedByEmail: actor.email,
      decidedWithMfa: actor.mfa,
      decisionReason: reason,
      decidedAt: now,
    });
    transaction.update(ticketRef, {
      evidenceExceptionStatus: status,
      evidenceExceptionDecidedBy: actor.uid,
      evidenceExceptionDecidedAt: now,
      updatedAt: now,
    });
    transaction.create(db.collection("audit_logs").doc(), {
      action: decision === "APPROVE" ? "JOB_EVIDENCE_EXCEPTION_APPROVED" : "JOB_EVIDENCE_EXCEPTION_REJECTED",
      actorId: actor.uid,
      actorRole: actor.role,
      actorEmail: actor.email,
      targetType: "maintenanceTickets",
      targetId: ticketId,
      reason,
      metadata: {
        exceptionId,
        requestedBy: text(exception.requestedBy, 160) || null,
        requestReason: text(exception.requestReason, MAX_REASON) || null,
        missingEvidence: evaluation.missing,
        assignedTechnicianId: technicianId,
        decidedWithMfa: actor.mfa,
      },
      createdAt: now,
    });
    if (technicianId) {
      transaction.create(db.collection("notifications").doc(), {
        recipientId: technicianId,
        recipientRole: "technician",
        type: "JOB_EVIDENCE_EXCEPTION_DECISION",
        title: decision === "APPROVE" ? "Evidence exception approved" : "Evidence exception rejected",
        body: decision === "APPROVE"
          ? `A supervisor accepted the missing proof (${evaluation.missing.join(", ")}) for job #${ticketId.slice(0, 8).toUpperCase()}.`
          : `A supervisor rejected the evidence exception for job #${ticketId.slice(0, 8).toUpperCase()}. Capture the missing proof.`,
        ticketId,
        link: `/technician/job/${ticketId}`,
        read: false,
        createdAt: now,
        createdByUid: actor.uid,
      });
    }
    return { ok: true, ticketId, exceptionId, status, missingEvidence: evaluation.missing };
  });
  return result;
});
