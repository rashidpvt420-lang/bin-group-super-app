import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

function clean(value: unknown, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function assignedTechnicianId(data: FirebaseFirestore.DocumentData | undefined) {
  if (!data) return "";
  return clean(
    data.assignedTechnicianId ||
      data.technicianId ||
      data.assignedTechId ||
      data.technicianUid ||
      data.techId,
    128,
  );
}

function timestampKey(value: unknown) {
  if (!value) return "missing-time";
  if (typeof (value as any)?.toMillis === "function") {
    return String((value as any).toMillis());
  }
  const seconds = Number((value as any)?.seconds ?? (value as any)?._seconds);
  const nanos = Number((value as any)?.nanoseconds ?? (value as any)?._nanoseconds ?? 0);
  if (Number.isFinite(seconds)) return `${seconds}:${Number.isFinite(nanos) ? nanos : 0}`;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? String(parsed) : clean(value, 120) || "missing-time";
}

function assignmentEventKey(data: FirebaseFirestore.DocumentData | undefined) {
  if (!data) return "missing-event";
  return timestampKey(
    data.assignedAt ||
      data.assignmentUpdatedAt ||
      data.dispatchedAt ||
      data.updatedAt ||
      data.createdAt,
  );
}

function assignmentNotificationId(ticketId: string, technicianId: string, eventKey: string) {
  const digest = crypto
    .createHash("sha256")
    .update(`${ticketId}|${technicianId}|${eventKey}`, "utf8")
    .digest("hex")
    .slice(0, 40);
  return `tech_assignment_${digest}`;
}

async function createAssignmentNotification(
  ticketId: string,
  data: FirebaseFirestore.DocumentData | undefined,
  previousTechnicianId = "",
) {
  const technicianId = assignedTechnicianId(data);
  if (!technicianId || technicianId === previousTechnicianId) return null;

  const eventKey = assignmentEventKey(data);
  const notificationRef = db
    .collection("notifications")
    .doc(assignmentNotificationId(ticketId, technicianId, eventKey));
  const propertyName = clean(data?.propertyName || data?.property?.name || "the assigned property", 120);
  const category = clean(data?.category || data?.complaintCategory || "maintenance", 100);
  const unit = clean(data?.unitNumber || data?.unitLabel || "", 40);
  const body = unit
    ? `${category} mission assigned at ${propertyName}, unit ${unit}.`
    : `${category} mission assigned at ${propertyName}.`;
  const now = FieldValue.serverTimestamp();
  const assignmentFingerprint = crypto
    .createHash("sha256")
    .update(`${ticketId}|${technicianId}|${eventKey}`, "utf8")
    .digest("hex");

  const created = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(notificationRef);
    if (existing.exists) return false;
    transaction.create(notificationRef, {
      recipientId: technicianId,
      recipientRole: "technician",
      type: "TECHNICIAN_JOB_ASSIGNED",
      title: "NEW MISSION ASSIGNED",
      body,
      ticketId,
      link: `/technician/job/${ticketId}`,
      metadata: {
        assignmentSource: clean(data?.assignmentSource || data?.dispatchSource || "dispatch", 80),
        propertyId: clean(data?.propertyId, 128) || null,
        unitId: clean(data?.unitId, 128) || null,
        priority: clean(data?.priority || data?.severity || "normal", 40),
        assignmentEventKey: eventKey,
      },
      read: false,
      createdAt: now,
      createdByUid: "SYSTEM_DISPATCH",
      deliverySource: "trigger:technicianDispatchNotifications",
      assignmentFingerprint,
    });
    return true;
  });

  if (!created) return notificationRef.id;

  await db.collection("audit_logs").add({
    actorId: "SYSTEM_DISPATCH",
    actorRole: "system",
    action: "TECHNICIAN_ASSIGNMENT_NOTIFICATION_CREATED",
    targetType: "maintenanceTickets",
    targetId: ticketId,
    metadata: {
      technicianId,
      notificationId: notificationRef.id,
      assignmentFingerprint,
      sensitiveValuesExcluded: true,
    },
    createdAt: now,
  });

  return notificationRef.id;
}

export const notifyTechnicianOnAssignedTicketCreate = onDocumentCreated(
  { document: "maintenanceTickets/{ticketId}", region: "europe-west3" },
  async (event) => {
    const snap = event.data;
    if (!snap) return null;
    return createAssignmentNotification(event.params.ticketId, snap.data());
  },
);

export const notifyTechnicianOnTicketAssignment = onDocumentUpdated(
  { document: "maintenanceTickets/{ticketId}", region: "europe-west3" },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    return createAssignmentNotification(
      event.params.ticketId,
      after,
      assignedTechnicianId(before),
    );
  },
);

import type * as FirebaseFirestore from "firebase-admin/firestore";