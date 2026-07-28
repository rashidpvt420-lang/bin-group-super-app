import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const PAGE_SIZE = 100;
const MAX_PAGES_PER_RUN = 5;

const text = (value: unknown) => String(value || "").trim();
const assignedTechnicianId = (ticket: FirebaseFirestore.DocumentData) => text(
  ticket.assignedTechnicianId ||
  ticket.technicianId ||
  ticket.assignedTechId ||
  ticket.technicianUid ||
  ticket.techId,
);

export const reconcileExpiredTechnicianLiveLocationsOverflow = onSchedule(
  {
    schedule: "every 5 minutes",
    timeZone: "Etc/UTC",
    region: "europe-west3",
    timeoutSeconds: 300,
    memory: "256MiB",
  },
  async () => {
    let reconciled = 0;
    let skipped = 0;
    let page = 0;

    while (page < MAX_PAGES_PER_RUN) {
      page += 1;
      const queryNow = admin.firestore.Timestamp.now();
      const stale = await db.collection("technician_live_locations")
        .where("isTracking", "==", true)
        .where("expiresAt", "<=", queryNow)
        .orderBy("expiresAt", "asc")
        .limit(PAGE_SIZE)
        .get();

      if (stale.empty) break;

      for (const snapshot of stale.docs) {
        const didReconcile = await db.runTransaction(async (tx) => {
          const currentSnap = await tx.get(snapshot.ref);
          const current = currentSnap.data() || {};
          const transactionNow = admin.firestore.Timestamp.now();
          const expiryMs = current.expiresAt?.toMillis?.() || 0;
          if (!currentSnap.exists || current.isTracking !== true || !expiryMs || expiryMs > transactionNow.toMillis()) {
            return false;
          }

          const technicianUid = snapshot.id;
          const ticketId = text(current.activeTicketId);
          const trackingSessionId = text(current.trackingSessionId) || null;
          const technicianRef = db.collection("technicians").doc(technicianUid);
          const userRef = db.collection("users").doc(technicianUid);
          const diagnosticRef = technicianRef.collection("deviceReadiness").doc("gps");
          const auditRef = db.collection("audit_logs").doc();
          const ticketRef = ticketId ? db.collection("maintenanceTickets").doc(ticketId) : null;
          const ticketSnap = ticketRef ? await tx.get(ticketRef) : null;
          const ticket = ticketSnap?.data() || {};
          const ticketExpiryMs = ticket.technicianLocationExpiresAt?.toMillis?.() || 0;
          const ticketStillOwnedByExpiredSession = Boolean(
            ticketSnap?.exists &&
            assignedTechnicianId(ticket) === technicianUid &&
            text(ticket.technicianLocationRef) === snapshot.ref.path &&
            ticketExpiryMs > 0 &&
            ticketExpiryMs <= transactionNow.toMillis(),
          );

          tx.set(snapshot.ref, {
            activeTicketId: null,
            isTracking: false,
            lastStoppedTicketId: ticketId || null,
            stopReason: "SERVER_EXPIRY_PAGED_WATCHDOG",
            stoppedAt: transactionNow,
            reconciledAt: transactionNow,
            serverUpdatedAt: transactionNow,
            expiresAt: transactionNow,
          }, { merge: true });
          tx.set(technicianRef, {
            activeTicketId: null,
            isTracking: false,
            locationUpdatedAt: transactionNow,
            trackingReconciledAt: transactionNow,
            updatedAt: transactionNow,
          }, { merge: true });
          tx.set(userRef, {
            activeTicketId: null,
            isTracking: false,
            locationUpdatedAt: transactionNow,
            trackingReconciledAt: transactionNow,
            updatedAt: transactionNow,
          }, { merge: true });
          tx.set(diagnosticRef, {
            ticketId: ticketId || null,
            status: "STOPPED_STALE",
            stopReason: "SERVER_EXPIRY_PAGED_WATCHDOG",
            trackingSessionId,
            stoppedAt: transactionNow,
            updatedAt: transactionNow,
          }, { merge: true });
          if (ticketRef && ticketStillOwnedByExpiredSession) {
            tx.set(ticketRef, {
              trackingStatus: "STOPPED_STALE",
              technicianLocationExpiresAt: transactionNow,
              trackingReconciledAt: transactionNow,
              updatedAt: transactionNow,
            }, { merge: true });
          }
          tx.set(auditRef, {
            actorId: "system",
            actorRole: "system",
            action: "TECHNICIAN_LIVE_LOCATION_EXPIRED_PAGED",
            targetType: ticketStillOwnedByExpiredSession ? "maintenanceTickets" : "technician_live_locations",
            targetId: ticketStillOwnedByExpiredSession ? ticketId : technicianUid,
            technicianUid,
            requestedTicketId: ticketId || null,
            ticketMissing: Boolean(ticketId) && ticketSnap?.exists !== true,
            ticketUpdateApplied: ticketStillOwnedByExpiredSession,
            ticketUpdateSkippedReason: ticketId && !ticketStillOwnedByExpiredSession
              ? "TICKET_REASSIGNED_OR_LOCATION_SESSION_CHANGED"
              : null,
            currentTicketAssignee: assignedTechnicianId(ticket) || null,
            currentTicketLocationRef: text(ticket.technicianLocationRef) || null,
            trackingSessionId,
            createdAt: transactionNow,
          });
          return true;
        });
        if (didReconcile) reconciled += 1;
        else skipped += 1;
      }

      if (stale.size < PAGE_SIZE) break;
    }

    if (page === MAX_PAGES_PER_RUN) {
      const remaining = await db.collection("technician_live_locations")
        .where("isTracking", "==", true)
        .where("expiresAt", "<=", admin.firestore.Timestamp.now())
        .limit(1)
        .get();
      if (!remaining.empty) {
        console.error(`[technician-live-location-paged-watchdog] capacity exceeded after ${MAX_PAGES_PER_RUN * PAGE_SIZE} candidates; next scheduled run will continue`);
      }
    }

    console.log(`[technician-live-location-paged-watchdog] pages=${page} reconciled=${reconciled} skipped=${skipped}`);
  },
);
