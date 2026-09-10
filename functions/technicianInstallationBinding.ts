import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { updateTicketLifecycle as securedUpdateTicketLifecycle } from "./secureTechnicianOperations";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const PROJECT_NUMBER = "123413252227";
const ANDROID_APP_ID_RE = new RegExp(`^1:${PROJECT_NUMBER}:android:[a-f0-9]+$`, "i");
const SHA256_RE = /^[0-9a-f]{64}$/;
const MAX_GPS_ACCURACY_METERS = 100;
const MAX_PROPERTY_DISTANCE_METERS = 250;

const text = (value: unknown) => String(value ?? "").trim();
const normalize = (value: unknown) => text(value).toLowerCase();

function assignedTechnicianId(ticket: Record<string, any>) {
  return text(
    ticket.assignedTechnicianId ||
      ticket.technicianId ||
      ticket.assignedTechId ||
      ticket.technicianUid ||
      ticket.techId,
  );
}

function isTechnicianRole(auth: any, user: Record<string, any>, technician: Record<string, any>, technicianExists: boolean) {
  const claims = auth?.token || {};
  const allowed = new Set(["technician", "staff", "field_technician", "maintenance_technician"]);
  const claimRole = normalize(claims.role || claims.userRole || claims.primaryRole);
  const profileRole = normalize(
    technician.role || technician.userRole || technician.primaryRole ||
    user.role || user.userRole || user.primaryRole,
  );
  return allowed.has(claimRole) || allowed.has(profileRole) || technicianExists;
}

function requireAndroidAppCheck(request: any) {
  const appId = text(request?.app?.appId);
  if (!appId || !ANDROID_APP_ID_RE.test(appId)) {
    throw new HttpsError(
      "permission-denied",
      "A verified Firebase Android App Check identity is required for physical device binding.",
    );
  }

  const tokenAppId = text(request?.app?.token?.app_id || request?.app?.token?.sub);
  if (tokenAppId && tokenAppId !== appId) {
    throw new HttpsError("permission-denied", "App Check application identity mismatch.");
  }
  return appId;
}

function validateInstallationInput(data: any) {
  const platform = normalize(data?.platform || data?.arrivalDevicePlatform);
  const installationHash = text(data?.installationHash || data?.arrivalInstallationHash).toLowerCase();
  if (platform !== "android") {
    throw new HttpsError("invalid-argument", "Physical Technician registration requires Android.");
  }
  if (!SHA256_RE.test(installationHash)) {
    throw new HttpsError("invalid-argument", "A valid SHA-256 installation hash is required.");
  }
  return { platform: "android" as const, installationHash };
}

function existingSecureHashes(user: Record<string, any>, technician: Record<string, any>) {
  return [
    text(user.registeredInstallationHash || user.registeredDeviceIdHash).toLowerCase(),
    text(technician.registeredInstallationHash || technician.registeredDeviceIdHash).toLowerCase(),
  ].filter(Boolean);
}

function existingPlatforms(user: Record<string, any>, technician: Record<string, any>) {
  return [text(user.registeredDevicePlatform).toLowerCase(), text(technician.registeredDevicePlatform).toLowerCase()].filter(Boolean);
}

function existingAppIds(user: Record<string, any>, technician: Record<string, any>) {
  return [text(user.registeredAppCheckAppId), text(technician.registeredAppCheckAppId)].filter(Boolean);
}

async function writeRejectedRotationAudit(uid: string, reason: string, appCheckAppId: string) {
  try {
    await db.collection("audit_logs").add({
      recordType: "TECHNICIAN_DEVICE_REGISTRATION",
      action: "TECHNICIAN_DEVICE_ROTATION_REJECTED",
      actorId: uid,
      targetType: "technician",
      targetId: uid,
      metadata: { reason, appCheckAppId, physicalDeviceBound: false },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch {
    // Registration still fails closed even if secondary audit persistence is unavailable.
  }
}

export const registerTechnicianDevice = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Technician login required.");
    const appCheckAppId = requireAndroidAppCheck(request);
    const { installationHash, platform } = validateInstallationInput(request.data || {});
    const uid = request.auth.uid;
    const userRef = db.collection("users").doc(uid);
    const technicianRef = db.collection("technicians").doc(uid);
    const auditRef = db.collection("audit_logs").doc();

    const result = await db.runTransaction(async (transaction) => {
      const [userSnap, technicianSnap] = await Promise.all([
        transaction.get(userRef),
        transaction.get(technicianRef),
      ]);
      const user = userSnap.data() || {};
      const technician = technicianSnap.data() || {};

      if (!isTechnicianRole(request.auth, user, technician, technicianSnap.exists)) {
        throw new HttpsError("permission-denied", "Technician role required.");
      }

      const hashes = existingSecureHashes(user, technician);
      const invalidExistingHash = hashes.some((hash) => !SHA256_RE.test(hash));
      const differentExistingHash = hashes.some((hash) => hash !== installationHash);
      const platforms = existingPlatforms(user, technician);
      const wrongExistingPlatform = platforms.some((value) => value !== platform);
      const appIds = existingAppIds(user, technician);
      const differentAppIdentity = appIds.some((value) => value !== appCheckAppId);

      if (invalidExistingHash || differentExistingHash || wrongExistingPlatform || differentAppIdentity) {
        return {
          accepted: false as const,
          reason: invalidExistingHash
            ? "invalid-existing-registration"
            : differentExistingHash
              ? "different-installation"
              : wrongExistingPlatform
                ? "different-platform"
                : "different-app-check-identity",
        };
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      const firstRegisteredAt = user.deviceRegisteredAt || technician.deviceRegisteredAt || now;
      const initialRegistration = hashes.length === 0;
      const registration = {
        deviceRegistered: true,
        registeredInstallationHash: installationHash,
        registeredDevicePlatform: platform,
        registeredAppCheckAppId: appCheckAppId,
        deviceRegisteredAt: firstRegisteredAt,
        deviceRegistrationVerifiedAt: now,
      };

      transaction.set(userRef, registration, { merge: true });
      transaction.set(technicianRef, registration, { merge: true });
      transaction.set(auditRef, {
        recordType: "TECHNICIAN_DEVICE_REGISTRATION",
        action: initialRegistration
          ? "TECHNICIAN_DEVICE_REGISTRATION_INITIAL"
          : "TECHNICIAN_DEVICE_REGISTRATION_IDEMPOTENT",
        actorId: uid,
        targetType: "technician",
        targetId: uid,
        metadata: {
          platform,
          appCheckAppId,
          installationHashMatched: true,
          initialRegistration,
        },
        createdAt: now,
      });

      return { accepted: true as const, initialRegistration };
    });

    if (!result.accepted) {
      await writeRejectedRotationAudit(uid, result.reason, appCheckAppId);
      throw new HttpsError(
        "failed-precondition",
        "This Technician account is already bound to a different protected installation. Controlled device re-registration is required.",
      );
    }

    return {
      status: "SUCCESS",
      deviceRegistered: true,
      platform,
      initialRegistration: result.initialRegistration,
    };
  },
);

function coordinates(value: any) {
  if (!value || typeof value !== "object") return null;
  const lat = Number(value.lat ?? value._latitude ?? value.latitude?._latitude ?? value.latitude);
  const lng = Number(value.lng ?? value._longitude ?? value.longitude?._longitude ?? value.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function firstCoordinates(...values: any[]) {
  for (const value of values) {
    const resolved = coordinates(value);
    if (resolved) return resolved;
  }
  return null;
}

const radians = (degrees: number) => degrees * Math.PI / 180;
function haversineMeters(left: { lat: number; lng: number }, right: { lat: number; lng: number }) {
  const radius = 6_371_000;
  const deltaLat = radians(right.lat - left.lat);
  const deltaLng = radians(right.lng - left.lng);
  const lat1 = radians(left.lat);
  const lat2 = radians(right.lat);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function assertRegisteredInstallation(
  uid: string,
  user: Record<string, any>,
  technician: Record<string, any>,
  installationHash: string,
  appCheckAppId: string,
) {
  const userHash = text(user.registeredInstallationHash || user.registeredDeviceIdHash).toLowerCase();
  const technicianHash = text(technician.registeredInstallationHash || technician.registeredDeviceIdHash).toLowerCase();
  if (
    user.deviceRegistered !== true ||
    technician.deviceRegistered !== true ||
    userHash !== installationHash ||
    technicianHash !== installationHash ||
    text(user.registeredDevicePlatform).toLowerCase() !== "android" ||
    text(technician.registeredDevicePlatform).toLowerCase() !== "android" ||
    text(user.registeredAppCheckAppId) !== appCheckAppId ||
    text(technician.registeredAppCheckAppId) !== appCheckAppId
  ) {
    throw new HttpsError(
      "failed-precondition",
      `Technician ${uid} installation does not match the protected registered Android installation.`,
    );
  }
}

async function preflightRegisteredInstallation(uid: string, installationHash: string, appCheckAppId: string) {
  const [userSnap, technicianSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("technicians").doc(uid).get(),
  ]);
  if (!userSnap.exists || !technicianSnap.exists) {
    throw new HttpsError("failed-precondition", "Technician device registration is incomplete.");
  }
  assertRegisteredInstallation(uid, userSnap.data() || {}, technicianSnap.data() || {}, installationHash, appCheckAppId);
}

async function persistArrivalBinding(
  uid: string,
  ticketId: string,
  installationHash: string,
  appCheckAppId: string,
) {
  const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
  const userRef = db.collection("users").doc(uid);
  const technicianRef = db.collection("technicians").doc(uid);
  const auditRef = db.collection("audit_logs").doc();

  await db.runTransaction(async (transaction) => {
    const ticketSnap = await transaction.get(ticketRef);
    if (!ticketSnap.exists) throw new HttpsError("not-found", "Mission not found after arrival verification.");
    const ticket = ticketSnap.data() || {};
    const propertyId = text(ticket.propertyId);
    if (!propertyId) throw new HttpsError("failed-precondition", "Arrival property identity is missing.");

    const [userSnap, technicianSnap, propertySnap] = await Promise.all([
      transaction.get(userRef),
      transaction.get(technicianRef),
      transaction.get(db.collection("properties").doc(propertyId)),
    ]);
    if (!userSnap.exists || !technicianSnap.exists || !propertySnap.exists) {
      throw new HttpsError("failed-precondition", "Protected Technician or property registration is incomplete.");
    }

    assertRegisteredInstallation(
      uid,
      userSnap.data() || {},
      technicianSnap.data() || {},
      installationHash,
      appCheckAppId,
    );

    if (assignedTechnicianId(ticket) !== uid) {
      throw new HttpsError("permission-denied", "You are not assigned to this mission.");
    }
    if (text(ticket.status).toUpperCase() !== "ARRIVED") {
      throw new HttpsError("failed-precondition", "Physical binding requires a successfully persisted ARRIVED transition.");
    }
    if (ticket.gpsVerified !== true || text(ticket.onSiteVerification).toUpperCase() !== "GPS_VERIFIED") {
      throw new HttpsError("failed-precondition", "Physical binding requires server-verified arrival GPS.");
    }

    const arrival = coordinates(ticket.arrivedLocation || ticket.technicianLocation);
    const accuracy = Number((ticket.arrivedLocation || ticket.technicianLocation || {}).accuracy);
    if (!arrival || !Number.isFinite(accuracy) || accuracy <= 0 || accuracy > MAX_GPS_ACCURACY_METERS) {
      throw new HttpsError("failed-precondition", "Arrival GPS accuracy does not satisfy the physical binding gate.");
    }
    if (!ticket.arrivedAt) {
      throw new HttpsError("failed-precondition", "Arrival timestamp is missing.");
    }

    const property = propertySnap.data() || {};
    const propertyLocation = firstCoordinates(
      ticket.jobLocation,
      ticket.propertyLocation,
      ticket.serviceLocation,
      property.location,
      property.coordinates,
      property.geo,
      property.geoPoint,
      property.gps,
      property,
    );
    if (!propertyLocation) {
      throw new HttpsError("failed-precondition", "Property GPS coordinates are missing.");
    }
    const propertyDistanceMeters = haversineMeters(arrival, propertyLocation);
    if (!Number.isFinite(propertyDistanceMeters) || propertyDistanceMeters > MAX_PROPERTY_DISTANCE_METERS) {
      throw new HttpsError("failed-precondition", "Arrival location is outside the 250 metre property geofence.");
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.update(ticketRef, {
      physicalDeviceBound: true,
      arrivalInstallationHash: installationHash,
      arrivalDevicePlatform: "android",
      arrivalAppCheckAppId: appCheckAppId,
      physicalDeviceBoundAt: now,
    });
    transaction.set(auditRef, {
      recordType: "TECHNICIAN_PHYSICAL_DEVICE_BINDING",
      action: "TECHNICIAN_ARRIVAL_DEVICE_BOUND",
      actorId: uid,
      targetType: "maintenanceTickets",
      targetId: ticketId,
      metadata: {
        platform: "android",
        appCheckAppId,
        installationHashMatched: true,
        gpsVerified: true,
        gpsAccuracyMeters: accuracy,
        propertyDistanceMeters: Math.round(propertyDistanceMeters * 100) / 100,
      },
      createdAt: now,
    });
  });
}

export const updateTicketLifecycle = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const incoming = { ...(request.data || {}) } as Record<string, any>;
    delete incoming.physicalDeviceBound;

    const requestedStatus = text(incoming.status).toUpperCase();
    if (requestedStatus !== "ARRIVED") {
      delete incoming.arrivalInstallationHash;
      delete incoming.arrivalDevicePlatform;
      const securedHandler = (securedUpdateTicketLifecycle as any)?.run;
      if (typeof securedHandler !== "function") throw new HttpsError("internal", "Technician lifecycle handler unavailable.");
      return securedHandler({ ...request, data: incoming });
    }

    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Technician login required.");
    const appCheckAppId = requireAndroidAppCheck(request);
    const { installationHash } = validateInstallationInput({
      installationHash: incoming.arrivalInstallationHash,
      platform: incoming.arrivalDevicePlatform,
    });
    const ticketId = text(incoming.ticketId);
    if (!ticketId) throw new HttpsError("invalid-argument", "Ticket ID required.");

    await preflightRegisteredInstallation(request.auth.uid, installationHash, appCheckAppId);

    const securedHandler = (securedUpdateTicketLifecycle as any)?.run;
    if (typeof securedHandler !== "function") throw new HttpsError("internal", "Technician lifecycle handler unavailable.");
    const lifecycleResult = await securedHandler({ ...request, data: incoming });

    // The legacy secured lifecycle authority has now independently enforced Auth,
    // Technician readiness, <=100m GPS accuracy and the <=250m property geofence.
    // Re-read those persisted facts and the current device registration before the
    // server derives physicalDeviceBound. A client-supplied boolean has no authority.
    await persistArrivalBinding(request.auth.uid, ticketId, installationHash, appCheckAppId);
    return lifecycleResult;
  },
);
