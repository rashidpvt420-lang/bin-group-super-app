import { createHash } from "node:crypto";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "operations_admin", "operations_manager"]);
const VENDOR_STATUSES = new Set(["verified", "suspended"]);
const RFQ_MUTABLE_STATUSES = new Set(["collecting_quotes", "ready_for_owner_approval"]);

const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const roleOf = (token: any) => text(token?.role || token?.userRole || token?.primaryRole, 80).toLowerCase();
const secondFactorOf = (token: any) => text(token?.firebase?.sign_in_second_factor || token?.sign_in_second_factor, 120);
const safeId = (value: unknown, field: string) => {
  const id = text(value, 180);
  if (!id || !/^[A-Za-z0-9_-]{1,180}$/.test(id)) throw new HttpsError("invalid-argument", `A valid ${field} is required.`);
  return id;
};
const finiteMoney = (value: unknown, field: string) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000000) {
    throw new HttpsError("invalid-argument", `${field} must be a valid non-negative AED amount.`);
  }
  return Math.round(amount * 100) / 100;
};
const integer = (value: unknown, fallback: number, max: number) => {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : fallback;
};
const quoteIdFor = (rfqId: string, vendorId: string) =>
  `rfq_quote_${createHash("sha256").update(`${rfqId}|${vendorId}`).digest("hex").slice(0, 32)}`;
const approvalIdFor = (rfqId: string) =>
  `rfq_approval_${createHash("sha256").update(rfqId).digest("hex").slice(0, 32)}`;

async function requireMfaAdmin(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const token = auth.token || {};
  const role = roleOf(token);
  const hasAdmin =
    token.admin === true ||
    token.isAdmin === true ||
    token.super_admin === true ||
    token.superAdmin === true ||
    token.ceo === true ||
    ADMIN_ROLES.has(role);
  if (!hasAdmin || token.suspended === true) throw new HttpsError("permission-denied", "Approved Admin authority is required.");

  const [userRecord, profileSnap] = await Promise.all([
    admin.auth().getUser(auth.uid),
    db.collection("users").doc(auth.uid).get(),
  ]);
  const profile = profileSnap.data() || {};
  if (
    userRecord.disabled ||
    profile.suspended === true ||
    ["suspended", "disabled", "rejected", "inactive"].includes(text(profile.status, 80).toLowerCase())
  ) {
    throw new HttpsError("permission-denied", "This Admin account is not active.");
  }
  if ((userRecord.multiFactor?.enrolledFactors || []).length <= 0 || !secondFactorOf(token)) {
    throw new HttpsError("permission-denied", "A verified Admin MFA session is required.");
  }
  return { uid: auth.uid, role: role || "admin", email: userRecord.email || null };
}

function audit(actor: { uid: string; role: string; email: string | null }, action: string, targetType: string, targetId: string, metadata: Record<string, unknown> = {}) {
  return {
    action,
    actorId: actor.uid,
    actorEmail: actor.email,
    actorRole: actor.role,
    targetType,
    targetId,
    mfaVerified: true,
    sensitiveValuesExcluded: true,
    metadata,
    createdAt: FieldValue.serverTimestamp(),
  };
}

export const adminCreateVendorVerificationFile = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actor = await requireMfaAdmin(request.auth);
    const name = text(request.data?.name, 180);
    const trade = text(request.data?.trade, 120);
    const emirate = text(request.data?.emirate, 120);
    const licenseNumber = text(request.data?.licenseNumber, 120);
    const insuranceStatus = text(request.data?.insuranceStatus || "pending", 80).toLowerCase();
    const serviceAreas = Array.isArray(request.data?.serviceAreas)
      ? request.data.serviceAreas.map((value: unknown) => text(value, 120)).filter(Boolean).slice(0, 30)
      : [];
    const warrantyObligationDays = integer(request.data?.warrantyObligationDays, 30, 3650);

    if (!name || !trade || !emirate || !licenseNumber) {
      throw new HttpsError("invalid-argument", "Vendor name, trade, emirate and trade license number are required.");
    }

    const duplicate = await db.collection("vendors").where("licenseNumber", "==", licenseNumber).limit(1).get();
    if (!duplicate.empty) throw new HttpsError("already-exists", "A vendor with this trade license number already exists.");

    const ref = db.collection("vendors").doc();
    const ledgerRef = db.collection("maintenance_ledger").doc();
    const auditRef = db.collection("audit_logs").doc();
    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.create(ref, {
      name,
      trade,
      emirate,
      licenseNumber,
      insuranceStatus,
      serviceAreas,
      warrantyObligationDays,
      status: "pending_verification",
      slaRatePct: 0,
      repeatFaultRatePct: 0,
      proofCoveragePct: 0,
      createdBy: actor.uid,
      createdAt: now,
      updatedAt: now,
    });
    batch.create(ledgerRef, {
      source: "secure_admin_procurement_trust",
      ledgerEvent: "VENDOR_ONBOARDED_FOR_VERIFICATION",
      vendorId: ref.id,
      vendorName: name,
      trade,
      createdBy: actor.uid,
      createdAt: now,
    });
    batch.create(auditRef, audit(actor, "ADMIN_CREATE_VENDOR_VERIFICATION_FILE", "vendors", ref.id, { trade, emirate }));
    await batch.commit();
    return { status: "SUCCESS", vendorId: ref.id };
  },
);

export const adminSetVendorVerificationStatus = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actor = await requireMfaAdmin(request.auth);
    const vendorId = safeId(request.data?.vendorId, "vendorId");
    const status = text(request.data?.status, 80).toLowerCase();
    if (!VENDOR_STATUSES.has(status)) throw new HttpsError("invalid-argument", "Vendor status must be verified or suspended.");

    const ref = db.collection("vendors").doc(vendorId);
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", "Vendor not found.");
      const before = snap.data() || {};
      if (status === "verified" && !text(before.licenseNumber, 120)) {
        throw new HttpsError("failed-precondition", "Vendor trade license evidence is required before verification.");
      }
      const now = FieldValue.serverTimestamp();
      transaction.set(ref, { status, verifiedBy: status === "verified" ? actor.uid : null, verifiedAt: status === "verified" ? now : null, updatedAt: now }, { merge: true });
      transaction.create(db.collection("maintenance_ledger").doc(), {
        source: "secure_admin_procurement_trust",
        ledgerEvent: "VENDOR_STATUS_UPDATED",
        vendorId,
        previousStatus: text(before.status, 80),
        status,
        createdBy: actor.uid,
        createdAt: now,
      });
      transaction.create(db.collection("audit_logs").doc(), audit(actor, "ADMIN_SET_VENDOR_STATUS", "vendors", vendorId, { beforeStatus: text(before.status, 80), status }));
    });
    return { status: "SUCCESS", vendorId, vendorStatus: status };
  },
);

export const adminCreateVendorRfq = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actor = await requireMfaAdmin(request.auth);
    const ticketId = safeId(request.data?.ticketId, "ticketId");
    const propertyId = safeId(request.data?.propertyId, "propertyId");
    const ownerId = safeId(request.data?.ownerId, "ownerId");
    const trade = text(request.data?.trade, 120);
    const standardScope = text(request.data?.standardScope, 2000);
    const estimateBandAed = finiteMoney(request.data?.estimateBandAed, "Estimate");
    const emergency = request.data?.emergency === true;
    if (!trade || standardScope.length < 5) throw new HttpsError("invalid-argument", "Trade and a standard scope are required.");

    const [ticketSnap, propertySnap, ownerSnap] = await Promise.all([
      db.collection("maintenanceTickets").doc(ticketId).get(),
      db.collection("properties").doc(propertyId).get(),
      db.collection("users").doc(ownerId).get(),
    ]);
    if (!ticketSnap.exists) throw new HttpsError("not-found", "Maintenance ticket not found.");
    if (!propertySnap.exists) throw new HttpsError("not-found", "Property not found.");
    const ticket = ticketSnap.data() || {};
    const property = propertySnap.data() || {};
    const ticketPropertyId = text(ticket.propertyId, 180);
    const ticketOwnerId = text(ticket.ownerId || ticket.ownerUid, 180);
    const propertyOwnerId = text(property.ownerId || property.ownerUid, 180);
    if (ticketPropertyId && ticketPropertyId !== propertyId) throw new HttpsError("failed-precondition", "Ticket and property do not match.");
    if (ticketOwnerId && ticketOwnerId !== ownerId) throw new HttpsError("failed-precondition", "Ticket and owner do not match.");
    if (propertyOwnerId && propertyOwnerId !== ownerId) throw new HttpsError("failed-precondition", "Property and owner do not match.");

    const minimumQuotes = !emergency && estimateBandAed > 1500 ? 3 : 1;
    const approvalGate = estimateBandAed > 1500 && !emergency
      ? "three_quotes_required"
      : estimateBandAed > 500
        ? "owner_approval_required"
        : "low_value_auto_eligible";
    const ref = db.collection("vendor_rfqs").doc();
    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.create(ref, {
      ticketId,
      propertyId,
      ownerId,
      ownerEmail: text(ownerSnap.data()?.email, 220),
      trade,
      standardScope,
      estimateBandAed,
      emergency,
      minimumQuotes,
      quotesReceived: 0,
      status: "collecting_quotes",
      approvalGate,
      createdBy: actor.uid,
      createdAt: now,
      updatedAt: now,
    });
    batch.create(db.collection("maintenance_ledger").doc(), {
      source: "secure_admin_procurement_trust",
      ledgerEvent: "RFQ_CREATED",
      rfqId: ref.id,
      ticketId,
      ownerId,
      propertyId,
      createdBy: actor.uid,
      createdAt: now,
    });
    batch.create(db.collection("audit_logs").doc(), audit(actor, "ADMIN_CREATE_VENDOR_RFQ", "vendor_rfqs", ref.id, { ticketId, propertyId, ownerId, minimumQuotes, approvalGate }));
    await batch.commit();
    return { status: "SUCCESS", rfqId: ref.id, minimumQuotes, approvalGate };
  },
);

export const adminAddVerifiedVendorQuote = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actor = await requireMfaAdmin(request.auth);
    const rfqId = safeId(request.data?.rfqId, "rfqId");
    const vendorId = safeId(request.data?.vendorId, "vendorId");
    const amountAed = finiteMoney(request.data?.amountAed, "Quote amount");
    if (amountAed <= 0) throw new HttpsError("invalid-argument", "Quote amount must be greater than zero.");
    const warrantyDays = integer(request.data?.warrantyDays, 0, 3650);
    const notes = text(request.data?.notes, 2000);

    const rfqRef = db.collection("vendor_rfqs").doc(rfqId);
    const vendorRef = db.collection("vendors").doc(vendorId);
    const quoteRef = db.collection("vendor_quotes").doc(quoteIdFor(rfqId, vendorId));
    await db.runTransaction(async (transaction) => {
      const [rfqSnap, vendorSnap, quoteSnap] = await Promise.all([
        transaction.get(rfqRef),
        transaction.get(vendorRef),
        transaction.get(quoteRef),
      ]);
      if (!rfqSnap.exists) throw new HttpsError("not-found", "RFQ not found.");
      if (!vendorSnap.exists) throw new HttpsError("not-found", "Vendor not found.");
      if (quoteSnap.exists) throw new HttpsError("already-exists", "This vendor already has a quote on this RFQ.");
      const rfq = rfqSnap.data() || {};
      const vendor = vendorSnap.data() || {};
      const rfqStatus = text(rfq.status, 80).toLowerCase();
      if (!RFQ_MUTABLE_STATUSES.has(rfqStatus)) throw new HttpsError("failed-precondition", "RFQ is not accepting quotes.");
      if (text(vendor.status, 80).toLowerCase() !== "verified") throw new HttpsError("failed-precondition", "Only verified vendors can be quoted.");
      const nextCount = integer(rfq.quotesReceived, 0, 10000) + 1;
      const minimumQuotes = Math.max(1, integer(rfq.minimumQuotes, 1, 100));
      const nextStatus = nextCount >= minimumQuotes ? "ready_for_owner_approval" : "collecting_quotes";
      const now = FieldValue.serverTimestamp();

      transaction.create(quoteRef, {
        rfqId,
        ticketId: text(rfq.ticketId, 180),
        propertyId: text(rfq.propertyId, 180),
        ownerId: text(rfq.ownerId, 180),
        vendorId,
        vendorName: text(vendor.name, 180),
        amountAed,
        warrantyDays,
        notes,
        status: "submitted",
        createdBy: actor.uid,
        createdAt: now,
      });
      transaction.set(rfqRef, { quotesReceived: nextCount, lastQuoteAmountAed: amountAed, status: nextStatus, updatedAt: now }, { merge: true });
      transaction.create(db.collection("maintenance_ledger").doc(), {
        source: "secure_admin_procurement_trust",
        ledgerEvent: "VENDOR_QUOTE_RECEIVED",
        rfqId,
        quoteId: quoteRef.id,
        vendorId,
        amountAed,
        createdBy: actor.uid,
        createdAt: now,
      });
      transaction.create(db.collection("audit_logs").doc(), audit(actor, "ADMIN_ADD_VERIFIED_VENDOR_QUOTE", "vendor_quotes", quoteRef.id, { rfqId, vendorId, amountAed, nextStatus }));
    });
    return { status: "SUCCESS", rfqId, quoteId: quoteRef.id };
  },
);

export const adminRequestRfqOwnerApproval = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actor = await requireMfaAdmin(request.auth);
    const rfqId = safeId(request.data?.rfqId, "rfqId");
    const rfqRef = db.collection("vendor_rfqs").doc(rfqId);
    const rfqSnap = await rfqRef.get();
    if (!rfqSnap.exists) throw new HttpsError("not-found", "RFQ not found.");
    const rfq = rfqSnap.data() || {};
    const minimumQuotes = Math.max(1, integer(rfq.minimumQuotes, 1, 100));
    const quoteSnap = await db.collection("vendor_quotes").where("rfqId", "==", rfqId).get();
    if (quoteSnap.size < minimumQuotes) {
      throw new HttpsError("failed-precondition", `RFQ requires ${minimumQuotes} verified vendor quote(s) before Owner approval.`);
    }

    const approvalRef = db.collection("owner_approval_requests").doc(approvalIdFor(rfqId));
    const result = await db.runTransaction(async (transaction) => {
      const [freshRfqSnap, approvalSnap] = await Promise.all([
        transaction.get(rfqRef),
        transaction.get(approvalRef),
      ]);
      if (!freshRfqSnap.exists) throw new HttpsError("not-found", "RFQ disappeared before approval request.");
      const fresh = freshRfqSnap.data() || {};
      if (approvalSnap.exists) {
        return { idempotent: true, approvalRequestId: approvalRef.id };
      }
      const status = text(fresh.status, 80).toLowerCase();
      if (status !== "ready_for_owner_approval") {
        throw new HttpsError("failed-precondition", "RFQ is not ready for Owner approval.");
      }
      const now = FieldValue.serverTimestamp();
      transaction.create(approvalRef, {
        rfqId,
        ticketId: text(fresh.ticketId, 180),
        propertyId: text(fresh.propertyId, 180),
        ownerId: text(fresh.ownerId, 180),
        ownerEmail: text(fresh.ownerEmail, 220),
        trade: text(fresh.trade, 120),
        standardScope: text(fresh.standardScope, 2000),
        estimateBandAed: Number(fresh.estimateBandAed || 0),
        quotesReceived: quoteSnap.size,
        minimumQuotes,
        status: "pending_owner_decision",
        decision: "",
        decisionNote: "",
        createdBy: actor.uid,
        createdAt: now,
        updatedAt: now,
      });
      transaction.set(rfqRef, { status: "owner_approval_requested", approvalRequestId: approvalRef.id, updatedAt: now }, { merge: true });
      transaction.create(db.collection("maintenance_ledger").doc(), {
        source: "secure_admin_procurement_trust",
        ledgerEvent: "OWNER_APPROVAL_REQUESTED",
        rfqId,
        approvalRequestId: approvalRef.id,
        ownerId: text(fresh.ownerId, 180),
        createdBy: actor.uid,
        createdAt: now,
      });
      transaction.create(db.collection("audit_logs").doc(), audit(actor, "ADMIN_REQUEST_RFQ_OWNER_APPROVAL", "owner_approval_requests", approvalRef.id, { rfqId, quotesReceived: quoteSnap.size, minimumQuotes }));
      return { idempotent: false, approvalRequestId: approvalRef.id };
    });

    return { status: "SUCCESS", rfqId, ...result };
  },
);
