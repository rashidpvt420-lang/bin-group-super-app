import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const ADMIN_ROLES = new Set(["admin", "super_admin", "operations_admin", "operations_manager", "dispatcher"]);
const CLOSED_STATUSES = new Set(["COMPLETED", "CLOSED", "CANCELLED", "REJECTED"]);
const ACTIVE_STATUSES = new Set(["ACCEPTED", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"]);
const role = (value: unknown) => String(value || "").trim().toLowerCase();
const text = (value: unknown, max = 180) => String(value || "").trim().slice(0, max);
const firstPresent = (...values: unknown[]) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");

function requireDispatcher(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Dispatcher login required.");
  const token = auth.token || {};
  const callerRole = role(token.role || token.userRole || token.primaryRole);
  const permissions = token.permissions || {};
  if (token.admin === true || token.isAdmin === true || ADMIN_ROLES.has(callerRole) || permissions.canDispatchJobs === true) return;
  throw new HttpsError("permission-denied", "Dispatch permission is required.");
}

function millis(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? (value < 10_000_000_000 ? value * 1000 : value) : null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "object") {
    const candidate = value as { toMillis?: () => number; seconds?: number; _seconds?: number };
    if (typeof candidate.toMillis === "function") return candidate.toMillis();
    const seconds = candidate.seconds ?? candidate._seconds;
    if (Number.isFinite(seconds)) return Number(seconds) * 1000;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function credentialValid(statusValue: unknown, expiryValue: unknown, nowMs: number) {
  const expiryMs = millis(expiryValue);
  if (expiryMs !== null && expiryMs <= nowMs) return false;
  const status = role(statusValue ?? expiryValue);
  return ["valid", "verified", "approved", "active", "current"].includes(status);
}

function approvedAndReadyTechnician(user: FirebaseFirestore.DocumentData, technician: FirebaseFirestore.DocumentData, userExists: boolean, technicianExists: boolean, nowMs = Date.now()) {
  const profiles = [...(userExists ? [user] : []), ...(technicianExists ? [technician] : [])];
  if (!profiles.length) return { ready: false, failures: ["profile"] };
  if (userExists && role(user.role) !== "technician") return { ready: false, failures: ["role"] };
  if (profiles.some((profile) => profile.suspended === true || ["suspended", "rejected", "disabled", "inactive"].includes(role(profile.status)))) return { ready: false, failures: ["account status"] };
  const approved = profiles.some((profile) => ["active", "approved"].includes(role(profile.status)) || role(profile.approvalStatus) === "approved");
  const merged = { ...user, ...technician };
  const certifications = [
    ...(Array.isArray(user.certifications) ? user.certifications : []),
    ...(Array.isArray(technician.certifications) ? technician.certifications : []),
  ];
  const medicalValid = credentialValid(firstPresent(merged.medicalCardStatus, merged.medicalStatus, merged.healthCardStatus), firstPresent(merged.medicalCardExpiry, merged.medicalExpiry, merged.healthCardExpiry), nowMs);
  const licenceValid = credentialValid(firstPresent(merged.drivingLicenseStatus, merged.licenseStatus), firstPresent(merged.drivingLicenseExpiry, merged.licenseExpiry), nowMs);
  const certificationsValid = certifications.length > 0
    ? certifications.every((item: any) => credentialValid(firstPresent(item.status, item.verificationStatus, item.approvalStatus), firstPresent(item.expiryAt, item.expiresAt, item.expiryDate, item.expiry, item.validUntil, item.validTo), nowMs))
    : credentialValid(firstPresent(merged.certificationsStatus, merged.certificationStatus, merged.certificateStatus), null, nowMs);
  const currentShiftId = text(firstPresent(merged.currentShiftId, merged.activeShiftId), 160);
  const shiftStatus = role(firstPresent(merged.shiftStatus, merged.currentShiftStatus, merged.dutyStatus));
  const activeShift = Boolean(currentShiftId) && !["ended", "closed", "cancelled", "off_duty"].includes(shiftStatus);
  const deviceReady = merged.deviceRegistered === true || merged.deviceVerified === true || Boolean(text(firstPresent(merged.registeredDeviceId, merged.currentDeviceId, merged.deviceId), 180));
  const gpsAt = millis(firstPresent(merged.lastGpsAt, merged.lastLocationAt, merged.locationUpdatedAt, merged.gpsUpdatedAt));
  const gpsFresh = gpsAt !== null && nowMs - gpsAt >= 0 && nowMs - gpsAt <= Math.max(60_000, Number(merged.gpsMaxAgeMs || 15 * 60_000));
  const dutyStatus = role(firstPresent(merged.dutyStatus, merged.shiftStatus));
  const onDuty = merged.onDuty === true || ["on_duty", "active", "available"].includes(dutyStatus);
  const available = merged.isAvailable !== false && merged.available !== false;
  const failures = [
    !approved ? "approval" : null,
    !medicalValid ? "medical card" : null,
    !licenceValid ? "driving licence" : null,
    !certificationsValid ? "required certifications" : null,
    !activeShift ? "active shift" : null,
    !deviceReady ? "registered device" : null,
    !gpsFresh ? "fresh GPS location" : null,
    !onDuty ? "on-duty status" : null,
    !available ? "dispatch availability" : null,
  ].filter(Boolean) as string[];
  return { ready: failures.length === 0, failures };
}

export const adminAssignTechnician = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    requireDispatcher(request.auth);
    const ticketId = text(request.data?.ticketId, 160);
    const technicianId = text(request.data?.technicianId, 160);
    const reassignmentReason = text(request.data?.reassignmentReason, 500);
    if (!ticketId || !technicianId) throw new HttpsError("invalid-argument", "ticketId and technicianId are required.");

    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    const userRef = db.collection("users").doc(technicianId);
    const technicianRef = db.collection("technicians").doc(technicianId);
    const auditRef = db.collection("audit_logs").doc();
    const now = FieldValue.serverTimestamp();
    let idempotent = false;

    await db.runTransaction(async (transaction) => {
      const [ticketSnap, userSnap, technicianSnap] = await Promise.all([
        transaction.get(ticketRef),
        transaction.get(userRef),
        transaction.get(technicianRef),
      ]);
      if (!ticketSnap.exists) throw new HttpsError("not-found", "Ticket not found.");
      if (!userSnap.exists && !technicianSnap.exists) throw new HttpsError("not-found", "Technician profile not found.");
      const ticket = ticketSnap.data() || {};
      const user = userSnap.data() || {};
      const technician = technicianSnap.data() || {};
      const readiness = approvedAndReadyTechnician(user, technician, userSnap.exists, technicianSnap.exists);
      if (!readiness.ready) {
        throw new HttpsError("failed-precondition", `Technician dispatch readiness failed: ${readiness.failures.join(", ")}.`, { failures: readiness.failures });
      }
      if (!text(ticket.propertyId) || !text(ticket.unitId || ticket.unitNumber || ticket.unit)) throw new HttpsError("failed-precondition", "Ticket must be linked to a property and unit before dispatch.");

      const currentStatus = text(ticket.status, 60).toUpperCase();
      if (CLOSED_STATUSES.has(currentStatus)) throw new HttpsError("failed-precondition", "Closed or cancelled tickets cannot be dispatched.");
      const previousTechnicianId = text(ticket.assignedTechnicianId || ticket.technicianId || ticket.techId, 160);
      if (previousTechnicianId === technicianId) { idempotent = true; return; }
      const isReassignment = Boolean(previousTechnicianId && previousTechnicianId !== technicianId);
      if (isReassignment && ACTIVE_STATUSES.has(currentStatus) && reassignmentReason.length < 8) throw new HttpsError("failed-precondition", "An audited reassignment reason is required for an accepted or active mission.");

      const capacityProfile = userSnap.exists ? user : technician;
      const currentJobCount = Number(capacityProfile.currentJobCount || capacityProfile.activeJobCount || 0);
      const maxConcurrentJobs = Math.max(1, Number(capacityProfile.maxConcurrentJobs || capacityProfile.workloadCapacity || 3));
      if (currentJobCount >= maxConcurrentJobs) throw new HttpsError("resource-exhausted", "Technician has reached the concurrent mission limit.");
      const previousUserRef = isReassignment ? db.collection("users").doc(previousTechnicianId) : null;
      const previousUserSnap = previousUserRef ? await transaction.get(previousUserRef) : null;

      transaction.set(ticketRef, {
        assignedTechnicianId: technicianId,
        technicianId,
        assignedTechnicianName: text(technician.displayName || technician.name || user.displayName || user.name || "Technician", 180),
        status: "ASSIGNED",
        technicianStatus: "ASSIGNED",
        dispatchStatus: "ASSIGNED",
        trackingStatus: "TECHNICIAN_ASSIGNED",
        assignedAt: now,
        assignedBy: request.auth!.uid,
        assignmentReadinessVerifiedAt: now,
        assignmentReadinessVersion: "TECH_READINESS_V2",
        reassignmentReason: isReassignment ? reassignmentReason : null,
        updatedAt: now,
      }, { merge: true });
      transaction.set(userSnap.exists ? userRef : technicianRef, { currentJobCount: currentJobCount + 1, updatedAt: now }, { merge: true });
      if (previousUserRef && previousUserSnap?.exists) transaction.set(previousUserRef, { currentJobCount: Math.max(0, Number(previousUserSnap.data()?.currentJobCount || 0) - 1), updatedAt: now }, { merge: true });
      transaction.set(auditRef, {
        action: isReassignment ? "ADMIN_REASSIGN_READY_TECHNICIAN" : "ADMIN_ASSIGN_READY_TECHNICIAN",
        actorId: request.auth!.uid,
        actorRole: role(request.auth!.token?.role || request.auth!.token?.userRole || request.auth!.token?.primaryRole || "dispatcher"),
        ticketId,
        technicianId,
        previousTechnicianId: previousTechnicianId || null,
        readinessVersion: "TECH_READINESS_V2",
        readinessFailures: [],
        reassignmentReason: isReassignment ? reassignmentReason : null,
        createdAt: now,
      });
    });

    return { ok: true, ticketId, technicianId, status: "ASSIGNED", idempotent, readinessVersion: "TECH_READINESS_V2" };
  },
);
