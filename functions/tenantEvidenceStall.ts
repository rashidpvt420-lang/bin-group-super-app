/**
 * Tenant photo-evidence stall handling.
 *
 * Tenant maintenance requests are created with photoEvidenceRequired=true and
 * evidenceStatus=PENDING_TENANT_UPLOAD; the browser uploads the photos afterwards and
 * flips evidenceStatus to TENANT_EVIDENCE_UPLOADED, which is what lets dispatch run
 * (autoRouteTicket / onTicketStatusChanged / attemptAutoAssignment all return early
 * until then). If the upload never finished (app closed, network lost) or failed
 * (TENANT_EVIDENCE_UPLOAD_FAILED), the ticket waited forever and nobody was told.
 *
 * This sweep only FLAGS such tickets; it never assigns, never changes evidenceStatus
 * and never relaxes the photo requirement:
 *   - dispatchStatus -> PENDING_MANUAL_DISPATCH with assignmentReasonCode
 *     TENANT_EVIDENCE_OVERDUE (the same manual-dispatch shape #1582 uses), so the
 *     admin queue shows it and an admin can still dispatch it manually;
 *   - one audit record, one admin notification per admin and one tenant notification
 *     (idempotent per ticket).
 * If the tenant uploads later, the existing onTicketStatusChanged path resets
 * dispatchStatus to PENDING_ASSIGNMENT and auto-dispatches as before; the
 * clearTenantEvidenceOverdueOnUpload trigger removes the stale overdue reason.
 *
 * Scope is disjoint from the redispatch sweep in #1583: that sweep re-runs
 * attemptAutoAssignment, which returns early for every ticket this sweep selects.
 */
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import type * as FirebaseFirestore from "firebase-admin/firestore";

if (!admin.apps.length) admin.initializeApp();

export const TENANT_EVIDENCE_OVERDUE_REASON = "TENANT_EVIDENCE_OVERDUE";
export const MANUAL_DISPATCH_STATUS = "PENDING_MANUAL_DISPATCH";
/** A pending upload is overdue after this long; a reported upload failure is overdue at once. */
export const TENANT_EVIDENCE_TIMEOUT_MS = 30 * 60_000;
export const TENANT_EVIDENCE_WAITING_STATES = ["PENDING_TENANT_UPLOAD", "TENANT_EVIDENCE_UPLOAD_FAILED"] as const;
const PRE_ASSIGNMENT_STATUSES = new Set(["open", "pending_assignment"]);
const ADMIN_ROLES = ["admin", "super_admin", "ceo", "manager", "operations_admin", "dispatcher"];
const SCAN_LIMIT = 200;

const text = (value: unknown, max = 200) => String(value ?? "").trim().slice(0, max);

function millis(value: unknown): number | null {
  if (value && typeof (value as any).toMillis === "function") return Number((value as any).toMillis());
  if (value instanceof Date) return value.getTime();
  const seconds = Number((value as any)?.seconds ?? (value as any)?._seconds);
  if (Number.isFinite(seconds)) return seconds * 1000;
  return null;
}

/** True when the ticket is still blocked only on tenant photos and the wait is over. */
export function isTenantEvidenceOverdue(ticket: FirebaseFirestore.DocumentData | undefined, nowMs: number): boolean {
  if (!ticket) return false;
  if (ticket.photoEvidenceRequired !== true) return false;
  const evidenceStatus = text(ticket.evidenceStatus, 80);
  if (!(TENANT_EVIDENCE_WAITING_STATES as readonly string[]).includes(evidenceStatus)) return false;
  if (text(ticket.assignedTechnicianId || ticket.technicianId, 160)) return false;
  if (ticket.deleted === true || ticket.archived === true) return false;
  if (!PRE_ASSIGNMENT_STATUSES.has(text(ticket.status, 60).toLowerCase())) return false;
  if (ticket.evidenceOverdueAt) return false;
  if (evidenceStatus === "TENANT_EVIDENCE_UPLOAD_FAILED") return true;
  const createdAt = millis(ticket.createdAt);
  return createdAt !== null && nowMs - createdAt >= TENANT_EVIDENCE_TIMEOUT_MS;
}

async function adminRecipientIds(db: FirebaseFirestore.Firestore): Promise<string[]> {
  const snaps = await Promise.all(
    ADMIN_ROLES.map((role) => db.collection("users").where("role", "==", role).limit(100).get()),
  );
  return [...new Set(snaps.flatMap((snap) => snap.docs.map((doc) => doc.id)))];
}

export async function flagStalledTenantEvidenceTickets(params: {
  db: FirebaseFirestore.Firestore;
  nowMs?: number;
}): Promise<{ scanned: number; flagged: number }> {
  const { db } = params;
  const nowMs = params.nowMs ?? Date.now();
  const snap = await db.collection("maintenanceTickets")
    .where("evidenceStatus", "in", [...TENANT_EVIDENCE_WAITING_STATES])
    .limit(SCAN_LIMIT)
    .get();
  const candidates = snap.docs.filter((doc) => isTenantEvidenceOverdue(doc.data(), nowMs));
  if (candidates.length === 0) return { scanned: snap.size, flagged: 0 };

  const adminIds = await adminRecipientIds(db);
  let flagged = 0;
  for (const candidate of candidates) {
    try {
      const ticket = await db.runTransaction(async (transaction) => {
        const fresh = await transaction.get(candidate.ref);
        const data = fresh.data();
        if (!fresh.exists || !isTenantEvidenceOverdue(data, nowMs)) return null;
        const now = FieldValue.serverTimestamp();
        const failed = text(data!.evidenceStatus, 80) === "TENANT_EVIDENCE_UPLOAD_FAILED";
        transaction.set(candidate.ref, {
          dispatchStatus: MANUAL_DISPATCH_STATUS,
          assignmentStatus: "admin_manual_assignment",
          assignmentReasonCode: TENANT_EVIDENCE_OVERDUE_REASON,
          assignmentError: failed
            ? "The tenant's photo upload failed, so automatic dispatch cannot start."
            : "Tenant photo evidence was not received within 30 minutes, so automatic dispatch cannot start.",
          assignmentDiagnostics: { evidenceStatus: text(data!.evidenceStatus, 80), timeoutMinutes: TENANT_EVIDENCE_TIMEOUT_MS / 60_000 },
          evidenceOverdueAt: now,
          manualDispatchRequiredAt: now,
          updatedAt: now,
        }, { merge: true });
        transaction.create(db.collection("audit_logs").doc(), {
          actorId: "DISPATCH_ENGINE",
          actorRole: "system",
          action: "TENANT_EVIDENCE_OVERDUE_MANUAL_DISPATCH",
          targetType: "maintenanceTickets",
          targetId: candidate.id,
          metadata: { evidenceStatus: text(data!.evidenceStatus, 80), timeoutMinutes: TENANT_EVIDENCE_TIMEOUT_MS / 60_000 },
          createdAt: now,
        });
        return data!;
      });
      if (!ticket) continue;
      flagged += 1;
      await notifyStall(db, candidate.id, ticket, adminIds);
    } catch (error) {
      console.error(`[tenant-evidence-stall] could not flag ${candidate.id}:`, error);
    }
  }
  return { scanned: snap.size, flagged };
}

async function notifyStall(
  db: FirebaseFirestore.Firestore,
  ticketId: string,
  ticket: FirebaseFirestore.DocumentData,
  adminIds: string[],
) {
  const ref8 = ticketId.substring(0, 8).toUpperCase();
  const category = text(ticket.category || ticket.complaintCategory, 60) || "Maintenance";
  const propertyName = text(ticket.propertyName, 120) || "the property";
  const now = FieldValue.serverTimestamp();
  const notifications: Array<{ recipientId: string; recipientRole: string; title: string; body: string; link: string; type: string }> = [];
  for (const adminId of adminIds) {
    notifications.push({
      recipientId: adminId,
      recipientRole: "admin",
      type: "DISPATCH_STUCK",
      title: "Complaint waiting on tenant photos",
      body: `${category} ticket #${ref8} at ${propertyName} has no tenant photos yet, so it was not dispatched. Contact the tenant or dispatch it manually.`,
      link: `/admin/tickets?ticketId=${encodeURIComponent(ticketId)}`,
    });
  }
  const tenantId = text(ticket.tenantId || ticket.tenantUid, 160);
  if (tenantId) {
    notifications.push({
      recipientId: tenantId,
      recipientRole: "tenant",
      type: "TENANT_EVIDENCE_MISSING",
      title: "We did not receive your photos",
      body: `Your ${category} request #${ref8} is missing its photos, so a technician has not been sent yet. BIN GROUP operations has been alerted and will contact you.`,
      link: `/tenant/ticket/${encodeURIComponent(ticketId)}`,
    });
  }
  await Promise.allSettled(notifications.map((notification) =>
    db.collection("notifications")
      .doc(`dispatch_${TENANT_EVIDENCE_OVERDUE_REASON.toLowerCase()}_${ticketId}_${notification.recipientId}`.slice(0, 1400))
      .create({
        ...notification,
        ticketId,
        metadata: { ticketId, reasonCode: TENANT_EVIDENCE_OVERDUE_REASON },
        read: false,
        pushDeliveryState: "PENDING",
        deliverySource: "server:flagStalledTenantEvidenceTickets",
        createdAt: now,
      })));
}

/** Removes the overdue reason once the tenant's photos arrive (dispatch itself is unchanged). */
export async function clearTenantEvidenceOverdue(
  db: FirebaseFirestore.Firestore,
  ticketRef: FirebaseFirestore.DocumentReference,
): Promise<boolean> {
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ticketRef);
    const data = snap.data() || {};
    if (!snap.exists || data.evidenceStatus !== "TENANT_EVIDENCE_UPLOADED") return false;
    if (data.assignmentReasonCode !== TENANT_EVIDENCE_OVERDUE_REASON) return false;
    transaction.update(ticketRef, {
      assignmentReasonCode: FieldValue.delete(),
      assignmentError: FieldValue.delete(),
      assignmentDiagnostics: FieldValue.delete(),
      evidenceOverdueResolvedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

export const tenantEvidenceStallSweep = onSchedule("every 15 minutes", async () => {
  const result = await flagStalledTenantEvidenceTickets({ db: admin.firestore() });
  console.log(`[tenant-evidence-stall] scanned=${result.scanned} flagged=${result.flagged}`);
});

export const clearTenantEvidenceOverdueOnUpload = onDocumentUpdated("maintenanceTickets/{ticketId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!after || !after.evidenceOverdueAt) return;
  if (before?.evidenceStatus === "TENANT_EVIDENCE_UPLOADED" || after.evidenceStatus !== "TENANT_EVIDENCE_UPLOADED") return;
  await clearTenantEvidenceOverdue(admin.firestore(), event.data!.after.ref);
});
