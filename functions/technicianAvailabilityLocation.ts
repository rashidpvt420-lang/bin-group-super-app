import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  assertTechnicianLiveLocationEligibility,
  finiteNumber,
  looksLikeReversedUaeLatLng,
  requireCoordinate,
  requireTechnician,
} from "./technicianLiveLocation";
import { approvedAndReadyTechnician } from "./secureAdminTechnicianAssignment";
import { technicianDutyMirrorFromUser, technicianDutyMirrorStale, withTechnicianDutyMirror } from "./technicianDutyMirror";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const GPS_READINESS_FAILURE = "fresh GPS location";
const MAX_AVAILABILITY_GPS_AGE_MS = 5 * 60_000;
const MIN_REPORT_INTERVAL_MS = 15_000;

/**
 * Availability location for an on-duty, dispatch-ready Technician who has no active mission yet.
 *
 * adminAssignTechnician requires a fresh GPS fix, but the only writer of Technician GPS was
 * updateTechnicianLiveLocation, which requires an already-assigned active mission; Firestore rules
 * (correctly) block client writes to users/technicians location fields. So a Technician could never
 * receive a first job. This callable is the server path for that bootstrap:
 *  - App Check enforced, Technician role claim, active approved non-suspended profile (same
 *    eligibility as live mission GPS),
 *  - every dispatch-readiness check except the GPS itself must already pass (approval,
 *    credentials, active shift, registered device, on duty, available),
 *  - validated, fresh, non-zero, non-reversed coordinates with accuracy <= 100 m,
 *  - it never touches an active mission's live tracking session and never sets activeTicketId.
 */
export const reportTechnicianAvailabilityLocation = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    requireTechnician(request.auth);
    const technicianUid = request.auth!.uid;
    await assertTechnicianLiveLocationEligibility(technicianUid);

    const latitude = requireCoordinate(request.data?.latitude ?? request.data?.lat, "latitude");
    const longitude = requireCoordinate(request.data?.longitude ?? request.data?.lng, "longitude");
    if (latitude === 0 && longitude === 0) {
      throw new HttpsError("invalid-argument", "Zero coordinates are not valid Technician GPS evidence.");
    }
    if (looksLikeReversedUaeLatLng(latitude, longitude)) {
      throw new HttpsError("invalid-argument", "Technician latitude and longitude appear reversed for UAE operations.");
    }
    const accuracy = finiteNumber(request.data?.accuracy, "accuracy");
    if (accuracy <= 0 || accuracy > 100) {
      throw new HttpsError("failed-precondition", "GPS accuracy must be between 0 and 100 metres.");
    }
    if (request.data?.nativeLocationMocked === true) {
      throw new HttpsError("failed-precondition", "Mock locations are not accepted as Technician availability GPS.");
    }
    const deviceTimestampMs = finiteNumber(request.data?.deviceTimestampMs, "deviceTimestampMs");

    const userRef = db.collection("users").doc(technicianUid);
    const technicianRef = db.collection("technicians").doc(technicianUid);
    const liveRef = db.collection("technician_live_locations").doc(technicianUid);
    const diagnosticRef = technicianRef.collection("deviceReadiness").doc("gps");
    const auditRef = db.collection("audit_logs").doc();

    return db.runTransaction(async (tx) => {
      const [userSnap, technicianSnap, liveSnap] = await Promise.all([tx.get(userRef), tx.get(technicianRef), tx.get(liveRef)]);
      const now = admin.firestore.Timestamp.now();
      const serverNowMs = now.toMillis();
      if (
        deviceTimestampMs <= 0 ||
        deviceTimestampMs > serverNowMs + 60_000 ||
        serverNowMs - deviceTimestampMs > MAX_AVAILABILITY_GPS_AGE_MS
      ) {
        throw new HttpsError("failed-precondition", "Technician GPS is stale or has an invalid device capture time.");
      }

      const user = userSnap.data() || {};
      const storedTechnician = technicianSnap.data() || {};
      // Duty state is server-authoritative on users/{uid} (browser writes to
      // these fields are rule-denied). Reconcile a stale technicians profile
      // (e.g. available:false / onDuty:false left by provisioning before the
      // duty callables mirrored state) so readiness sees the live duty state.
      const reconcileDutyMirror = userSnap.exists && technicianSnap.exists &&
        technicianDutyMirrorStale(user, storedTechnician);
      const technician = reconcileDutyMirror ? withTechnicianDutyMirror(storedTechnician, user) : storedTechnician;
      const readiness = approvedAndReadyTechnician(user, technician, userSnap.exists, technicianSnap.exists, serverNowMs);
      const blocking = readiness.failures.filter((failure) => failure !== GPS_READINESS_FAILURE);
      if (blocking.length) {
        throw new HttpsError(
          "failed-precondition",
          `Availability location is accepted only from an on-duty, dispatch-ready Technician. Not ready: ${blocking.join(", ")}.`,
          { failures: blocking },
        );
      }

      const live = liveSnap.data() || {};
      const liveExpiresMs = live.expiresAt?.toMillis?.();
      if (live.isTracking === true && Number.isFinite(liveExpiresMs) && liveExpiresMs > serverNowMs) {
        throw new HttpsError(
          "failed-precondition",
          "An active mission tracking session is running; mission GPS is published through live tracking.",
        );
      }

      const previous = technician.availabilityLocation || user.availabilityLocation || {};
      const previousDeviceMs = Number(previous.deviceTimestampMs || 0);
      const previousServerMs = previous.serverUpdatedAt?.toMillis?.();
      if (previousDeviceMs && deviceTimestampMs <= previousDeviceMs) {
        throw new HttpsError("failed-precondition", "This GPS coordinate is older than the last reported availability location.");
      }
      if (Number.isFinite(previousServerMs) && serverNowMs - previousServerMs < MIN_REPORT_INTERVAL_MS) {
        throw new HttpsError("resource-exhausted", "Availability location was reported moments ago; try again shortly.");
      }

      const point = {
        lat: latitude,
        lng: longitude,
        latitude,
        longitude,
        accuracy,
        deviceTimestampMs,
        locationIntegrityMode: "BROWSER_FUNCTIONAL_ONLY",
        locationSource: "technician_availability_report",
        purpose: "DISPATCH_AVAILABILITY",
        serverUpdatedAt: now,
      };
      const profileUpdate = {
        currentLocation: point,
        lastLocation: point,
        availabilityLocation: point,
        lastGpsAt: now,
        locationUpdatedAt: now,
        lastSeenAt: now,
        updatedAt: now,
      };
      if (technicianSnap.exists) {
        tx.set(technicianRef, {
          ...profileUpdate,
          ...(reconcileDutyMirror ? technicianDutyMirrorFromUser(user) : {}),
        }, { merge: true });
      }
      if (userSnap.exists) tx.set(userRef, profileUpdate, { merge: true });
      tx.set(diagnosticRef, {
        status: "AVAILABILITY_REPORTED",
        accuracy,
        lastSuccessfulAvailabilityPushAt: now,
        updatedAt: now,
      }, { merge: true });
      tx.set(auditRef, {
        actorId: technicianUid,
        actorRole: "technician",
        action: "TECHNICIAN_AVAILABILITY_LOCATION_REPORTED",
        targetType: "technicians",
        targetId: technicianUid,
        accuracy,
        createdAt: now,
      });
      return { ok: true, reportedAtMs: serverNowMs, maxAgeMs: 15 * 60_000 };
    });
  },
);
