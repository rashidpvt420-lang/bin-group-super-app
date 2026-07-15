import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const text = (value: unknown, max = 1000) => String(value ?? "").trim().slice(0, max);

async function assertOwnerRole(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Owner authentication required.");
  const role = text(auth.token?.role || auth.token?.userRole || auth.token?.primaryRole, 40).toLowerCase();
  const userRecord = await admin.auth().getUser(auth.uid);
  if (
    role !== "owner" ||
    auth.token?.email_verified !== true ||
    auth.token?.suspended === true ||
    userRecord.disabled ||
    !userRecord.emailVerified
  ) {
    throw new HttpsError("permission-denied", "A verified, active owner account is required.");
  }
}

export const ownerCreateMaintenanceTicket = onCall(
  { cors: true, region: "europe-west3" },
  async (request) => {
    await assertOwnerRole(request.auth);
    const ownerUid = request.auth!.uid;
    const propertyId = text(request.data?.propertyId, 160);
    const unitId = text(request.data?.unitId, 160);
    const category = text(request.data?.category, 120);
    const priority = text(request.data?.priority, 40).toLowerCase();
    const description = text(request.data?.description, 3000);
    const specificLocation = text(request.data?.specificLocation, 500);
    if (!propertyId || !category || description.length < 8 || !["normal", "urgent", "emergency"].includes(priority)) {
      throw new HttpsError("invalid-argument", "Property, category, valid priority, and a detailed description are required.");
    }

    const propertyRef = db.collection("properties").doc(propertyId);
    const propertySnap = await propertyRef.get();
    if (!propertySnap.exists) throw new HttpsError("not-found", "Property not found.");
    const property = propertySnap.data() || {};
    if (text(property.ownerId || property.ownerUid, 160) !== ownerUid) {
      throw new HttpsError("permission-denied", "The selected property is not bound to this owner.");
    }

    let unit: FirebaseFirestore.DocumentData = {};
    if (unitId) {
      const unitSnap = await db.collection("units").doc(unitId).get();
      if (!unitSnap.exists || text(unitSnap.data()?.propertyId, 160) !== propertyId) {
        throw new HttpsError("failed-precondition", "The selected unit is not bound to this property.");
      }
      unit = unitSnap.data() || {};
    }

    const sourceLocation = property.location || property.propertyLocation || property.geoPoint || property.geo || {};
    const lat = Number(sourceLocation.lat ?? sourceLocation.latitude);
    const lng = Number(sourceLocation.lng ?? sourceLocation.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
      throw new HttpsError("failed-precondition", "Verified property GPS coordinates are required before dispatch.");
    }

    const ticketRef = db.collection("maintenanceTickets").doc();
    const now = FieldValue.serverTimestamp();
    const ticket = {
      requesterRole: "owner",
      ownerId: ownerUid,
      ownerUid,
      ownerName: text(request.auth?.token?.name || "Owner", 180),
      ownerEmail: text(request.auth?.token?.email, 320).toLowerCase(),
      propertyId,
      propertyName: text(property.propertyName || property.name || propertyId, 240),
      unitId: unitId || null,
      unitNumber: text(unit.unitNumber, 80) || null,
      floor: unit.floorNumber ?? null,
      tenantId: text(unit.tenantId || unit.tenantUid, 160) || null,
      tenantName: text(unit.tenantName, 180) || null,
      category,
      priority,
      description,
      specificLocation,
      photos: [],
      jobLocation: {
        lat,
        lng,
        latitude: lat,
        longitude: lng,
        address: text(property.address || property.addressLine, 500),
        source: "SERVER_PROPERTY_RECORD",
      },
      source: "OWNER_PORTAL_CALLABLE",
      status: "OPEN",
      dispatchStatus: "PENDING_ASSIGNMENT",
      trackingStatus: "WAITING_FOR_TECHNICIAN",
      assignedTechnicianId: null,
      slaMinutes: priority === "emergency" ? 60 : priority === "urgent" ? 240 : 1440,
      createdAt: now,
      updatedAt: now,
    };
    const batch = db.batch();
    batch.create(ticketRef, ticket);
    batch.create(db.collection("audit_logs").doc(`owner_ticket_${ticketRef.id}`), {
      action: "OWNER_MAINTENANCE_TICKET_CREATED",
      actorId: ownerUid,
      actorRole: "owner",
      ticketId: ticketRef.id,
      propertyId,
      priority,
      createdAt: now,
    });
    await batch.commit();
    return { ok: true, ticketId: ticketRef.id };
  },
);

export const ownerAttachMaintenanceEvidence = onCall(
  { cors: true, region: "europe-west3" },
  async (request) => {
    assertOwnerRole(request.auth);
    const ownerUid = request.auth!.uid;
    const ticketId = text(request.data?.ticketId, 160);
    const urls = Array.isArray(request.data?.urls)
      ? request.data.urls.map((value: unknown) => text(value, 2000)).filter((value: string) => value.startsWith("https://")).slice(0, 12)
      : [];
    const paths = Array.isArray(request.data?.paths)
      ? request.data.paths.map((value: unknown) => text(value, 500)).slice(0, 12)
      : [];
    if (!ticketId || urls.length === 0 || urls.length !== paths.length) {
      throw new HttpsError("invalid-argument", "Ticket ID and matching evidence URLs/paths are required.");
    }
    if (paths.some((path: string) => !path.startsWith(`maintenanceTickets/${ticketId}/owner/`))) {
      throw new HttpsError("permission-denied", "Evidence path is not scoped to this owner ticket.");
    }

    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ticketRef);
      if (!snap.exists) throw new HttpsError("not-found", "Maintenance ticket not found.");
      const ticket = snap.data() || {};
      if (text(ticket.ownerId || ticket.ownerUid, 160) !== ownerUid) {
        throw new HttpsError("permission-denied", "This ticket belongs to another owner.");
      }
      const existing = Array.isArray(ticket.photos) ? ticket.photos.filter((value: unknown) => typeof value === "string") : [];
      const merged = Array.from(new Set([...existing, ...urls])).slice(0, 24);
      transaction.set(ticketRef, {
        photos: merged,
        ownerEvidencePaths: FieldValue.arrayUnion(...paths),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(db.collection("auditLogs").doc(`owner_ticket_evidence_${ticketId}`), {
        action: "OWNER_MAINTENANCE_EVIDENCE_ATTACHED",
        actorId: ownerUid,
        actorRole: "owner",
        ticketId,
        propertyId: ticket.propertyId || null,
        evidenceCount: merged.length,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    return { ok: true, ticketId, evidenceCount: urls.length };
  },
);

export const ownerCreatePropertyReporter = onCall(
  { cors: true, region: "europe-west3" },
  async (request) => {
    assertOwnerRole(request.auth);
    const ownerUid = request.auth!.uid;
    const reporterId = text(request.data?.reporterId, 180);
    const propertyId = text(request.data?.propertyId, 160);
    const reporterName = text(request.data?.reporterName, 180);
    const reporterEmail = text(request.data?.reporterEmail, 320).toLowerCase();
    const reporterPhone = text(request.data?.reporterPhone, 60);
    const roleLabel = text(request.data?.roleLabel || "Other", 80);
    const accessType = text(request.data?.accessType || "REPORTER", 80);
    const permissionScope = text(request.data?.permissionScope || "OWN_COMPLAINTS", 80);
    const occupiedArea = text(request.data?.occupiedArea, 200);
    const unitId = text(request.data?.unitId, 160);
    const notes = text(request.data?.notes, 1000);
    if (
      !reporterId ||
      !propertyId ||
      !reporterName ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reporterEmail)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Reporter ID, property, name, and a valid email are required.",
      );
    }

    const propertyRef = db.collection("properties").doc(propertyId);
    const reporterRef = db.collection("propertyReporters").doc(reporterId);
    const now = FieldValue.serverTimestamp();
    await db.runTransaction(async (transaction) => {
      const [propertySnap, reporterSnap] = await Promise.all([
        transaction.get(propertyRef),
        transaction.get(reporterRef),
      ]);
      if (!propertySnap.exists) throw new HttpsError("not-found", "Property not found.");
      const property = propertySnap.data() || {};
      if (text(property.ownerId || property.ownerUid, 160) !== ownerUid) {
        throw new HttpsError("permission-denied", "The selected property is not bound to this owner.");
      }
      if (reporterSnap.exists) {
        const existing = reporterSnap.data() || {};
        if (
          text(existing.ownerId || existing.ownerUid, 160) !== ownerUid ||
          text(existing.propertyId, 160) !== propertyId
        ) {
          throw new HttpsError("already-exists", "Reporter reference belongs to another property.");
        }
        return;
      }
      transaction.create(reporterRef, {
        reporterId,
        ownerId: ownerUid,
        ownerUid,
        propertyId,
        propertyName: text(property.propertyName || property.name || propertyId, 240),
        reporterUid: null,
        reporterName,
        reporterEmail,
        reporterPhone,
        roleLabel,
        accessType,
        permissionScope,
        occupiedArea,
        unitId: unitId || null,
        notes,
        portalRoute: "/tenant/request",
        loginHint: "Reporter must use a separate verified login for portal access.",
        accessStatus: "INVITED",
        canCreateComplaints: true,
        canViewOwnComplaints: true,
        canViewPropertyComplaints: false,
        canActOnOwnerBehalf: false,
        canViewOwnerFinancials: false,
        canApproveWork: false,
        invitedByOwnerUid: ownerUid,
        createdAt: now,
        updatedAt: now,
      });
      transaction.create(db.collection("auditLogs").doc(`owner_reporter_${reporterId}`), {
        action: "OWNER_PROPERTY_REPORTER_INVITED",
        actorId: ownerUid,
        actorRole: "owner",
        reporterId,
        propertyId,
        createdAt: now,
      });
    });
    return { ok: true, reporterId };
  },
);

export const ownerSuspendPropertyReporter = onCall(
  { cors: true, region: "europe-west3" },
  async (request) => {
    assertOwnerRole(request.auth);
    const ownerUid = request.auth!.uid;
    const reporterId = text(request.data?.reporterId, 180);
    if (!reporterId) throw new HttpsError("invalid-argument", "Reporter ID is required.");
    const reporterRef = db.collection("propertyReporters").doc(reporterId);
    const now = FieldValue.serverTimestamp();
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(reporterRef);
      if (!snap.exists) throw new HttpsError("not-found", "Reporter not found.");
      const reporter = snap.data() || {};
      if (text(reporter.ownerId || reporter.ownerUid, 160) !== ownerUid) {
        throw new HttpsError("permission-denied", "This reporter belongs to another owner.");
      }
      if (text(reporter.accessStatus, 40).toUpperCase() === "SUSPENDED") return;
      transaction.set(reporterRef, {
        accessStatus: "SUSPENDED",
        canCreateComplaints: false,
        canViewOwnComplaints: false,
        canViewPropertyComplaints: false,
        canActOnOwnerBehalf: false,
        canViewOwnerFinancials: false,
        canApproveWork: false,
        suspendedAt: now,
        updatedAt: now,
      }, { merge: true });
      transaction.create(db.collection("auditLogs").doc(`owner_reporter_suspend_${reporterId}`), {
        action: "OWNER_PROPERTY_REPORTER_SUSPENDED",
        actorId: ownerUid,
        actorRole: "owner",
        reporterId,
        propertyId: reporter.propertyId || null,
        createdAt: now,
      });
    });
    return { ok: true, reporterId };
  },
);
