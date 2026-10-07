/**
 * Manual-dispatch escalation for maintenance tickets that automatic dispatch could not route.
 *
 * Previously attemptAutoAssignment returned silently when no technician matched (and only
 * logged errors), so a complaint could sit OPEN with nobody told. This helper marks the
 * ticket PENDING_MANUAL_DISPATCH with a machine-readable reason, writes one audit record and
 * one in-app/push notification per admin and to the property owner. It is idempotent per
 * ticket and reason code, and never assigns, closes or reprices a ticket.
 */
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const MANUAL_DISPATCH_STATUS = "PENDING_MANUAL_DISPATCH";

export type ManualDispatchReasonCode =
  | "NO_ON_DUTY_TECHNICIANS"
  | "NO_QUALIFIED_TECHNICIAN"
  | "MISSING_PROPERTY_GEO"
  | "TENANT_UNIT_LINK_UNVERIFIED"
  | "DISPATCH_ERROR";

const REASON_TEXT: Record<ManualDispatchReasonCode, string> = {
  NO_ON_DUTY_TECHNICIANS: "No technician is on duty.",
  NO_QUALIFIED_TECHNICIAN: "No on-duty technician covers this emirate and trade with free capacity.",
  MISSING_PROPERTY_GEO: "The property has no verified location or emirate.",
  TENANT_UNIT_LINK_UNVERIFIED: "The tenant is not linked to this unit and property.",
  DISPATCH_ERROR: "Automatic dispatch failed with an internal error.",
};

const ADMIN_ROLES = ["admin", "super_admin", "ceo", "manager", "operations_admin", "dispatcher"];
const text = (value: unknown, max = 200) => String(value ?? "").trim().slice(0, max);

async function adminRecipientIds(db: admin.firestore.Firestore): Promise<string[]> {
  const snaps = await Promise.all(
    ADMIN_ROLES.map((role) => db.collection("users").where("role", "==", role).limit(100).get()),
  );
  return [...new Set(snaps.flatMap((snap) => snap.docs.map((doc) => doc.id)))];
}

export async function escalateManualDispatch(params: {
  db: admin.firestore.Firestore;
  ticketRef: admin.firestore.DocumentReference;
  reasonCode: ManualDispatchReasonCode;
  details?: Record<string, unknown>;
}): Promise<{ escalated: boolean }> {
  const { db, ticketRef, reasonCode } = params;
  const details = params.details || {};
  const reason = REASON_TEXT[reasonCode];
  const now = FieldValue.serverTimestamp();

  const ticket = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ticketRef);
    if (!snap.exists) return null;
    const data = snap.data() || {};
    if (text(data.assignedTechnicianId || data.technicianId)) return null;
    if (data.dispatchStatus === MANUAL_DISPATCH_STATUS && data.assignmentReasonCode === reasonCode) return null;
    transaction.set(ticketRef, {
      dispatchStatus: MANUAL_DISPATCH_STATUS,
      assignmentStatus: "admin_manual_assignment",
      assignmentReasonCode: reasonCode,
      assignmentError: reason,
      assignmentDiagnostics: details,
      trackingStatus: "WAITING_FOR_TECHNICIAN",
      manualDispatchRequiredAt: now,
      updatedAt: now,
    }, { merge: true });
    transaction.create(db.collection("audit_logs").doc(), {
      actorId: "DISPATCH_ENGINE",
      actorRole: "system",
      action: "AUTO_ASSIGN_MANUAL_DISPATCH_REQUIRED",
      targetType: "maintenanceTickets",
      targetId: ticketRef.id,
      metadata: { reasonCode, reason, ...details },
      createdAt: now,
    });
    return data;
  });
  if (!ticket) return { escalated: false };

  const ref8 = ticketRef.id.substring(0, 8).toUpperCase();
  const category = text(ticket.category || ticket.complaintCategory || ticket.trade, 60) || "Maintenance";
  const propertyName = text(ticket.propertyName, 120) || "the property";
  const notifications: Array<{ recipientId: string; recipientRole: string; title: string; body: string; link: string }> = [];
  for (const adminId of await adminRecipientIds(db)) {
    notifications.push({
      recipientId: adminId,
      recipientRole: "admin",
      title: "Complaint needs manual dispatch",
      body: `${category} ticket #${ref8} at ${propertyName} has no technician. ${reason}`,
      link: `/admin/tickets?ticketId=${encodeURIComponent(ticketRef.id)}`,
    });
  }
  const ownerId = text(ticket.ownerId || ticket.ownerUid, 160);
  if (ownerId) {
    notifications.push({
      recipientId: ownerId,
      recipientRole: "owner",
      title: "Arranging a technician",
      body: `${category} ticket #${ref8} at ${propertyName} is waiting for a technician. BIN GROUP operations has been alerted.`,
      link: `/owner/ticket/${encodeURIComponent(ticketRef.id)}`,
    });
  }
  await Promise.allSettled(notifications.map((notification) =>
    db.collection("notifications").doc(`dispatch_${reasonCode.toLowerCase()}_${ticketRef.id}_${notification.recipientId}`.slice(0, 1400)).create({
      ...notification,
      type: "DISPATCH_STUCK",
      ticketId: ticketRef.id,
      metadata: { ticketId: ticketRef.id, reasonCode },
      read: false,
      pushDeliveryState: "PENDING",
      deliverySource: "server:escalateManualDispatch",
      createdAt: now,
    })));
  return { escalated: true };
}
