import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const KINDS = new Set(["EMERGENCY", "SCHEDULED_SERVICE", "AI_CONCIERGE"]);
const PRIORITIES = new Set(["normal", "urgent", "emergency"]);

function text(value: unknown, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function roleOf(auth: any, profile: FirebaseFirestore.DocumentData) {
  return text(
    auth?.token?.role ||
    auth?.token?.userRole ||
    auth?.token?.primaryRole ||
    profile.role,
    60,
  ).toLowerCase();
}

function tenantOwnsUnit(unit: FirebaseFirestore.DocumentData, auth: any) {
  const uid = text(auth?.uid, 160);
  if ([unit.tenantId, unit.tenantUid, unit.currentTenantId].some((value) => text(value, 160) === uid)) {
    return true;
  }
  const verifiedEmail = auth?.token?.email_verified === true
    ? text(auth?.token?.email, 320).toLowerCase()
    : "";
  return Boolean(verifiedEmail) && text(unit.tenantEmail, 320).toLowerCase() === verifiedEmail;
}

function timestampOrNull(value: unknown) {
  const millis = new Date(text(value, 80)).getTime();
  return Number.isFinite(millis) ? admin.firestore.Timestamp.fromMillis(millis) : null;
}

function dubaiDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const createTenantServiceTicket = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Tenant login required.");
    if (request.auth.token?.suspended === true) {
      throw new HttpsError("permission-denied", "Suspended tenant account.");
    }

    const uid = request.auth.uid;
    const kind = text(request.data?.kind, 40).toUpperCase();
    const unitId = text(request.data?.unitId, 160);
    const propertyId = text(request.data?.propertyId, 160);
    const clientRequestId = text(request.data?.clientRequestId, 160);
    const details = object(request.data?.details);
    if (!KINDS.has(kind) || !unitId || !propertyId || !/^[A-Za-z0-9._:-]{8,160}$/.test(clientRequestId)) {
      throw new HttpsError("invalid-argument", "Ticket kind, residence, and stable request ID are required.");
    }

    const ticketId = `tenant_${crypto
      .createHash("sha256")
      .update(`${uid}:${kind}:${clientRequestId}`)
      .digest("hex")
      .slice(0, 48)}`;
    const ticketRef = db.collection("maintenanceTickets").doc(ticketId);
    const userRef = db.collection("users").doc(uid);
    const unitRef = db.collection("units").doc(unitId);
    const propertyRef = db.collection("properties").doc(propertyId);
    const now = admin.firestore.FieldValue.serverTimestamp();

    const result = await db.runTransaction(async (transaction) => {
      const [existingSnap, userSnap, unitSnap, propertySnap] = await Promise.all([
        transaction.get(ticketRef),
        transaction.get(userRef),
        transaction.get(unitRef),
        transaction.get(propertyRef),
      ]);
      const profile = userSnap.data() || {};
      const unit = unitSnap.data() || {};
      const property = propertySnap.data() || {};

      if (
        roleOf(request.auth, profile) !== "tenant" ||
        ["suspended", "disabled", "rejected"].includes(text(profile.status, 60).toLowerCase())
      ) {
        throw new HttpsError("permission-denied", "An active tenant account is required.");
      }
      if (
        !unitSnap.exists ||
        !propertySnap.exists ||
        text(unit.propertyId, 160) !== propertyId ||
        !tenantOwnsUnit(unit, request.auth)
      ) {
        throw new HttpsError("permission-denied", "The selected unit is not bound to this tenant and property.");
      }
      if (existingSnap.exists) {
        const existing = existingSnap.data() || {};
        if (
          text(existing.tenantId, 160) !== uid ||
          text(existing.clientRequestId, 160) !== clientRequestId ||
          text(existing.requestType, 60) !== kind
        ) {
          throw new HttpsError("already-exists", "Request ID is already bound to another ticket.");
        }
        return { idempotent: true };
      }

      const propertyName = text(property.name || property.propertyName || property.address, 240);
      const ownerId = text(property.ownerUid || property.ownerId || unit.ownerUid || unit.ownerId, 160);
      const common: Record<string, unknown> = {
        requesterRole: "tenant",
        requestType: kind,
        clientRequestId,
        tenantId: uid,
        tenantUid: uid,
        tenantName: text(profile.displayName || request.auth?.token?.name, 160) || "Resident",
        tenantPhone: text(profile.phoneNumber || profile.phone, 60),
        tenantEmail: text(request.auth?.token?.email || profile.email, 320).toLowerCase(),
        requesterId: uid,
        createdBy: uid,
        createdByUid: uid,
        propertyId,
        propertyName,
        unitId,
        unitNumber: text(unit.unitNumber || unit.name, 80),
        floor: text(unit.floorNumber || unit.floor, 40),
        ...(ownerId ? { ownerId, ownerUid: ownerId } : {}),
        technicianId: null,
        assignedTechnicianId: null,
        createdAt: now,
        updatedAt: now,
        source: "TENANT_SERVICE_TICKET_CALLABLE",
      };

      if (kind === "EMERGENCY") {
        Object.assign(common, {
          category: "emergency",
          priority: "emergency",
          description: "TENANT TRIGGERED SOS EMERGENCY",
          status: "EMERGENCY_SUBMITTED",
          dispatchStatus: "PENDING_EMERGENCY_DISPATCH",
          trackingStatus: "WAITING_FOR_EMERGENCY_TECHNICIAN",
          requiresImmediateDispatch: true,
          slaMinutes: 60,
          photoEvidenceRequired: false,
          evidenceStatus: "EMERGENCY_EVIDENCE_OPTIONAL",
        });
      }

      if (kind === "AI_CONCIERGE") {
        const priority = text(details.priority, 20).toLowerCase();
        const category = text(details.category, 80);
        const description = text(details.description, 2000);
        if (!category || description.length < 8 || !PRIORITIES.has(priority) || details.photoEvidenceExpected !== true) {
          throw new HttpsError("invalid-argument", "AI maintenance tickets require category, priority, description, and photo evidence.");
        }
        const location = property.location || property.propertyLocation || property.geoPoint || {};
        const lat = Number((location as any).lat ?? (location as any).latitude);
        const lng = Number((location as any).lng ?? (location as any).longitude);
        Object.assign(common, {
          category,
          priority,
          description,
          specificLocation: text(details.specificLocation, 240),
          photos: [],
          primaryPhotoUrl: "",
          photoEvidenceRequired: true,
          evidenceStatus: "PENDING_TENANT_UPLOAD",
          status: "OPEN",
          dispatchStatus: "PENDING_ASSIGNMENT",
          trackingStatus: "WAITING_FOR_TENANT_EVIDENCE",
          slaMinutes: priority === "emergency" ? 60 : priority === "urgent" ? 240 : 1440,
          ...(Number.isFinite(lat) && Number.isFinite(lng)
            ? { jobLocation: { lat, lng, latitude: lat, longitude: lng, address: text(property.address, 500), source: "property" } }
            : {}),
        });
      }

      if (kind === "SCHEDULED_SERVICE") {
        const preferredDate = text(details.preferredDate, 40);
        const serviceCode = text(details.serviceCode, 80);
        const serviceScope = text(details.serviceScope, 1000);
        const cancellationPolicyVersion = text(details.cancellationPolicyVersion, 80);
        if (
          !isCalendarDate(preferredDate) ||
          preferredDate < dubaiDateKey() ||
          !serviceCode ||
          !serviceScope ||
          details.policyAccepted !== true ||
          !cancellationPolicyVersion
        ) {
          throw new HttpsError("invalid-argument", "Scheduled service details and policy acknowledgement are required.");
        }
        Object.assign(common, {
          serviceCode,
          serviceLabel: text(details.serviceLabel, 160),
          category: text(details.category, 80) || "scheduled_service",
          description: text(details.operationsSummary, 2000),
          operationsSummary: text(details.operationsSummary, 2000),
          specificLocation: serviceScope,
          serviceLocationDetail: serviceScope,
          preferredServiceDate: preferredDate,
          requestedServiceDate: preferredDate,
          preferredTimeWindow: text(details.preferredTimeWindow, 120),
          availabilitySlotId: text(details.availabilitySlotId, 160) || null,
          availabilitySelectionStatus: details.availabilitySlotId ? "REQUESTED_PUBLISHED_SLOT" : "PREFERENCE_ONLY",
          availabilityVendorId: text(details.availabilityVendorId, 160) || null,
          availabilityVendorName: text(details.availabilityVendorName, 160) || null,
          availabilityPriceFrom: Number.isFinite(Number(details.availabilityPriceFrom))
            ? Number(details.availabilityPriceFrom)
            : null,
          occupancyStatus: text(details.occupancyStatus, 40),
          tenantAway: details.tenantAway === true,
          vacationService: details.vacationService === true,
          accessMethod: text(details.accessMethod, 40),
          accessAuthorized: details.accessAuthorized === true,
          accessCodeStatus: details.accessMethod === "smart-lock" ? "PENDING_SECURE_UPLOAD" : "NOT_REQUIRED",
          securityAccessStatus: details.accessMethod === "smart-lock" ? "PENDING_CONFIRMATION" : "NOT_REQUIRED",
          contactDuringService: text(details.contactDuringService, 160),
          pestTarget: text(details.pestTarget, 160),
          sensitiveOccupants: text(details.sensitiveOccupants, 80),
          specialInstructions: text(details.specialInstructions, 1000),
          recurrenceFrequency: text(details.recurrenceFrequency, 60) || "one-time",
          recurrenceOccurrences: Math.min(Math.max(Math.floor(Number(details.recurrenceOccurrences) || 1), 1), 52),
          recurrenceSequence: 1,
          recurringPlanApproved: false,
          pricingRequired: true,
          quotedPrice: null,
          currency: "AED",
          quoteStatus: "PENDING_OPERATIONS_QUOTE",
          cancellationPolicyVersion,
          cancellationPolicyAccepted: true,
          cancellationPolicyAcceptedAt: now,
          priority: "normal",
          slaPriority: "SCHEDULED",
          slaStartsAt: "CONFIRMED_APPOINTMENT",
          photoEvidenceRequired: false,
          evidenceStatus: "NOT_REQUIRED_AT_INTAKE",
          status: "PENDING_SCHEDULING",
          appointmentStatus: "PENDING_CONFIRMATION",
          dispatchStatus: "PENDING_SCHEDULING",
          trackingStatus: "WAITING_FOR_APPOINTMENT_AND_QUOTE",
          requestedAccessCodeExpiry: timestampOrNull(details.accessCodeExpiresAt),
        });
      }

      transaction.create(ticketRef, common);
      transaction.create(db.collection("audit_logs").doc(), {
        actorId: uid,
        actorRole: "tenant",
        action: `TENANT_${kind}_TICKET_CREATED`,
        targetType: "maintenanceTickets",
        targetId: ticketId,
        metadata: { propertyId, unitId, clientRequestId },
        createdAt: now,
      });
      return { idempotent: false };
    });

    return { status: "SUCCESS", ticketId, idempotent: result.idempotent };
  },
);
