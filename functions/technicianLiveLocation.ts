import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const ACTIVE_TRACKING_STATUSES = new Set([
  "ASSIGNED",
  "ACCEPTED",
  "EN_ROUTE",
  "ON_THE_WAY",
  "ARRIVED",
  "IN_PROGRESS",
  "WORK_STARTED",
]);
const APPROVED_PROFILE_STATUSES = new Set(["active", "approved"]);
const BLOCKED_PROFILE_STATUSES = new Set([
  "blocked",
  "disabled",
  "inactive",
  "rejected",
  "revoked",
  "suspended",
  "terminated",
]);

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
const upper = (value: unknown) => String(value || "").trim().toUpperCase();

function technicianRole(auth: any) {
  const token = auth?.token || {};
  return normalize(token.role || token.userRole || token.primaryRole);
}

function requireTechnician(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Technician login required.");
  const role = technicianRole(auth);
  if (role !== "technician" && role !== "tech" && auth.token?.technician !== true) {
    throw new HttpsError("permission-denied", "Only a Technician account can publish live location.");
  }
}

function profileStatus(data: FirebaseFirestore.DocumentData) {
  return normalize(data.status || data.accountStatus || data.profileStatus);
}

function approvedTechnicianProfile(data: FirebaseFirestore.DocumentData) {
  const status = profileStatus(data);
  const approvalStatus = normalize(data.approvalStatus || data.verificationStatus);
  if (
    data.suspended === true ||
    data.disabled === true ||
    data.isDisabled === true ||
    BLOCKED_PROFILE_STATUSES.has(status) ||
    BLOCKED_PROFILE_STATUSES.has(approvalStatus)
  ) {
    return false;
  }
  return APPROVED_PROFILE_STATUSES.has(status) || approvalStatus === "approved";
}

function profileAllowsIdentityAccess(data: FirebaseFirestore.DocumentData) {
  const status = profileStatus(data);
  return data.suspended !== true &&
    data.disabled !== true &&
    data.isDisabled !== true &&
    !BLOCKED_PROFILE_STATUSES.has(status);
}

async function assertTechnicianLiveLocationEligibility(uid: string) {
  const [authUser, technicianSnap, userSnap] = await Promise.all([
    admin.auth().getUser(uid),
    db.collection("technicians").doc(uid).get(),
    db.collection("users").doc(uid).get(),
  ]);

  if (
    authUser.disabled ||
    authUser.customClaims?.suspended === true ||
    authUser.customClaims?.disabled === true
  ) {
    throw new HttpsError("permission-denied", "This Technician account is disabled or suspended.");
  }
  if (!technicianSnap.exists || !approvedTechnicianProfile(technicianSnap.data() || {})) {
    throw new HttpsError("permission-denied", "An active approved Technician profile is required for live GPS.");
  }
  if (userSnap.exists && !profileAllowsIdentityAccess(userSnap.data() || {})) {
    throw new HttpsError("permission-denied", "This Technician identity profile is disabled or suspended.");
  }
}

function assignedTechnicianId(data: FirebaseFirestore.DocumentData) {
  return String(
    data.assignedTechnicianId ||
      data.technicianId ||
      data.assignedTechId ||
      data.technicianUid ||
      data.techId ||
      "",
  ).trim();
}

function finiteNumber(value: unknown, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new HttpsError("invalid-argument", `${label} must be a finite number.`);
  return parsed;
}

function requireCoordinate(value: unknown, label: "latitude" | "longitude") {
  const parsed = finiteNumber(value, label);
  const valid = label === "latitude"
    ? parsed >= -90 && parsed <= 90
    : parsed >= -180 && parsed <= 180;
  if (!valid) throw new HttpsError("invalid-argument", `${label} is outside the valid coordinate range.`);
  return parsed;
}

function requireSessionId(value: unknown) {
  const sessionId = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(sessionId)) {
    throw new HttpsError("invalid-argument", "A valid tracking session ID is required.");
  }
  return sessionId;
}

export const updateTechnicianLiveLocation = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    requireTechnician(request.auth);

    const technicianUid = request.auth!.uid;
    const action = upper(request.data?.action || "UPDATE");
    const ticketId = String(request.data?.ticketId || "").trim();
    if (!ticketId) throw new HttpsError("invalid-argument", "Ticket ID is required.");
    if (action !== "UPDATE" && action !== "STOP") {
      throw new HttpsError("invalid-argument", "Action must be UPDATE or STOP.");
    }
    await assertTechnicianLiveLocationEligibility(technicianUid);

    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    const liveRef = db.collection("technician_live_locations").doc(technicianUid);
    const technicianRef = db.collection("technicians").doc(technicianUid);
    const userRef = db.collection("users").doc(technicianUid);
    const diagnosticRef = technicianRef.collection("deviceReadiness").doc("gps");
    const auditRef = db.collection("audit_logs").doc();

    const result = await db.runTransaction(async (tx) => {
      const [ticketSnap, liveSnap] = await Promise.all([tx.get(ticketRef), tx.get(liveRef)]);
      if (!ticketSnap.exists) throw new HttpsError("not-found", "Assigned mission not found.");

      const ticket = ticketSnap.data() || {};
      if (assignedTechnicianId(ticket) !== technicianUid) {
        throw new HttpsError("permission-denied", "You are not assigned to this mission.");
      }

      const now = admin.firestore.Timestamp.now();
      const previous = liveSnap.data() || {};
      const previousSequence = Math.max(0, Number(previous.sequence || 0));

      if (action === "STOP") {
        const trackingSessionId = String(request.data?.trackingSessionId || previous.trackingSessionId || "").trim() || null;
        tx.set(liveRef, {
          technicianUid,
          activeTicketId: null,
          isTracking: false,
          trackingSessionId,
          stopReason: "TECHNICIAN_REQUESTED",
          stoppedAt: now,
          serverUpdatedAt: now,
          expiresAt: now,
          sequence: previousSequence,
          source: "technician-callable",
        }, { merge: true });
        tx.set(technicianRef, {
          activeTicketId: null,
          isTracking: false,
          liveLocationRef: liveRef.path,
          locationUpdatedAt: now,
          updatedAt: now,
        }, { merge: true });
        tx.set(userRef, {
          activeTicketId: null,
          isTracking: false,
          liveLocationRef: liveRef.path,
          locationUpdatedAt: now,
          updatedAt: now,
        }, { merge: true });
        tx.set(ticketRef, {
          trackingStatus: "STOPPED",
          technicianLocationExpiresAt: now,
          updatedAt: now,
        }, { merge: true });
        tx.set(diagnosticRef, {
          ticketId,
          status: "STOPPED",
          stopReason: "TECHNICIAN_REQUESTED",
          trackingSessionId,
          stoppedAt: now,
          updatedAt: now,
        }, { merge: true });
        tx.set(auditRef, {
          actorId: technicianUid,
          actorRole: "technician",
          action: "TECHNICIAN_LIVE_LOCATION_STOPPED",
          targetType: "maintenanceTickets",
          targetId: ticketId,
          trackingSessionId,
          createdAt: now,
        });
        return { action, sequence: previousSequence, expiresAtMs: now.toMillis() };
      }

      if (!ACTIVE_TRACKING_STATUSES.has(upper(ticket.status || ticket.trackingStatus))) {
        throw new HttpsError("failed-precondition", "Live GPS is allowed only for an active assigned mission.");
      }

      const latitude = requireCoordinate(request.data?.latitude ?? request.data?.lat, "latitude");
      const longitude = requireCoordinate(request.data?.longitude ?? request.data?.lng, "longitude");
      const accuracy = finiteNumber(request.data?.accuracy, "accuracy");
      if (accuracy <= 0 || accuracy > 100) {
        throw new HttpsError("failed-precondition", "GPS accuracy must be between 0 and 100 metres.");
      }

      const trackingSessionId = requireSessionId(request.data?.trackingSessionId);
      if (
        previous.isTracking === true &&
        previous.activeTicketId &&
        previous.activeTicketId !== ticketId &&
        previous.expiresAt?.toMillis?.() > now.toMillis()
      ) {
        throw new HttpsError("failed-precondition", "Another live tracking session is still active.");
      }

      const deviceTimestampMs = Math.max(0, finiteNumber(request.data?.deviceTimestampMs || Date.now(), "deviceTimestampMs"));
      const previousDeviceTimestampMs = Math.max(0, Number(previous.location?.deviceTimestampMs || 0));
      if (
        previous.isTracking === true &&
        previous.trackingSessionId === trackingSessionId &&
        deviceTimestampMs <= previousDeviceTimestampMs
      ) {
        throw new HttpsError("failed-precondition", "This GPS coordinate is older than the current canonical location.");
      }
      const expiresAt = admin.firestore.Timestamp.fromMillis(now.toMillis() + 90_000);
      const sequence = previousSequence + 1;
      const point = {
        lat: latitude,
        lng: longitude,
        latitude,
        longitude,
        accuracy,
        heading: request.data?.heading == null ? null : finiteNumber(request.data.heading, "heading"),
        speed: request.data?.speed == null ? null : Math.max(0, finiteNumber(request.data.speed, "speed")),
        deviceTimestampMs,
        serverUpdatedAt: now,
      };

      tx.set(liveRef, {
        technicianUid,
        technicianName: String(ticket.assignedTechnicianName || request.auth?.token?.name || "Technician"),
        activeTicketId: ticketId,
        propertyId: String(ticket.propertyId || "") || null,
        ownerId: String(ticket.ownerId || ticket.ownerUid || "") || null,
        tenantId: String(ticket.tenantId || ticket.tenantUid || "") || null,
        isTracking: true,
        trackingSessionId,
        sequence,
        location: point,
        serverUpdatedAt: now,
        expiresAt,
        stopReason: null,
        source: "technician-callable",
      }, { merge: true });

      tx.set(ticketRef, {
        technicianLocation: point,
        technicianLocationRef: liveRef.path,
        technicianLocationUpdatedAt: now,
        technicianLocationExpiresAt: expiresAt,
        trackingStatus: "LIVE_TRACKING",
        updatedAt: now,
      }, { merge: true });
      tx.set(technicianRef, {
        currentLocation: point,
        lastLocation: point,
        liveLocationRef: liveRef.path,
        locationUpdatedAt: now,
        activeTicketId: ticketId,
        isTracking: true,
        lastSeenAt: now,
        updatedAt: now,
      }, { merge: true });
      tx.set(userRef, {
        currentLocation: point,
        lastLocation: point,
        liveLocationRef: liveRef.path,
        locationUpdatedAt: now,
        activeTicketId: ticketId,
        isTracking: true,
        lastSeenAt: now,
        updatedAt: now,
      }, { merge: true });
      tx.set(diagnosticRef, {
        ticketId,
        status: "LIVE",
        trackingSessionId,
        sequence,
        accuracy,
        lastSuccessfulPushAt: now,
        expiresAt,
        updatedAt: now,
      }, { merge: true });

      return { action, sequence, expiresAtMs: expiresAt.toMillis() };
    });

    return {
      status: "SUCCESS",
      technicianId: technicianUid,
      ticketId,
      ...result,
    };
  },
);

export const reconcileExpiredTechnicianLiveLocations = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "Etc/UTC",
    region: "europe-west3",
    timeoutSeconds: 300,
    memory: "256MiB",
  },
  async () => {
    const now = admin.firestore.Timestamp.now();
    const stale = await db.collection("technician_live_locations")
      .where("isTracking", "==", true)
      .where("expiresAt", "<=", now)
      .limit(50)
      .get();

    if (stale.empty) {
      console.log("[technician-live-location-watchdog] no expired tracking session");
      return;
    }

    const batch = db.batch();
    for (const snapshot of stale.docs) {
      const data = snapshot.data() || {};
      const technicianUid = String(data.technicianUid || snapshot.id).trim();
      const ticketId = String(data.activeTicketId || "").trim();
      const trackingSessionId = String(data.trackingSessionId || "").trim() || null;
      const technicianRef = db.collection("technicians").doc(technicianUid);
      const userRef = db.collection("users").doc(technicianUid);
      const diagnosticRef = technicianRef.collection("deviceReadiness").doc("gps");
      const auditRef = db.collection("audit_logs").doc();

      batch.set(snapshot.ref, {
        activeTicketId: null,
        isTracking: false,
        stopReason: "SERVER_EXPIRY_WATCHDOG",
        stoppedAt: now,
        reconciledAt: now,
        serverUpdatedAt: now,
        expiresAt: now,
      }, { merge: true });
      batch.set(technicianRef, {
        activeTicketId: null,
        isTracking: false,
        locationUpdatedAt: now,
        trackingReconciledAt: now,
        updatedAt: now,
      }, { merge: true });
      batch.set(userRef, {
        activeTicketId: null,
        isTracking: false,
        locationUpdatedAt: now,
        trackingReconciledAt: now,
        updatedAt: now,
      }, { merge: true });
      batch.set(diagnosticRef, {
        ticketId: ticketId || null,
        status: "STOPPED_STALE",
        stopReason: "SERVER_EXPIRY_WATCHDOG",
        trackingSessionId,
        stoppedAt: now,
        updatedAt: now,
      }, { merge: true });
      if (ticketId) {
        batch.set(db.collection("maintenanceTickets").doc(ticketId), {
          trackingStatus: "STOPPED_STALE",
          technicianLocationExpiresAt: now,
          trackingReconciledAt: now,
          updatedAt: now,
        }, { merge: true });
      }
      batch.set(auditRef, {
        actorId: "system",
        actorRole: "system",
        action: "TECHNICIAN_LIVE_LOCATION_EXPIRED",
        targetType: "maintenanceTickets",
        targetId: ticketId || snapshot.id,
        technicianUid,
        trackingSessionId,
        createdAt: now,
      });
    }

    await batch.commit();
    console.log(`[technician-live-location-watchdog] reconciled=${stale.size}`);
  },
);
