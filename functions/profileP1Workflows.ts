import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { isValidReraFormat } from "./brokerCommissions";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const ts = () => admin.firestore.FieldValue.serverTimestamp();

const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "manager", "operations_admin", "finance_admin"]);
const BROKER_ROLES = new Set(["broker"]);
const OWNER_ROLES = new Set(["owner"]);

function text(value: unknown, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function normalizedRole(value: unknown) {
  return text(value).toLowerCase();
}

function normalizedEmail(value: unknown) {
  return text(value).toLowerCase();
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clean(value: any): any {
  if (value === undefined || typeof value === "function") return null;
  if (value === null) return null;
  if (value instanceof admin.firestore.GeoPoint) return value;
  if (value instanceof admin.firestore.Timestamp) return value;
  if (value instanceof admin.firestore.FieldValue) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(clean);
  if (typeof value === "object") {
    const out: Record<string, any> = {};
    Object.entries(value).forEach(([key, entry]) => {
      if (entry !== undefined && typeof entry !== "function") out[key] = clean(entry);
    });
    return out;
  }
  return value;
}

function docId(value: string) {
  return text(value)
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180);
}

function hasRole(token: any, roles: Set<string>) {
  const role = normalizedRole(token?.role || token?.userRole || token?.primaryRole);
  return roles.has(role);
}

async function profileFor(uid: string) {
  const snap = await db.collection("users").doc(uid).get();
  return { exists: snap.exists, data: snap.data() || {} };
}

async function requireAdmin(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const token = auth.token || {};
  if (
    token.admin === true ||
    token.isAdmin === true ||
    token.superAdmin === true ||
    token.super_admin === true ||
    hasRole(token, ADMIN_ROLES)
  ) {
    return;
  }

  const profile = await profileFor(auth.uid);
  const data = profile.data;
  if (
    data.admin === true ||
    data.isAdmin === true ||
    data.superAdmin === true ||
    data.super_admin === true ||
    ADMIN_ROLES.has(normalizedRole(data.role || data.userRole || data.primaryRole))
  ) {
    return;
  }

  throw new HttpsError("permission-denied", "Admin permission required.");
}

async function requireProfileRole(auth: any, allowed: Set<string>, label: string) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", `${label} login required.`);
  if (hasRole(auth.token || {}, allowed)) {
    return (await profileFor(auth.uid)).data;
  }

  const profile = await profileFor(auth.uid);
  const role = normalizedRole(profile.data.role || profile.data.userRole || profile.data.primaryRole);
  if (allowed.has(role)) return profile.data;
  throw new HttpsError("permission-denied", `${label} role required.`);
}

function ownsProperty(auth: any, property: FirebaseFirestore.DocumentData) {
  const email = normalizedEmail(auth?.token?.email);
  return (
    property.ownerId === auth.uid ||
    property.ownerUid === auth.uid ||
    property.userId === auth.uid ||
    normalizedEmail(property.ownerEmail) === email
  );
}

function hashOptionalCode(value: unknown) {
  const raw = text(value);
  if (!raw) return { hash: null, last4: null };
  return {
    hash: crypto.createHash("sha256").update(raw).digest("hex"),
    last4: raw.slice(-4),
  };
}

export const adminReviewBrokerKyc = onCall({ cors: true, region: "europe-west3" }, async (request) => {
  await requireAdmin(request.auth);

  const brokerId = text(request.data?.brokerId);
  const decision = text(request.data?.decision || request.data?.status).toUpperCase();
  const reason = text(request.data?.reason || request.data?.notes);
  if (!brokerId) throw new HttpsError("invalid-argument", "brokerId is required.");
  if (!["APPROVE", "REJECT"].includes(decision)) throw new HttpsError("invalid-argument", "decision must be APPROVE or REJECT.");
  if (brokerId === request.auth?.uid) throw new HttpsError("permission-denied", "Brokers cannot approve or reject their own KYC.");
  if (decision === "REJECT" && !reason) throw new HttpsError("invalid-argument", "A rejection reason is required.");

  const brokerRef = db.collection("users").doc(brokerId);
  const brokerSnap = await brokerRef.get();
  if (!brokerSnap.exists) throw new HttpsError("not-found", "Broker profile not found.");
  const broker = brokerSnap.data() || {};
  if (!BROKER_ROLES.has(normalizedRole(broker.role || broker.userRole || broker.primaryRole))) {
    throw new HttpsError("failed-precondition", "Selected user is not a broker profile.");
  }

  const license = text(broker.reraLicense);
  const hasIdentity = Boolean(text(broker.tradeLicenseNumber) || text(broker.emiratesIdNumber) || text(broker.passportNumber));
  if (decision === "APPROVE") {
    if (!isValidReraFormat(license)) {
      throw new HttpsError("failed-precondition", "Broker RERA license number is missing or invalid.");
    }
    if (!hasIdentity) {
      throw new HttpsError("failed-precondition", "Broker must provide Emirates ID, passport, or trade license before approval.");
    }
  }

  const now = ts();
  const actorId = request.auth?.uid || "admin";
  const actorEmail = request.auth?.token?.email || null;
  const approved = decision === "APPROVE";
  let releasedCommissions = 0;

  await db.runTransaction(async (transaction) => {
    transaction.set(brokerRef, clean({
      status: approved ? "APPROVED" : "REJECTED",
      approvalStatus: approved ? "APPROVED" : "REJECTED",
      kycStatus: approved ? "VERIFIED" : "REJECTED",
      brokerKycStatus: approved ? "VERIFIED" : "REJECTED",
      reraVerified: approved,
      reraStatus: approved ? "VERIFIED" : "REJECTED",
      brokerKycReviewedBy: actorId,
      brokerKycReviewedByEmail: actorEmail,
      brokerKycReviewedAt: now,
      brokerKycReviewReason: reason || null,
      approvedAt: approved ? now : broker.approvedAt || null,
      approvedBy: approved ? actorId : broker.approvedBy || null,
      rejectedAt: approved ? broker.rejectedAt || null : now,
      rejectedBy: approved ? broker.rejectedBy || null : actorId,
      rejectionReason: approved ? null : reason,
      updatedAt: now,
    }), { merge: true });

    const auditRef = db.collection("auditLogs").doc();
    transaction.set(auditRef, clean({
      action: approved ? "ADMIN_APPROVE_BROKER_KYC" : "ADMIN_REJECT_BROKER_KYC",
      actorId,
      actorEmail,
      brokerId,
      reason: reason || null,
      before: {
        status: broker.status || null,
        kycStatus: broker.kycStatus || null,
        brokerKycStatus: broker.brokerKycStatus || null,
        reraVerified: broker.reraVerified === true,
      },
      createdAt: now,
    }));
  });

  if (approved) {
    const holdSnap = await db.collection("broker_commissions")
      .where("brokerId", "==", brokerId)
      .where("status", "==", "HOLD")
      .get();
    if (!holdSnap.empty) {
      const batch = db.batch();
      holdSnap.docs.forEach((commission) => {
        batch.set(commission.ref, {
          status: "PENDING",
          complianceHold: false,
          holdReason: null,
          releasedAt: now,
          updatedAt: now,
        }, { merge: true });
        releasedCommissions += 1;
      });
      await batch.commit();
    }
  }

  return { status: "SUCCESS", brokerId, decision, releasedCommissions };
});

export const submitBrokerPayoutRequest = onCall({ cors: true, region: "europe-west3" }, async (request) => {
  const broker = await requireProfileRole(request.auth, BROKER_ROLES, "Broker");
  const uid = request.auth!.uid;
  const email = normalizedEmail(request.auth?.token?.email || broker.email);

  if (broker.reraVerified !== true || normalizedRole(broker.brokerKycStatus) !== "verified") {
    throw new HttpsError("failed-precondition", "Broker KYC must be admin verified before payout requests.");
  }
  if (broker.commissionAgreementAccepted !== true) {
    throw new HttpsError("failed-precondition", "Commission agreement must be accepted before payout requests.");
  }
  if (!text(broker.bankIban || broker.iban) || !text(broker.bankName)) {
    throw new HttpsError("failed-precondition", "Broker bank name and IBAN are required before payout requests.");
  }

  const rawIds = Array.isArray(request.data?.commissionIds) ? request.data.commissionIds : [];
  const requestedCommissionIds = rawIds
    .map((value: unknown) => text(value))
    .filter((value: string) => Boolean(value));
  let commissionIds: string[] = Array.from(new Set<string>(requestedCommissionIds)).slice(0, 50);
  if (!commissionIds.length) {
    const payableSnap = await db.collection("broker_commissions")
      .where("brokerId", "==", uid)
      .where("status", "==", "APPROVED")
      .limit(50)
      .get();
    commissionIds = payableSnap.docs
      .filter((docSnap) => !["REQUESTED", "APPROVED", "PAID"].includes(text(docSnap.data().payoutStatus).toUpperCase()))
      .map((docSnap) => docSnap.id);
  }

  if (!commissionIds.length) throw new HttpsError("failed-precondition", "No approved unpaid commissions are available for payout.");

  const commissionDocs = await Promise.all(commissionIds.map((id) => db.collection("broker_commissions").doc(id).get()));
  const invalid = commissionDocs.find((docSnap) => {
    if (!docSnap.exists) return true;
    const data = docSnap.data() || {};
    const payoutStatus = text(data.payoutStatus).toUpperCase();
    return data.brokerId !== uid ||
      text(data.status).toUpperCase() !== "APPROVED" ||
      ["REQUESTED", "APPROVED", "PAID"].includes(payoutStatus);
  });
  if (invalid) throw new HttpsError("permission-denied", "One or more commissions are not eligible for this broker payout request.");

  const amount = commissionDocs.reduce((sum, docSnap) => sum + numberValue(docSnap.data()?.amount), 0);
  if (amount <= 0) throw new HttpsError("failed-precondition", "Payout amount must be greater than zero.");

  const now = ts();
  const payoutRef = db.collection("broker_payout_requests").doc();
  const batch = db.batch();
  const notes = text(request.data?.notes);

  batch.set(payoutRef, clean({
    brokerId: uid,
    brokerUid: uid,
    brokerEmail: email,
    brokerName: text(broker.displayName || broker.name || request.auth?.token?.name, "Broker"),
    brokerCode: text(broker.brokerCode || broker.affiliateCode || `BIN-${uid.slice(0, 8).toUpperCase()}`),
    amount,
    currency: "AED",
    commissionIds,
    commissionCount: commissionIds.length,
    bankName: text(broker.bankName),
    bankAccountHolder: text(broker.bankAccountHolder || broker.displayName || broker.name),
    bankIban: text(broker.bankIban || broker.iban),
    status: "PENDING_ADMIN_REVIEW",
    approvalStatus: "PENDING",
    paymentStatus: "REQUESTED",
    verificationState: "ADMIN_FINANCE_REVIEW_REQUIRED",
    notes: notes || null,
    requestedBy: uid,
    requestedAt: now,
    createdAt: now,
    updatedAt: now,
  }));

  commissionDocs.forEach((docSnap) => {
    batch.set(docSnap.ref, {
      payoutStatus: "REQUESTED",
      payoutRequestId: payoutRef.id,
      payoutRequestedAt: now,
      updatedAt: now,
    }, { merge: true });
  });

  batch.set(db.collection("auditLogs").doc(), clean({
    action: "BROKER_PAYOUT_REQUEST_SUBMITTED",
    actorId: uid,
    actorEmail: email,
    brokerId: uid,
    payoutRequestId: payoutRef.id,
    commissionIds,
    amount,
    createdAt: now,
  }));

  await batch.commit();
  return { status: "SUCCESS", payoutRequestId: payoutRef.id, amount, commissionCount: commissionIds.length };
});

export const adminReviewBrokerPayoutRequest = onCall({ cors: true, region: "europe-west3" }, async (request) => {
  await requireAdmin(request.auth);

  const requestId = text(request.data?.requestId || request.data?.payoutRequestId);
  const action = text(request.data?.action || request.data?.decision).toUpperCase();
  const reason = text(request.data?.reason || request.data?.notes);
  if (!requestId) throw new HttpsError("invalid-argument", "requestId is required.");
  if (!["APPROVE", "REJECT", "MARK_PAID"].includes(action)) throw new HttpsError("invalid-argument", "action must be APPROVE, REJECT, or MARK_PAID.");
  if (action === "REJECT" && !reason) throw new HttpsError("invalid-argument", "A rejection reason is required.");

  const payoutRef = db.collection("broker_payout_requests").doc(requestId);
  const payoutSnap = await payoutRef.get();
  if (!payoutSnap.exists) throw new HttpsError("not-found", "Payout request not found.");
  const payout = payoutSnap.data() || {};
  const currentStatus = text(payout.status).toUpperCase();
  if (currentStatus === "PAID" && action !== "MARK_PAID") {
    throw new HttpsError("failed-precondition", "Paid payout requests cannot be changed.");
  }

  const commissionIds = Array.isArray(payout.commissionIds) ? payout.commissionIds.map((value: unknown) => text(value)).filter(Boolean) : [];
  const now = ts();
  const actorId = request.auth?.uid || "admin";
  const actorEmail = request.auth?.token?.email || null;
  const batch = db.batch();

  const requestPatch: Record<string, any> = {
    reviewedBy: actorId,
    reviewedByEmail: actorEmail,
    reviewedAt: now,
    reviewReason: reason || null,
    updatedAt: now,
  };
  if (action === "APPROVE") {
    requestPatch.status = "APPROVED";
    requestPatch.approvalStatus = "APPROVED";
    requestPatch.paymentStatus = "APPROVED_FOR_PAYMENT";
    requestPatch.approvedAt = now;
    requestPatch.approvedBy = actorId;
  } else if (action === "REJECT") {
    requestPatch.status = "REJECTED";
    requestPatch.approvalStatus = "REJECTED";
    requestPatch.paymentStatus = "REJECTED";
    requestPatch.rejectedAt = now;
    requestPatch.rejectedBy = actorId;
    requestPatch.rejectionReason = reason;
  } else {
    requestPatch.status = "PAID";
    requestPatch.paymentStatus = "PAID";
    requestPatch.paidAt = now;
    requestPatch.paidBy = actorId;
    requestPatch.paymentReference = text(request.data?.paymentReference) || null;
  }

  batch.set(payoutRef, clean(requestPatch), { merge: true });
  commissionIds.forEach((commissionId) => {
    const commissionRef = db.collection("broker_commissions").doc(commissionId);
    const commissionPatch: Record<string, any> = { updatedAt: now };
    if (action === "APPROVE") {
      commissionPatch.payoutStatus = "APPROVED";
      commissionPatch.payoutApprovedAt = now;
    } else if (action === "REJECT") {
      commissionPatch.payoutStatus = "REJECTED";
      commissionPatch.payoutRejectedAt = now;
      commissionPatch.payoutRejectionReason = reason;
    } else {
      commissionPatch.status = "PAID";
      commissionPatch.payoutStatus = "PAID";
      commissionPatch.paidAt = now;
      commissionPatch.paidDate = new Date().toISOString();
    }
    batch.set(commissionRef, commissionPatch, { merge: true });
  });

  batch.set(db.collection("auditLogs").doc(), clean({
    action: `ADMIN_${action}_BROKER_PAYOUT`,
    actorId,
    actorEmail,
    brokerId: payout.brokerId || null,
    payoutRequestId: requestId,
    commissionIds,
    amount: payout.amount || 0,
    reason: reason || null,
    createdAt: now,
  }));

  await batch.commit();
  return { status: "SUCCESS", requestId, action };
});

export const ownerGenerateUnits = onCall({ cors: true, region: "europe-west3" }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Owner login required.");

  const token = request.auth.token || {};
  const isAdmin = token.admin === true || token.isAdmin === true || hasRole(token, ADMIN_ROLES);
  if (!isAdmin) await requireProfileRole(request.auth, OWNER_ROLES, "Owner");

  const propertyId = text(request.data?.propertyId);
  const count = Math.min(Math.max(Math.floor(numberValue(request.data?.count, 0)), 1), 100);
  const prefix = text(request.data?.prefix).toUpperCase();
  const startNumber = Math.max(Math.floor(numberValue(request.data?.startNumber, 1)), 1);
  const padding = Math.min(Math.max(Math.floor(numberValue(request.data?.padding, 0)), 0), 4);
  const floor = text(request.data?.floor);
  const rentAmount = numberValue(request.data?.rentAmount || request.data?.annualRent, 0);
  if (!propertyId) throw new HttpsError("invalid-argument", "propertyId is required.");

  const propertyRef = db.collection("properties").doc(propertyId);
  const propertySnap = await propertyRef.get();
  if (!propertySnap.exists) throw new HttpsError("not-found", "Property record not found.");
  const property = propertySnap.data() || {};
  if (!isAdmin && !ownsProperty(request.auth, property)) {
    throw new HttpsError("permission-denied", "Owners can generate units only for their own properties.");
  }

  const existingSnap = await db.collection("units").where("propertyId", "==", propertyId).get();
  const existingNumbers = new Set(existingSnap.docs.map((docSnap) => text(docSnap.data().unitNumber).toLowerCase()).filter(Boolean));
  const created: string[] = [];
  const skipped: string[] = [];
  const now = ts();
  const batch = db.batch();

  for (let index = 0; index < count; index += 1) {
    const sequence = String(startNumber + index).padStart(padding, "0");
    const unitNumber = `${prefix}${sequence}`;
    if (existingNumbers.has(unitNumber.toLowerCase())) {
      skipped.push(unitNumber);
      continue;
    }
    const unitId = docId(`${propertyId}_${unitNumber}`) || db.collection("units").doc().id;
    const unitRef = db.collection("units").doc(unitId);
    const unitSnap = await unitRef.get();
    if (unitSnap.exists) {
      skipped.push(unitNumber);
      continue;
    }
    batch.set(unitRef, clean({
      propertyId,
      propertyName: text(property.propertyName || property.name || property.address, "Property"),
      unitNumber,
      floor: floor || null,
      floorNumber: numberValue(floor, 0) || null,
      ownerId: text(property.ownerId || request.auth.uid),
      ownerUid: text(property.ownerUid || property.ownerId || request.auth.uid),
      ownerEmail: normalizedEmail(property.ownerEmail || request.auth.token?.email),
      occupancyStatus: "vacant",
      status: "VACANT",
      tenantStatus: "none",
      maintenanceStatus: "normal",
      rentAmount: rentAmount > 0 ? rentAmount : null,
      annualRent: rentAmount > 0 ? rentAmount : null,
      source: "OWNER_UNIT_GENERATION_WIZARD",
      createdBy: request.auth.uid,
      createdByOwnerUid: request.auth.uid,
      createdAt: now,
      updatedAt: now,
    }));
    existingNumbers.add(unitNumber.toLowerCase());
    created.push(unitNumber);
  }

  if (!created.length) {
    return { status: "NO_CHANGES", propertyId, createdCount: 0, skipped };
  }

  batch.set(db.collection("auditLogs").doc(), clean({
    action: "OWNER_GENERATE_UNITS",
    actorId: request.auth.uid,
    actorEmail: request.auth.token?.email || null,
    propertyId,
    createdUnits: created,
    skippedUnits: skipped,
    createdAt: now,
  }));

  await batch.commit();
  return { status: "SUCCESS", propertyId, createdCount: created.length, createdUnits: created, skipped };
});

export const tenantRequestUnitLink = onCall({ cors: true, region: "europe-west3" }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Tenant login required.");

  const uid = request.auth.uid;
  const email = normalizedEmail(request.auth.token?.email);
  const propertyName = text(request.data?.propertyName);
  const propertyId = text(request.data?.propertyId);
  const unitNumber = text(request.data?.unitNumber);
  const leaseReference = text(request.data?.leaseReference);
  const notes = text(request.data?.notes);
  const verification = hashOptionalCode(request.data?.verificationCode);
  if (!propertyName && !propertyId) throw new HttpsError("invalid-argument", "Property name or property ID is required.");
  if (!unitNumber) throw new HttpsError("invalid-argument", "Unit number is required.");

  let candidateUnitId = "";
  if (propertyId) {
    const candidateSnap = await db.collection("units")
      .where("propertyId", "==", propertyId)
      .where("unitNumber", "==", unitNumber)
      .limit(1)
      .get();
    if (!candidateSnap.empty) candidateUnitId = candidateSnap.docs[0].id;
  }

  const now = ts();
  const requestRef = db.collection("tenant_unit_link_requests").doc();
  await requestRef.set(clean({
    tenantUid: uid,
    tenantId: uid,
    tenantEmail: email,
    tenantName: text(request.auth.token?.name),
    propertyId: propertyId || null,
    propertyName: propertyName || null,
    unitNumber,
    candidateUnitId: candidateUnitId || null,
    leaseReference: leaseReference || null,
    verificationCodeHash: verification.hash,
    verificationCodeLast4: verification.last4,
    notes: notes || null,
    status: "PENDING_ADMIN_REVIEW",
    verificationState: "ADMIN_OR_OWNER_VERIFICATION_REQUIRED",
    source: "TENANT_NO_UNIT_FALLBACK",
    createdByUid: uid,
    createdAt: now,
    updatedAt: now,
  }));

  await db.collection("auditLogs").add(clean({
    action: "TENANT_UNIT_LINK_REQUESTED",
    actorId: uid,
    actorEmail: email,
    targetType: "tenant_unit_link_requests",
    targetId: requestRef.id,
    propertyId: propertyId || null,
    unitNumber,
    createdAt: now,
  }));

  return { status: "PENDING_ADMIN_REVIEW", requestId: requestRef.id };
});
