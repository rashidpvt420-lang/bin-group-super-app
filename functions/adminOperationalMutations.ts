import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { requirePrivilegedMfaSession } from "./adminMfaSession";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const ADMIN_ROLES = new Set([
  "admin", "super_admin", "ceo", "manager", "operations_admin", "operations_manager",
]);

function text(value: unknown, max = 500): string {
  return String(value ?? "").trim().slice(0, max);
}

function finite(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function bool(value: unknown): boolean {
  return value === true;
}

function stringArray(value: unknown, maxItems = 30, maxLen = 500): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, maxLen)).filter(Boolean))].slice(0, maxItems);
}

function secondFactorRole(auth: any): string {
  return text(auth?.token?.role || auth?.token?.userRole || auth?.token?.primaryRole, 60).toLowerCase();
}

async function requireAdminActor(auth: any) {
  await requirePrivilegedMfaSession(auth);
  const role = secondFactorRole(auth);
  const token = auth?.token || {};
  if (!(ADMIN_ROLES.has(role) || token.admin === true || token.isAdmin === true || token.superAdmin === true || token.super_admin === true || token.ceo === true)) {
    throw new HttpsError("permission-denied", "Admin authority is required.");
  }
  return {
    uid: String(auth.uid),
    role: role || "admin",
    email: text(token.email, 320).toLowerCase(),
  };
}

function audit(actor: { uid: string; role: string }, action: string, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) {
  return {
    actorId: actor.uid,
    actorRole: actor.role,
    action,
    targetType,
    targetId,
    mfaVerified: true,
    sensitiveValuesExcluded: true,
    metadata,
    createdAt: FieldValue.serverTimestamp(),
  };
}

async function requireProperty(propertyId: string) {
  const snap = await db.collection("properties").doc(propertyId).get();
  if (!snap.exists) throw new HttpsError("failed-precondition", "A valid property is required.");
}

async function requireUnit(propertyId: string, unitId: string) {
  const snap = await db.collection("units").doc(unitId).get();
  if (!snap.exists || text(snap.data()?.propertyId) !== propertyId) {
    throw new HttpsError("failed-precondition", "The selected unit is not bound to the property.");
  }
  return snap.data() || {};
}

function validHttpUrl(value: unknown): string {
  const candidate = text(value, 1200);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    return candidate;
  } catch {
    return "";
  }
}

export const adminOperationalMutation = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
  const actor = await requireAdminActor(request.auth);
  const action = text(request.data?.action, 80).toUpperCase();
  const payload = (request.data?.payload && typeof request.data.payload === "object") ? request.data.payload : {};
  const now = FieldValue.serverTimestamp();

  switch (action) {
    case "SEND_MESSAGE": {
      const conversationId = text(payload.conversationId, 180);
      const body = text(payload.body, 4000);
      if (!conversationId || !body) throw new HttpsError("invalid-argument", "Conversation and message are required.");
      const conversationRef = db.collection("conversations").doc(conversationId);
      const messageRef = conversationRef.collection("messages").doc();
      const auditRef = db.collection("audit_logs").doc();
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(conversationRef);
        if (!snap.exists) throw new HttpsError("not-found", "Conversation not found.");
        tx.create(messageRef, {
          senderUid: actor.uid,
          senderRole: actor.role,
          senderEmail: actor.email,
          body,
          createdAt: now,
        });
        tx.set(conversationRef, { lastMessageAt: now }, { merge: true });
        tx.create(auditRef, audit(actor, "ADMIN_MESSAGE_SENT", "conversations", conversationId, { messageId: messageRef.id }));
      });
      return { success: true, id: messageRef.id };
    }

    case "CREATE_KEY": {
      const propertyId = text(payload.propertyId, 180);
      const unitId = text(payload.unitId, 180);
      const keyType = text(payload.keyType, 80);
      const keyCodeMasked = text(payload.keyCodeMasked, 120);
      if (!propertyId || !unitId || !keyType || !keyCodeMasked) throw new HttpsError("invalid-argument", "Property, unit, key type and masked code are required.");
      await requireProperty(propertyId);
      await requireUnit(propertyId, unitId);
      const ref = db.collection("keyRegister").doc();
      const batch = db.batch();
      batch.create(ref, {
        propertyId, unitId, keyType, keyCodeMasked,
        status: "available",
        currentCustodianType: "security",
        currentCustodianName: "Front Gate Desk",
        createdBy: actor.uid,
        createdAt: now,
        updatedAt: now,
      });
      batch.create(db.collection("audit_logs").doc(), audit(actor, "ADMIN_KEY_CREATED", "keyRegister", ref.id, { propertyId, unitId }));
      await batch.commit();
      return { success: true, id: ref.id };
    }

    case "ISSUE_KEY":
    case "RETURN_KEY": {
      const keyId = text(payload.keyId, 180);
      if (!keyId) throw new HttpsError("invalid-argument", "Key ID is required.");
      const keyRef = db.collection("keyRegister").doc(keyId);
      const movementRef = db.collection("keyMovements").doc();
      const auditRef = db.collection("audit_logs").doc();
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(keyRef);
        if (!snap.exists) throw new HttpsError("not-found", "Key record not found.");
        const key = snap.data() || {};
        if (action === "ISSUE_KEY") {
          const toCustodian = text(payload.toCustodian, 180);
          const custodianType = text(payload.custodianType, 80);
          if (!toCustodian || !custodianType) throw new HttpsError("invalid-argument", "Custodian details are required.");
          if (text(key.status, 40).toLowerCase() !== "available") throw new HttpsError("failed-precondition", "Only available keys can be issued.");
          tx.set(keyRef, {
            status: "issued",
            currentCustodianType: custodianType,
            currentCustodianName: toCustodian,
            updatedAt: now,
          }, { merge: true });
          tx.create(movementRef, {
            propertyId: text(key.propertyId, 180),
            unitId: text(key.unitId, 180),
            keyId,
            action: "issued",
            fromCustodian: text(key.currentCustodianName, 180) || "Security",
            toCustodian,
            handledBy: actor.uid,
            signatureRequired: true,
            notes: text(payload.notes, 1000),
            createdAt: now,
          });
          tx.create(auditRef, audit(actor, "ADMIN_KEY_ISSUED", "keyRegister", keyId, { movementId: movementRef.id }));
        } else {
          if (text(key.status, 40).toLowerCase() !== "issued") throw new HttpsError("failed-precondition", "Only issued keys can be returned.");
          tx.set(keyRef, {
            status: "available",
            currentCustodianType: "security",
            currentCustodianName: "Front Gate Desk",
            updatedAt: now,
          }, { merge: true });
          tx.create(movementRef, {
            propertyId: text(key.propertyId, 180),
            unitId: text(key.unitId, 180),
            keyId,
            action: "returned",
            fromCustodian: text(key.currentCustodianName, 180),
            toCustodian: "Front Gate Desk",
            handledBy: actor.uid,
            createdAt: now,
          });
          tx.create(auditRef, audit(actor, "ADMIN_KEY_RETURNED", "keyRegister", keyId, { movementId: movementRef.id }));
        }
      });
      return { success: true, id: keyId };
    }

    case "CREATE_PARCEL": {
      const propertyId = text(payload.propertyId, 180);
      const unitId = text(payload.unitId, 180);
      const tenantUid = text(payload.tenantUid, 180);
      if (!propertyId || !unitId || !tenantUid) throw new HttpsError("invalid-argument", "Property, unit and tenant are required.");
      await requireProperty(propertyId);
      const unit = await requireUnit(propertyId, unitId);
      const boundTenant = [unit.tenantId, unit.tenantUid, unit.currentTenantId].map((v: unknown) => text(v, 180));
      if (!boundTenant.includes(tenantUid)) throw new HttpsError("failed-precondition", "Tenant is not bound to the selected unit.");
      const ref = db.collection("parcels").doc();
      const batch = db.batch();
      batch.create(ref, {
        propertyId, unitId, tenantUid,
        recipientName: text(payload.recipientName, 180),
        courierName: text(payload.courierName, 180),
        trackingNumberMasked: text(payload.trackingNumberMasked, 120),
        parcelType: text(payload.parcelType, 80),
        status: "received",
        receivedBy: actor.uid,
        receivedAt: now,
        notes: text(payload.notes, 1000),
      });
      batch.create(db.collection("audit_logs").doc(), audit(actor, "ADMIN_PARCEL_RECEIVED", "parcels", ref.id, { propertyId, unitId }));
      await batch.commit();
      return { success: true, id: ref.id };
    }

    case "RELEASE_PARCEL": {
      const parcelId = text(payload.parcelId, 180);
      if (!parcelId) throw new HttpsError("invalid-argument", "Parcel ID is required.");
      const ref = db.collection("parcels").doc(parcelId);
      const auditRef = db.collection("audit_logs").doc();
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("not-found", "Parcel not found.");
        const current = text(snap.data()?.status, 40).toLowerCase();
        if (current === "collected") return;
        if (current !== "received") throw new HttpsError("failed-precondition", "Only received parcels can be released.");
        tx.set(ref, { status: "collected", collectedBy: actor.uid, collectedAt: now, updatedAt: now }, { merge: true });
        tx.create(auditRef, audit(actor, "ADMIN_PARCEL_RELEASED", "parcels", parcelId));
      });
      return { success: true, id: parcelId };
    }

    case "MODERATE_COMMUNITY":
    case "DELETE_COMMUNITY": {
      const postId = text(payload.postId, 180);
      if (!postId) throw new HttpsError("invalid-argument", "Post ID is required.");
      const ref = db.collection("communityPosts").doc(postId);
      const auditRef = db.collection("audit_logs").doc();
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("not-found", "Community post not found.");
        if (action === "DELETE_COMMUNITY") {
          tx.delete(ref);
          tx.create(auditRef, audit(actor, "ADMIN_COMMUNITY_POST_DELETED", "communityPosts", postId));
          return;
        }
        const decision = text(payload.decision, 20).toLowerCase();
        if (!["approved", "rejected"].includes(decision)) throw new HttpsError("invalid-argument", "Decision must be approved or rejected.");
        tx.set(ref, {
          status: decision,
          approvedBy: actor.uid,
          approvedAt: now,
          updatedAt: now,
        }, { merge: true });
        tx.create(auditRef, audit(actor, decision === "approved" ? "ADMIN_COMMUNITY_POST_APPROVED" : "ADMIN_COMMUNITY_POST_REJECTED", "communityPosts", postId));
      });
      return { success: true, id: postId };
    }

    case "REVIEW_TENANT_SERVICE": {
      const requestId = text(payload.requestId, 180);
      const decision = text(payload.decision, 20).toLowerCase();
      if (!requestId || !["approved", "rejected"].includes(decision)) throw new HttpsError("invalid-argument", "Request and decision are required.");
      const ref = db.collection("tenant_services_requests").doc(requestId);
      const auditRef = db.collection("audit_logs").doc();
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("not-found", "Tenant service request not found.");
        const current = text(snap.data()?.status, 40).toLowerCase();
        if (current === decision) return;
        if (!["pending", "submitted", "requested"].includes(current)) throw new HttpsError("failed-precondition", "This tenant service request is no longer pending review.");
        tx.set(ref, { status: decision, reviewedBy: actor.uid, reviewedAt: now, updatedAt: now }, { merge: true });
        tx.create(auditRef, audit(actor, decision === "approved" ? "ADMIN_TENANT_SERVICE_APPROVED" : "ADMIN_TENANT_SERVICE_REJECTED", "tenant_services_requests", requestId));
      });
      return { success: true, id: requestId };
    }

    case "CREATE_AMENITY": {
      const propertyId = text(payload.propertyId, 180);
      const name = text(payload.name, 180);
      if (!propertyId || !name) throw new HttpsError("invalid-argument", "Property and amenity name are required.");
      await requireProperty(propertyId);
      const ref = db.collection("amenities").doc();
      const batch = db.batch();
      batch.create(ref, {
        propertyId,
        name,
        type: text(payload.type, 80),
        description: text(payload.description, 1000),
        capacity: Math.max(0, Math.round(finite(payload.capacity))),
        requiresApproval: bool(payload.requiresApproval),
        active: true,
        createdBy: actor.uid,
        createdAt: now,
        updatedAt: now,
      });
      batch.create(db.collection("audit_logs").doc(), audit(actor, "ADMIN_AMENITY_CREATED", "amenities", ref.id, { propertyId }));
      await batch.commit();
      return { success: true, id: ref.id };
    }

    case "REVIEW_AMENITY_BOOKING": {
      const bookingId = text(payload.bookingId, 180);
      const decision = text(payload.decision, 20).toLowerCase();
      if (!bookingId || !["approved", "rejected"].includes(decision)) throw new HttpsError("invalid-argument", "Booking and decision are required.");
      const ref = db.collection("amenityBookings").doc(bookingId);
      const auditRef = db.collection("audit_logs").doc();
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("not-found", "Amenity booking not found.");
        const current = text(snap.data()?.status, 40).toLowerCase();
        if (current === decision) return;
        if (current !== "pending") throw new HttpsError("failed-precondition", "Only pending bookings can be reviewed.");
        tx.set(ref, { status: decision, approvedAt: now, approvedBy: actor.uid, updatedAt: now }, { merge: true });
        tx.create(auditRef, audit(actor, decision === "approved" ? "ADMIN_AMENITY_BOOKING_APPROVED" : "ADMIN_AMENITY_BOOKING_REJECTED", "amenityBookings", bookingId));
      });
      return { success: true, id: bookingId };
    }

    case "DELETE_AMENITY": {
      const amenityId = text(payload.amenityId, 180);
      if (!amenityId) throw new HttpsError("invalid-argument", "Amenity ID is required.");
      const ref = db.collection("amenities").doc(amenityId);
      const auditRef = db.collection("audit_logs").doc();
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("not-found", "Amenity not found.");
        tx.delete(ref);
        tx.create(auditRef, audit(actor, "ADMIN_AMENITY_DELETED", "amenities", amenityId));
      });
      return { success: true, id: amenityId };
    }

    case "PUBLISH_HOME_LISTING": {
      const form = payload.form || {};
      const ownerEmail = text(form.ownerEmail, 320).toLowerCase();
      const unitTitle = text(form.unitTitle, 180);
      const propertyAddress = text(form.propertyAddress, 400);
      const propertyType = text(form.propertyType, 80).toUpperCase();
      const emirate = text(form.emirate, 80).toUpperCase();
      if (!ownerEmail || !unitTitle || !propertyAddress || !propertyType || !emirate) throw new HttpsError("invalid-argument", "Owner email, unit title, property address, type and emirate are required.");
      const imageUrls = stringArray(form.imageUrls, 12, 1200).map(validHttpUrl).filter(Boolean);
      const amenities = stringArray(form.amenities, 30, 120);
      const repairHistory = stringArray(form.repairHistory, 12, 300).map((title) => ({ title, status: "COMPLETED" }));
      const latitude = finite(form.latitude, NaN);
      const longitude = finite(form.longitude, NaN);
      const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
      const permitNumber = text(form.permitNumber, 120);
      const listingRef = db.collection("contractorProfiles").doc();
      const requestId = text(payload.requestId, 180);
      const requestRef = requestId ? db.collection("jobPostings").doc(requestId) : null;
      const auditRef = db.collection("audit_logs").doc();
      await db.runTransaction(async (tx) => {
        if (requestRef) {
          const requestSnap = await tx.get(requestRef);
          if (!requestSnap.exists) throw new HttpsError("not-found", "Home listing request not found.");
        }
        tx.create(listingRef, {
          recordType: "ROOM_RENT_LISTING",
          listingType: "HOME_RENT_LISTING",
          listingVersion: "HOME_DISCOVERY_V1",
          active: true,
          approved: true,
          notRented: true,
          hasBinContract: true,
          status: "AVAILABLE",
          title: unitTitle,
          unitTitle,
          businessName: unitTitle,
          name: unitTitle,
          propertyName: text(form.propertyName, 180),
          propertyType,
          propertyAddress,
          area: text(form.area, 180),
          community: text(form.area, 180),
          emirate,
          ownerEmail,
          ownerId: text(form.ownerId, 180) || null,
          annualRent: Math.max(0, finite(form.annualRent)),
          bedrooms: text(form.bedrooms, 40),
          bathrooms: text(form.bathrooms, 40),
          areaSqFt: Math.max(0, finite(form.areaSqFt)),
          furnishing: text(form.furnishing, 80),
          furnished: text(form.furnishing, 80).toUpperCase() !== "UNFURNISHED",
          availableFrom: text(form.availableFrom, 80),
          numberOfCheques: Math.max(0, Math.round(finite(form.numberOfCheques))),
          securityDeposit: Math.max(0, finite(form.securityDeposit)),
          imageUrls,
          coverImageUrl: imageUrls[0] || null,
          amenities,
          latitude: hasCoordinates ? latitude : null,
          longitude: hasCoordinates ? longitude : null,
          permitNumber: permitNumber || null,
          permitVerified: Boolean(bool(form.permitVerified) && permitNumber),
          permitVerificationUrl: validHttpUrl(form.permitVerificationUrl) || null,
          trade: "Home Rental",
          category: "home_rent",
          contractScope: "BIN GROUP renter contact, viewing and contract handling",
          repairHistory,
          repairHistorySummary: text(form.repairHistoryText, 2000),
          verifiedByAdmin: true,
          verifiedBy: actor.uid,
          verifiedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        if (requestRef) tx.set(requestRef, { status: "PUBLISHED", stage: "HOME_LISTING_PUBLISHED", updatedAt: now }, { merge: true });
        tx.create(auditRef, audit(actor, "ADMIN_HOME_LISTING_PUBLISHED", "contractorProfiles", listingRef.id, { requestId: requestId || null }));
      });
      return { success: true, id: listingRef.id };
    }

    case "TOGGLE_HOME_LISTING": {
      const listingId = text(payload.listingId, 180);
      const active = bool(payload.active);
      if (!listingId) throw new HttpsError("invalid-argument", "Listing ID is required.");
      const ref = db.collection("contractorProfiles").doc(listingId);
      const auditRef = db.collection("audit_logs").doc();
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("not-found", "Listing not found.");
        tx.set(ref, { active, status: active ? "AVAILABLE" : "INACTIVE", updatedAt: now }, { merge: true });
        tx.create(auditRef, audit(actor, active ? "ADMIN_HOME_LISTING_ACTIVATED" : "ADMIN_HOME_LISTING_DEACTIVATED", "contractorProfiles", listingId));
      });
      return { success: true, id: listingId };
    }

    case "MARK_HOME_APPLICATION_CONTACTED": {
      const requestId = text(payload.requestId, 180);
      const requestMode = text(payload.requestMode, 40).toUpperCase();
      if (!requestId) throw new HttpsError("invalid-argument", "Application ID is required.");
      const ref = db.collection("jobPostings").doc(requestId);
      const auditRef = db.collection("audit_logs").doc();
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("not-found", "Application not found.");
        tx.set(ref, {
          status: "CONTACTED",
          stage: requestMode === "VIEWING" ? "VIEWING_COORDINATION_STARTED" : "BIN_GROUP_CONTACTED_RENTER_AND_OWNER",
          contactedBy: actor.uid,
          contactedAt: now,
          updatedAt: now,
        }, { merge: true });
        tx.create(auditRef, audit(actor, "ADMIN_HOME_APPLICATION_CONTACTED", "jobPostings", requestId, { requestMode }));
      });
      return { success: true, id: requestId };
    }

    case "UPDATE_TICKET_ESTIMATE": {
      const ticketId = text(payload.ticketId, 180);
      const cost = finite(payload.estimatedCost, NaN);
      if (!ticketId || !Number.isFinite(cost) || cost < 0) throw new HttpsError("invalid-argument", "Ticket and non-negative estimate are required.");
      const ref = db.collection("maintenanceTickets").doc(ticketId);
      const auditRef = db.collection("audit_logs").doc();
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("not-found", "Maintenance ticket not found.");
        const current = text(snap.data()?.status, 60).toUpperCase();
        if (["COMPLETED", "RESOLVED", "CLOSED", "CANCELLED", "CANCELED"].includes(current)) throw new HttpsError("failed-precondition", "Closed tickets cannot be repriced.");
        const update: Record<string, unknown> = { estimatedCost: cost, estimateUpdatedBy: actor.uid, updatedAt: now };
        if (cost > 1000 && ["OPEN", "ESTIMATED"].includes(current)) update.status = "AWAITING_OWNER_APPROVAL";
        else if (current === "OPEN") update.status = "ESTIMATED";
        tx.set(ref, update, { merge: true });
        tx.create(auditRef, audit(actor, "ADMIN_TICKET_ESTIMATE_UPDATED", "maintenanceTickets", ticketId, { estimatedCost: cost, previousStatus: current }));
      });
      return { success: true, id: ticketId };
    }

    case "CREATE_PROPERTY_CONTACT": {
      const propertyId = text(payload.propertyId, 180);
      const displayName = text(payload.displayName, 180);
      const role = text(payload.role, 80).toLowerCase();
      const allowedRoles = new Set(["concierge", "security", "maintenance", "property_manager"]);
      if (!propertyId || !displayName || !allowedRoles.has(role)) throw new HttpsError("invalid-argument", "Valid property, contact name and role are required.");
      await requireProperty(propertyId);
      const ref = db.collection("staffDirectory").doc();
      const batch = db.batch();
      batch.create(ref, {
        propertyId, displayName, role,
        phone: text(payload.phone, 60),
        email: text(payload.email, 320).toLowerCase(),
        whatsapp: text(payload.whatsapp, 60),
        shiftLabel: text(payload.shiftLabel, 120),
        emergencyContact: bool(payload.emergencyContact),
        visibleToTenants: bool(payload.visibleToTenants),
        active: true,
        directoryType: "PROPERTY_CONTACT",
        createdBy: actor.uid,
        createdAt: now,
        updatedAt: now,
      });
      batch.create(db.collection("audit_logs").doc(), audit(actor, "ADMIN_PROPERTY_CONTACT_CREATED", "staffDirectory", ref.id, { propertyId }));
      await batch.commit();
      return { success: true, id: ref.id };
    }

    case "DELETE_PROPERTY_CONTACT": {
      const contactId = text(payload.contactId, 180);
      if (!contactId) throw new HttpsError("invalid-argument", "Contact ID is required.");
      const ref = db.collection("staffDirectory").doc(contactId);
      const auditRef = db.collection("audit_logs").doc();
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("not-found", "Property contact not found.");
        tx.delete(ref);
        tx.create(auditRef, audit(actor, "ADMIN_PROPERTY_CONTACT_DELETED", "staffDirectory", contactId));
      });
      return { success: true, id: contactId };
    }

    case "CREATE_ANNOUNCEMENT": {
      const propertyId = text(payload.propertyId, 180);
      const title = text(payload.title, 220);
      const body = text(payload.body, 5000);
      if (!propertyId || !title || !body) throw new HttpsError("invalid-argument", "Property scope, title and message are required.");
      if (propertyId !== "all") await requireProperty(propertyId);
      const ref = db.collection("announcements").doc();
      const batch = db.batch();
      batch.create(ref, {
        propertyId,
        title,
        body,
        category: text(payload.category, 80) || "general",
        priority: text(payload.priority, 40) || "normal",
        audience: text(payload.audience, 80) || "all",
        published: true,
        publishedAt: now,
        createdBy: actor.uid,
        createdAt: now,
      });
      batch.create(db.collection("audit_logs").doc(), audit(actor, "ADMIN_ANNOUNCEMENT_PUBLISHED", "announcements", ref.id, { propertyId }));
      await batch.commit();
      return { success: true, id: ref.id };
    }

    case "DELETE_ANNOUNCEMENT": {
      const announcementId = text(payload.announcementId, 180);
      if (!announcementId) throw new HttpsError("invalid-argument", "Announcement ID is required.");
      const ref = db.collection("announcements").doc(announcementId);
      const auditRef = db.collection("audit_logs").doc();
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("not-found", "Announcement not found.");
        tx.delete(ref);
        tx.create(auditRef, audit(actor, "ADMIN_ANNOUNCEMENT_DELETED", "announcements", announcementId));
      });
      return { success: true, id: announcementId };
    }

    case "CREATE_GOVERNANCE_EVENT": {
      const dataCategory = text(payload.dataCategory, 160);
      const lawfulBasis = text(payload.lawfulBasis, 160);
      const retentionClass = text(payload.retentionClass, 160);
      if (!dataCategory || !lawfulBasis || !retentionClass) throw new HttpsError("invalid-argument", "Data category, lawful basis and retention class are required.");
      const ref = db.collection("data_governance_events").doc();
      const batch = db.batch();
      batch.create(ref, {
        dataCategory,
        lawfulBasis,
        retentionClass,
        roleAccessPolicy: stringArray(payload.roleAccessPolicy, 30, 120),
        exportTrace: text(payload.exportTrace, 1000),
        deletionEligibility: text(payload.deletionEligibility, 500),
        notes: text(payload.notes, 2000),
        source: "admin_data_governance_audit",
        createdBy: actor.uid,
        createdAt: now,
      });
      batch.create(db.collection("audit_logs").doc(), audit(actor, "ADMIN_DATA_GOVERNANCE_EVENT_CREATED", "data_governance_events", ref.id, { dataCategory, retentionClass }));
      await batch.commit();
      return { success: true, id: ref.id };
    }

    case "CREATE_ASSET": {
      const propertyId = text(payload.propertyId, 180);
      const name = text(payload.name, 180);
      const model = text(payload.model, 180);
      const serialNumber = text(payload.serialNumber, 180);
      const installDate = text(payload.installDate, 80);
      if (!propertyId || !name || !model || !serialNumber || !installDate) throw new HttpsError("invalid-argument", "Property, name, model, serial number and installation date are required.");
      await requireProperty(propertyId);
      const ref = db.collection("assets").doc();
      const batch = db.batch();
      batch.create(ref, {
        propertyId,
        name,
        model,
        serialNumber,
        installDate,
        category: text(payload.category, 80) || "AC",
        status: text(payload.status, 80) || "healthy",
        manufacturer: text(payload.manufacturer, 180),
        warrantyExpiry: text(payload.warrantyExpiry, 80),
        notes: text(payload.notes, 2000),
        createdBy: actor.uid,
        createdAt: now,
        updatedAt: now,
      });
      batch.create(db.collection("audit_logs").doc(), audit(actor, "ADMIN_ASSET_CREATED", "assets", ref.id, { propertyId }));
      await batch.commit();
      return { success: true, id: ref.id };
    }

    case "CREATE_DOCUMENT": {
      const propertyId = text(payload.propertyId, 180);
      const title = text(payload.title, 220);
      const fileUrl = validHttpUrl(payload.fileUrl);
      if (!propertyId || !title || !fileUrl) throw new HttpsError("invalid-argument", "Property, title and valid document URL are required.");
      await requireProperty(propertyId);
      const ref = db.collection("documentLibrary").doc();
      const batch = db.batch();
      batch.create(ref, {
        propertyId,
        title,
        description: text(payload.description, 2000),
        category: text(payload.category, 100),
        audience: text(payload.audience, 100),
        fileUrl,
        storagePath: `documents/${ref.id}`,
        language: text(payload.language, 20) || "en",
        active: true,
        version: "1.0",
        uploadedBy: actor.uid,
        uploadedAt: now,
      });
      batch.create(db.collection("audit_logs").doc(), audit(actor, "ADMIN_DOCUMENT_LIBRARY_CREATED", "documentLibrary", ref.id, { propertyId }));
      await batch.commit();
      return { success: true, id: ref.id };
    }

    case "DELETE_DOCUMENT": {
      const documentId = text(payload.documentId, 180);
      if (!documentId) throw new HttpsError("invalid-argument", "Document ID is required.");
      const ref = db.collection("documentLibrary").doc(documentId);
      const auditRef = db.collection("audit_logs").doc();
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError("not-found", "Document record not found.");
        tx.delete(ref);
        tx.create(auditRef, audit(actor, "ADMIN_DOCUMENT_LIBRARY_DELETED", "documentLibrary", documentId));
      });
      return { success: true, id: documentId };
    }

    case "RECORD_PRICING_AUDIT": {
      const ownerId = text(payload.ownerId, 180);
      const propertyId = text(payload.propertyId, 180) || "lead_quote";
      const result = payload.result;
      if (!ownerId || !result || typeof result !== "object") throw new HttpsError("invalid-argument", "Owner and pricing result are required.");
      const encoded = JSON.stringify(result);
      if (encoded.length > 120000) throw new HttpsError("invalid-argument", "Pricing result is too large.");
      const ref = db.collection("pricingAuditLogs").doc();
      const batch = db.batch();
      batch.create(ref, {
        ownerId,
        propertyId,
        engineType: "decision_engine_v5_stable",
        summary: text(payload.summary, 500),
        result,
        createdBy: actor.uid,
        createdAt: now,
      });
      batch.create(db.collection("audit_logs").doc(), audit(actor, "ADMIN_PRICING_AUDIT_RECORDED", "pricingAuditLogs", ref.id, { ownerId, propertyId }));
      await batch.commit();
      return { success: true, id: ref.id };
    }

    default:
      throw new HttpsError("invalid-argument", "Unsupported Admin operational action.");
  }
});
