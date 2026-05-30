import { onDocumentWritten } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

function cleanString(value: unknown): string {
  return String(value || "").trim();
}

function normalizeStatus(value: unknown): string | null {
  const status = cleanString(value);
  if (!status) return null;
  const upper = status.toUpperCase();

  if (["DISPATCHED", "ASSIGNED", "TECHNICIAN_ASSIGNED"].includes(upper)) return "accepted";
  if (["EN_ROUTE", "ON_THE_WAY", "LIVE_TRACKING"].includes(upper)) return "on_the_way";
  if (upper === "ARRIVED") return "arrived";
  if (["IN_PROGRESS", "WORK_STARTED"].includes(upper)) return "in_progress";
  if (upper === "WAITING_PARTS") return "waiting_parts";
  if (["COMPLETED", "RESOLVED", "CLOSED"].includes(upper)) return "completed";
  if (upper === "OPEN") return "open";

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

  patch.normalizedAt = admin.firestore.FieldValue.serverTimestamp();
  patch.normalizedBy = "normalizeMaintenanceTicketDispatchFields";

  await afterSnap.ref.set(patch, { merge: true });
  return null;
});
