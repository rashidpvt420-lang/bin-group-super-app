import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  resumeTechnicianDuty as legacyResumeTechnicianDuty,
  acceptTechnicianTicket as legacyAcceptTechnicianTicket,
  updateTicketLifecycle as legacyUpdateTicketLifecycle,
} from "./index";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
const firstPresent = (...values: unknown[]) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");

type TechnicianAction = "RESUME_DUTY" | "ACCEPT_TICKET" | "UPDATE_LIFECYCLE";

function isAdmin(auth: any) {
  const token = auth?.token || {};
  const role = normalize(token.role || token.userRole || token.primaryRole);
  return token.admin === true || token.super_admin === true || token.superAdmin === true || ["admin", "super_admin", "operations_admin"].includes(role);
}

export function technicianCredentialMillis(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "object") {
    const candidate = value as { toMillis?: () => number; seconds?: number; _seconds?: number };
    if (typeof candidate.toMillis === "function") {
      const millis = candidate.toMillis();
      return Number.isFinite(millis) ? millis : null;
    }
    const seconds = candidate.seconds ?? candidate._seconds;
    if (Number.isFinite(seconds)) return Number(seconds) * 1000;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function credentialState(statusValue: unknown, expiryValue: unknown, nowMs: number) {
  const expiryMs = technicianCredentialMillis(expiryValue);
  if (expiryMs !== null && expiryMs <= nowMs) return "expired";
  const status = normalize(statusValue ?? expiryValue);
  if (["valid", "verified", "approved", "active", "current"].includes(status)) return "valid";
  if (["expired", "revoked", "rejected", "invalid", "blocked", "suspended"].includes(status)) return "expired";
  return "pending";
}

function certificationExpiry(value: any) {
  return firstPresent(value?.expiryAt, value?.expiresAt, value?.expiryDate, value?.expiry, value?.validUntil, value?.validTo);
}

export function evaluateTechnicianReadiness(
  merged: Record<string, any>,
  action: TechnicianAction,
  nowMs = Date.now(),
) {
  const medicalExpiry = firstPresent(merged.medicalCardExpiry, merged.medicalExpiry, merged.healthCardExpiry);
  const licenceExpiry = firstPresent(merged.drivingLicenseExpiry, merged.licenseExpiry);
  const medicalState = credentialState(firstPresent(merged.medicalCardStatus, merged.medicalStatus, merged.healthCardStatus), medicalExpiry, nowMs);
  const licenceState = credentialState(firstPresent(merged.drivingLicenseStatus, merged.licenseStatus), licenceExpiry, nowMs);
  const certifications = Array.isArray(merged.certifications) ? merged.certifications : [];
  const certificationState = certifications.length > 0
    ? certifications.every((item) => credentialState(firstPresent(item?.status, item?.verificationStatus, item?.approvalStatus), certificationExpiry(item), nowMs) === "valid")
      ? "valid"
      : "invalid"
    : credentialState(firstPresent(merged.certificationsStatus, merged.certificationStatus, merged.certificateStatus), null, nowMs);

  const currentShiftId = String(firstPresent(merged.currentShiftId, merged.activeShiftId) || "").trim();
  const shiftStatus = normalize(firstPresent(merged.shiftStatus, merged.currentShiftStatus, merged.dutyStatus));
  const hasActiveShift = Boolean(currentShiftId) && !["ended", "closed", "cancelled", "off_duty"].includes(shiftStatus);

  const deviceId = String(firstPresent(merged.registeredDeviceId, merged.currentDeviceId, merged.deviceId) || "").trim();
  const deviceReady = merged.deviceRegistered === true || merged.deviceVerified === true || Boolean(deviceId);

  const gpsAt = technicianCredentialMillis(firstPresent(merged.lastGpsAt, merged.lastLocationAt, merged.locationUpdatedAt, merged.gpsUpdatedAt));
  const gpsMaxAgeMs = Math.max(60_000, Number(merged.gpsMaxAgeMs || 15 * 60_000));
  const gpsFresh = gpsAt !== null && nowMs - gpsAt >= 0 && nowMs - gpsAt <= gpsMaxAgeMs;

  const dutyStatus = normalize(firstPresent(merged.dutyStatus, merged.shiftStatus));
  const onDuty = merged.onDuty === true || ["on_duty", "active", "available"].includes(dutyStatus);
  const available = merged.isAvailable !== false && merged.available !== false;

  const activeJobs = Math.max(0, Number(firstPresent(merged.activeJobCount, merged.activeTicketCount, merged.currentWorkload) || 0));
  const maxJobs = Math.max(1, Number(firstPresent(merged.maxConcurrentJobs, merged.workloadCapacity) || 3));
  const hasCapacity = activeJobs < maxJobs;

  const failures = [
    medicalState !== "valid" ? "medical card" : null,
    licenceState !== "valid" ? "driving licence" : null,
    certificationState !== "valid" ? "required certifications" : null,
    !hasActiveShift ? "active shift" : null,
    !deviceReady ? "registered device" : null,
    !gpsFresh ? "fresh GPS location" : null,
    action !== "RESUME_DUTY" && !onDuty ? "on-duty status" : null,
    action !== "RESUME_DUTY" && !available ? "dispatch availability" : null,
    action !== "RESUME_DUTY" && !hasCapacity ? "workload capacity" : null,
  ].filter(Boolean) as string[];

  return {
    ready: failures.length === 0,
    failures,
    medicalState,
    licenceState,
    certificationState,
    hasActiveShift,
    deviceReady,
    gpsFresh,
    onDuty,
    available,
    activeJobs,
    maxJobs,
  };
}

async function assertTechnicianReadiness(auth: any, action: TechnicianAction, nowMs = Date.now()) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
  if (isAdmin(auth)) return;

  const liveUser = await admin.auth().getUser(auth.uid);
  if (liveUser.disabled || liveUser.customClaims?.suspended === true) {
    throw new HttpsError("permission-denied", "This technician account is disabled or suspended.");
  }

  const [userSnap, technicianSnap] = await Promise.all([
    db.collection("users").doc(auth.uid).get(),
    db.collection("technicians").doc(auth.uid).get(),
  ]);
  const user = userSnap.data() || {};
  const technician = technicianSnap.data() || {};
  const merged = {
    ...user,
    ...technician,
    certifications: [
      ...(Array.isArray(user.certifications) ? user.certifications : []),
      ...(Array.isArray(technician.certifications) ? technician.certifications : []),
    ],
  } as Record<string, any>;

  const readiness = evaluateTechnicianReadiness(merged, action, nowMs);
  if (!readiness.ready) {
    throw new HttpsError(
      "failed-precondition",
      `Technician credentials or readiness controls are missing, pending, or expired: ${readiness.failures.join(", ")}.`,
      { action, failures: readiness.failures },
    );
  }
}

async function runSecured(legacyCallable: any, request: any, action: TechnicianAction) {
  await assertTechnicianReadiness(request.auth, action);
  if (typeof legacyCallable?.run !== "function") {
    throw new HttpsError("internal", "Operational callable handler is unavailable.");
  }
  return legacyCallable.run(request);
}

export const resumeTechnicianDuty = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => runSecured(legacyResumeTechnicianDuty, request, "RESUME_DUTY"),
);

export const acceptTechnicianTicket = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => runSecured(legacyAcceptTechnicianTicket, request, "ACCEPT_TICKET"),
);

export const updateTicketLifecycle = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => runSecured(legacyUpdateTicketLifecycle, request, "UPDATE_LIFECYCLE"),
);
