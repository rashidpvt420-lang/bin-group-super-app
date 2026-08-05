import { FieldValue } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
import { normalizeMaintenanceTicketStatus } from "./shared/maintenanceTicketLifecycle";

if (!admin.apps.length) {
  admin.initializeApp();
}

function cleanString(value: unknown): string {
  return String(value || "").trim();
}

function normalizeStatus(value: unknown): string | null {
  const status = cleanString(value);
  if (!status) return null;
  const upper = normalizeMaintenanceTicketStatus(status);

  // Assignment and acceptance are distinct security events. Never let the
  // compatibility normalizer manufacture acceptance without the callable's
  // server-authored acceptedAt evidence.
  // Write one canonical status vocabulary. Read paths still accept legacy
  // lowercase aliases, but rewriting new server states back to lowercase can
  // hide an assignment from the Technician UI and break the next lifecycle
  // transition (for example ON_THE_WAY -> ARRIVED).
  if (["DISPATCHED", "ASSIGNED", "TECHNICIAN_ASSIGNED"].includes(upper)) return "ASSIGNED";
  if (["EN_ROUTE", "ON_THE_WAY", "LIVE_TRACKING"].includes(upper)) return "ON_THE_WAY";
  if (upper === "ARRIVED") return "ARRIVED";
  if (["IN_PROGRESS", "WORK_STARTED"].includes(upper)) return "IN_PROGRESS";
  if (upper === "WAITING_PARTS") return "WAITING_PARTS";
  if (["COMPLETED", "RESOLVED", "CLOSED"].includes(upper)) return "COMPLETED";
  if (upper === "OPEN") return "OPEN";

  return status;
}

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const text = cleanString(value);
    if (text) return text;
  }
  return "";
}

function canonicalLocation(...values: any[]) {
  for (const value of values) {
    if (!value) continue;
    const lat = Number(value.lat ?? value.latitude);
    const lng = Number(value.lng ?? value.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
      return {
        ...value,
        lat,
        lng,
        latitude: lat,
        longitude: lng,
      };
    }
  }
  return null;
}

export const normalizeMaintenanceTicketDispatchFields = onDocumentWritten("maintenanceTickets/{ticketId}", async (event) => {
  const afterSnap = event.data?.after;
  if (!afterSnap?.exists) return null;

  const data = afterSnap.data() || {};
  const patch: Record<string, unknown> = {};

  const assignedTechnicianId = firstNonEmpty(
    data.assignedTechnicianId,
    data.technicianId,
    data.technicianUid,
    data.assignedTechId,
    data.assignedTechUid,
  );

  if (assignedTechnicianId) {
    if (data.assignedTechnicianId !== assignedTechnicianId) patch.assignedTechnicianId = assignedTechnicianId;
    if (data.technicianId !== assignedTechnicianId) patch.technicianId = assignedTechnicianId;
    if (data.technicianUid !== assignedTechnicianId) patch.technicianUid = assignedTechnicianId;
    if (data.assignedTechId !== assignedTechnicianId) patch.assignedTechId = assignedTechnicianId;
  }

  const assignedName = firstNonEmpty(data.assignedTechnicianName, data.assignedTechnician, data.technicianName, data.assignedTechName);
  if (assignedName) {
    if (data.assignedTechnicianName !== assignedName) patch.assignedTechnicianName = assignedName;
    if (data.assignedTechnician !== assignedName) patch.assignedTechnician = assignedName;
  }

  const normalizedStatus = normalizeStatus(data.status);
  if (normalizedStatus && data.status !== normalizedStatus) patch.status = normalizedStatus;

  const techLocation = canonicalLocation(data.technicianLocation, data.techLocation, data.currentTechnicianLocation, data.driverLocation);
  if (techLocation) {
    const currentTechLocation = canonicalLocation(data.technicianLocation);
    const currentLegacyLocation = canonicalLocation(data.techLocation);
    if (!currentTechLocation || currentTechLocation.lat !== techLocation.lat || currentTechLocation.lng !== techLocation.lng) {
      patch.technicianLocation = techLocation;
    }
    if (!currentLegacyLocation || currentLegacyLocation.lat !== techLocation.lat || currentLegacyLocation.lng !== techLocation.lng) {
      patch.techLocation = techLocation;
    }
  }

  const jobLocation = canonicalLocation(data.jobLocation, data.propertyLocation, data.location, data.geo);
  if (jobLocation) {
    const currentJobLocation = canonicalLocation(data.jobLocation);
    if (!currentJobLocation || currentJobLocation.lat !== jobLocation.lat || currentJobLocation.lng !== jobLocation.lng) {
      patch.jobLocation = jobLocation;
    }
  }

  if (!Object.keys(patch).length) return null;

  patch.normalizedAt = FieldValue.serverTimestamp();
  patch.normalizedBy = "normalizeMaintenanceTicketDispatchFields";

  await afterSnap.ref.set(patch, { merge: true });
  return null;
});
