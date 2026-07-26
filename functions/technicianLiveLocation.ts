import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";

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
        source: "technician-callable",
      }, { merge: true });

      // Compatibility mirrors are updated in the same server transaction. The
      // canonical source remains technician_live_locations/{technicianUid}.
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
