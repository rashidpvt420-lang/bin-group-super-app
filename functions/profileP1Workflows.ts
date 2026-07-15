import { FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { isValidReraFormat } from "./brokerCommissions";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const ts = () => FieldValue.serverTimestamp();

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
  if (value instanceof FieldValue) return value;
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
  if (token.suspended === true) throw new HttpsError("permission-denied", "Suspended admin account.");
  const userRecord = await admin.auth().getUser(auth.uid);
  if (userRecord.disabled) throw new HttpsError("permission-denied", "Disabled admin account.");
  if (
    token.admin === true ||
    token.isAdmin === true ||
    token.superAdmin === true ||
    token.super_admin === true ||
    hasRole(token, ADMIN_ROLES)
  ) {
    return;
  }
  throw new HttpsError("permission-denied", "Admin permission required.");
}

async function requireProfileRole(auth: any, allowed: Set<string>, label: string) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", `${label} login required.`);
  if (auth.token?.suspended === true) {
    throw new HttpsError("permission-denied", `${label} account is suspended.`);
  }
  if (hasRole(auth.token || {}, allowed)) {
    const [profile, userRecord] = await Promise.all([
      profileFor(auth.uid),
      admin.auth().getUser(auth.uid),
    ]);
    if (
      userRecord.disabled ||
      ["suspended", "disabled", "rejected"].includes(normalizedRole(profile.data.status))
    ) {
      throw new HttpsError("permission-denied", `${label} account is not active.`);
    }
    return profile.data;
  }
  throw new HttpsError("permission-denied", `${label} role required.`);
}

function ownsProperty(auth: any, property: FirebaseFirestore.DocumentData) {
  const email = normalizedEmail(auth?.token?.email);
  return (
    property.ownerId === auth.uid ||
    property.ownerUid === auth.uid ||
    property.userId === auth.uid ||
    (
      auth?.token?.email_verified === true &&
      Boolean(email) &&
      normalizedEmail(property.ownerEmail) === email
    )
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

export const adminReviewBrokerKyc = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
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

  let verifiedDocumentRefs: FirebaseFirestore.DocumentReference[] = [];
  if (decision === "APPROVE") {
    const documentsSnap = await db.collection("brokerDocuments")
      .where("brokerId", "==", brokerId)
      .limit(20)
      .get();
    const documents = documentsSnap.docs.map((docSnap) => ({
      ref: docSnap.ref,
      id: docSnap.id,
      data: docSnap.data(),
    }));
    const requiredTypes = ["rera_license", "bank_details", "broker_agreement"];
    const selected = requiredTypes.map((type) =>
      documents.find((document) => text(document.data.docType) === type),
    );
    const identityDocument = documents.find((document) =>
      ["emirates_id", "passport", "trade_license"].includes(text(document.data.docType)),
    );
    if (selected.some((document) => !document) || !identityDocument) {
      throw new HttpsError(
        "failed-precondition",
        "RERA, identity, bank, and signed broker agreement documents are required for KYC approval.",
      );
    }
    const documentsToVerify = [...selected, identityDocument].filter(Boolean) as Array<{
      ref: FirebaseFirestore.DocumentReference;
      id: string;
      data: FirebaseFirestore.DocumentData;
    }>;
    for (const document of documentsToVerify) {
      const storagePath = text(document.data.storagePath);
      const documentType = text(document.data.docType);
      if (
        !storagePath.startsWith(`brokerDocuments/${brokerId}/${documentType}/`) ||
        text(document.data.status).toLowerCase() !== "pending_review"
      ) {
        throw new HttpsError("failed-precondition", "Broker document ownership or review state is invalid.");
      }
      try {
        const [metadata] = await admin.storage().bucket().file(storagePath).getMetadata();
        const contentType = text(metadata.contentType).toLowerCase();
        const size = Number(metadata.size || 0);
        const customMetadata = metadata.metadata || {};
        if (
          customMetadata.brokerId !== brokerId ||
          customMetadata.documentType !== documentType ||
          !["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic"].includes(contentType) ||
          size <= 0 ||
          size > 15 * 1024 * 1024
        ) {
          throw new Error("metadata mismatch");
        }
      } catch {
        throw new HttpsError(
          "failed-precondition",
          `Stored ${documentType} evidence is missing or its immutable metadata does not match.`,
        );
      }
    }
    verifiedDocumentRefs = documentsToVerify.map((document) => document.ref);
  }

  const now = ts();
  const actorId = request.auth?.uid || "admin";
  const actorEmail = request.auth?.token?.email || null;
  const approved = decision === "APPROVE";
  let releasedCommissions = 0;

  await db.runTransaction(async (transaction) => {
    const freshBrokerSnap = await transaction.get(brokerRef);
    if (!freshBrokerSnap.exists) throw new HttpsError("not-found", "Broker profile not found.");
    const freshDocuments = await Promise.all(
      verifiedDocumentRefs.map((documentRef) => transaction.get(documentRef)),
    );
    if (
      decision === "APPROVE" &&
      freshDocuments.some((documentSnap) =>
        !documentSnap.exists ||
        documentSnap.data()?.brokerId !== brokerId ||
        text(documentSnap.data()?.status).toLowerCase() !== "pending_review"
      )
    ) {
      throw new HttpsError("failed-precondition", "Broker documents changed during KYC review.");
    }
    transaction.set(brokerRef, clean({
      status: approved ? "APPROVED" : "REJECTED",
      approvalStatus: approved ? "APPROVED" : "REJECTED",
      kycStatus: approved ? "VERIFIED" : "REJECTED",
      brokerKycStatus: approved ? "VERIFIED" : "REJECTED",
      reraVerified: approved,
      ibanVerified: approved,
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
    freshDocuments.forEach((documentSnap) => {
      transaction.set(documentSnap.ref, {
        status: approved ? "verified" : "rejected",
        reviewedAt: now,
        reviewedBy: actorId,
        updatedAt: now,
      }, { merge: true });
    });

    const auditRef = db.collection("audit_logs").doc();
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

export const submitBrokerPayoutRequest = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const broker = await requireProfileRole(request.auth, BROKER_ROLES, "Broker");
  const uid = request.auth!.uid;
  const email = normalizedEmail(request.auth?.token?.email || broker.email);

  if (broker.reraVerified !== true || normalizedRole(broker.brokerKycStatus) !== "verified") {
    throw new HttpsError("failed-precondition", "Broker KYC must be admin verified before payout requests.");
  }
  if (broker.commissionAgreementAccepted !== true) {
    throw new HttpsError("failed-precondition", "Commission agreement must be accepted before payout requests.");
  }
  if (
    !text(broker.bankIban || broker.iban) ||
    !text(broker.bankName) ||
    broker.ibanVerified !== true
  ) {
    throw new HttpsError("failed-precondition", "An admin-verified broker bank name and IBAN are required before payout requests.");
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

  const now = ts();
  const payoutRef = db.collection("broker_payout_requests").doc();
  const notes = text(request.data?.notes);
  const commissionRefs = commissionIds.map((commissionId) => db.collection("broker_commissions").doc(commissionId));
  const amount = await db.runTransaction(async (transaction) => {
    const commissionDocs = await Promise.all(commissionRefs.map((commissionRef) => transaction.get(commissionRef)));
    const invalid = commissionDocs.find((docSnap) => {
      if (!docSnap.exists) return true;
      const data = docSnap.data() || {};
      const payoutStatus = text(data.payoutStatus).toUpperCase();
      return data.brokerId !== uid ||
        text(data.status).toUpperCase() !== "APPROVED" ||
        ["REQUESTED", "APPROVED", "PAID"].includes(payoutStatus);
    });
    if (invalid) throw new HttpsError("permission-denied", "One or more commissions are not eligible for this broker payout request.");

    const total = commissionDocs.reduce((sum, docSnap) => sum + numberValue(docSnap.data()?.amount), 0);
    if (total <= 0) throw new HttpsError("failed-precondition", "Payout amount must be greater than zero.");

    transaction.set(payoutRef, clean({
      brokerId: uid,
      brokerUid: uid,
      brokerEmail: email,
      brokerName: text(broker.displayName || broker.name || request.auth?.token?.name, "Broker"),
      brokerCode: text(broker.brokerCode || broker.affiliateCode || `BIN-${uid.slice(0, 8).toUpperCase()}`),
      amount: total,
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
      transaction.set(docSnap.ref, {
        payoutStatus: "REQUESTED",
        payoutRequestId: payoutRef.id,
        payoutRequestedAt: now,
        updatedAt: now,
      }, { merge: true });
    });
    transaction.set(db.collection("audit_logs").doc(), clean({
      action: "BROKER_PAYOUT_REQUEST_SUBMITTED",
      actorId: uid,
      actorEmail: email,
      brokerId: uid,
      payoutRequestId: payoutRef.id,
      commissionIds,
      amount: total,
      createdAt: now,
    }));
    return total;
  });
  return { status: "SUCCESS", payoutRequestId: payoutRef.id, amount, commissionCount: commissionIds.length };
});

export const adminReviewBrokerPayoutRequest = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  await requireAdmin(request.auth);

  const requestId = text(request.data?.requestId || request.data?.payoutRequestId);
  const action = text(request.data?.action || request.data?.decision).toUpperCase();
  const reason = text(request.data?.reason || request.data?.notes);
  if (!requestId) throw new HttpsError("invalid-argument", "requestId is required.");
  if (!["APPROVE", "REJECT", "MARK_PAID"].includes(action)) throw new HttpsError("invalid-argument", "action must be APPROVE, REJECT, or MARK_PAID.");
  if (action === "REJECT" && !reason) throw new HttpsError("invalid-argument", "A rejection reason is required.");
  const paymentReference = text(request.data?.paymentReference);
  if (action === "MARK_PAID" && paymentReference.length < 4) {
    throw new HttpsError("invalid-argument", "A durable payment reference is required before marking a payout paid.");
  }

  const payoutRef = db.collection("broker_payout_requests").doc(requestId);
  const now = ts();
  const actorId = request.auth?.uid || "admin";
  const actorEmail = request.auth?.token?.email || null;
  await db.runTransaction(async (transaction) => {
    const payoutSnap = await transaction.get(payoutRef);
    if (!payoutSnap.exists) throw new HttpsError("not-found", "Payout request not found.");
    const payout = payoutSnap.data() || {};
    const currentStatus = text(payout.status).toUpperCase();
    const targetStatus = action === "APPROVE" ? "APPROVED" : action === "REJECT" ? "REJECTED" : "PAID";
    if (currentStatus === targetStatus) return;
    if (action === "APPROVE" && currentStatus !== "PENDING_ADMIN_REVIEW") {
      throw new HttpsError("failed-precondition", "Only pending payout requests can be approved.");
    }
    if (action === "REJECT" && !["PENDING_ADMIN_REVIEW", "APPROVED"].includes(currentStatus)) {
      throw new HttpsError("failed-precondition", "This payout request cannot be rejected from its current state.");
    }
    if (action === "MARK_PAID" && currentStatus !== "APPROVED") {
      throw new HttpsError("failed-precondition", "A payout request must be approved before settlement.");
    }
    const commissionIds = Array.isArray(payout.commissionIds)
      ? payout.commissionIds.map((value: unknown) => text(value)).filter(Boolean)
      : [];
    if (!commissionIds.length || commissionIds.length > 50) {
      throw new HttpsError("failed-precondition", "Payout request commission binding is invalid.");
    }
    const commissionRefs = commissionIds.map((id) => db.collection("broker_commissions").doc(id));
    const commissionDocs = await Promise.all(commissionRefs.map((ref) => transaction.get(ref)));
    for (const commissionSnap of commissionDocs) {
      const commission = commissionSnap.data() || {};
      if (
        !commissionSnap.exists ||
        commission.brokerId !== payout.brokerId ||
        text(commission.payoutRequestId) !== requestId
      ) {
        throw new HttpsError("failed-precondition", "Payout request contains an invalid commission binding.");
      }
      const payoutStatus = text(commission.payoutStatus).toUpperCase();
      if (action === "APPROVE" && payoutStatus !== "REQUESTED") {
        throw new HttpsError("failed-precondition", "Every commission must still be awaiting payout approval.");
      }
      if (action === "MARK_PAID" && payoutStatus !== "APPROVED") {
        throw new HttpsError("failed-precondition", "Every commission must be payout-approved before settlement.");
      }
    }

    const requestPatch: Record<string, any> = {
      status: targetStatus,
      reviewedBy: actorId,
      reviewedByEmail: actorEmail,
      reviewedAt: now,
      reviewReason: reason || null,
      updatedAt: now,
    };
    if (action === "APPROVE") {
      Object.assign(requestPatch, {
        approvalStatus: "APPROVED",
        paymentStatus: "APPROVED_FOR_PAYMENT",
        approvedAt: now,
        approvedBy: actorId,
      });
    } else if (action === "REJECT") {
      Object.assign(requestPatch, {
        approvalStatus: "REJECTED",
        paymentStatus: "REJECTED",
        rejectedAt: now,
        rejectedBy: actorId,
        rejectionReason: reason,
      });
    } else {
      Object.assign(requestPatch, {
        paymentStatus: "PAID",
        paidAt: now,
        paidBy: actorId,
        paymentReference,
      });
    }
    transaction.set(payoutRef, clean(requestPatch), { merge: true });
    commissionDocs.forEach((commissionSnap) => {
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
        commissionPatch.paymentReference = paymentReference;
      }
      transaction.set(commissionSnap.ref, commissionPatch, { merge: true });
    });
    transaction.set(db.collection("audit_logs").doc(), clean({
      action: `ADMIN_${action}_BROKER_PAYOUT`,
      actorId,
      actorEmail,
      brokerId: payout.brokerId || null,
      payoutRequestId: requestId,
      commissionIds,
      amount: payout.amount || 0,
      reason: reason || null,
      paymentReference: action === "MARK_PAID" ? paymentReference : null,
      createdAt: now,
    }));
  });
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

  const existingSnap = await db.collection("units").where("propertyId", "==", propertyId).limit(2000).get();
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

  batch.set(db.collection("audit_logs").doc(), clean({
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

  await db.collection("audit_logs").add(clean({
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

export const adminResolveTenantUnitLink = onCall({ cors: true, region: "europe-west3" }, async (request) => {
  await requireAdmin(request.auth);

  const requestId = text(request.data?.requestId);
  const decision = text(request.data?.decision).toUpperCase();
  if (!requestId) throw new HttpsError("invalid-argument", "requestId is required.");
  if (!["APPROVE", "REJECT"].includes(decision)) {
    throw new HttpsError("invalid-argument", "decision must be APPROVE or REJECT.");
  }

  const requestRef = db.collection("tenant_unit_link_requests").doc(requestId);
  const initialRequest = await requestRef.get();
  if (!initialRequest.exists) throw new HttpsError("not-found", "Tenant unit-link request not found.");
  const initialData = initialRequest.data() || {};
  const requestedPropertyId = text(initialData.propertyId);
  const requestedUnitNumber = text(initialData.unitNumber);
  let unitId = text(request.data?.unitId || initialData.candidateUnitId);

  if (decision === "APPROVE" && !unitId && requestedPropertyId && requestedUnitNumber) {
    const candidates = await db.collection("units")
      .where("propertyId", "==", requestedPropertyId)
      .where("unitNumber", "==", requestedUnitNumber)
      .limit(1)
      .get();
    unitId = candidates.docs[0]?.id || "";
  }
  if (decision === "APPROVE" && !unitId) {
    throw new HttpsError("failed-precondition", "No existing unit matches this request.");
  }

  const actorId = request.auth?.uid || "admin";
  const now = ts();
  await db.runTransaction(async (transaction) => {
    const requestSnap = await transaction.get(requestRef);
    if (!requestSnap.exists) throw new HttpsError("not-found", "Tenant unit-link request not found.");
    const data = requestSnap.data() || {};
    if (text(data.status).toUpperCase() !== "PENDING_ADMIN_REVIEW") {
      throw new HttpsError("failed-precondition", "Tenant unit-link request has already been resolved.");
    }

    const tenantId = text(data.tenantUid || data.tenantId);
    if (!tenantId) throw new HttpsError("failed-precondition", "Tenant identity is missing from the request.");

    if (decision === "REJECT") {
      transaction.set(requestRef, {
        status: "REJECTED",
        verificationState: "ADMIN_REJECTED",
        resolvedAt: now,
        resolvedBy: actorId,
        updatedAt: now,
      }, { merge: true });
      transaction.set(db.collection("audit_logs").doc(), {
        action: "ADMIN_REJECTED_TENANT_UNIT_LINK",
        actorId,
        actorRole: "admin",
        targetType: "tenant_unit_link_requests",
        targetId: requestId,
        createdAt: now,
      });
      return;
    }

    const unitRef = db.collection("units").doc(unitId);
    const unitSnap = await transaction.get(unitRef);
    if (!unitSnap.exists) throw new HttpsError("not-found", "Selected unit does not exist.");
    const unit = unitSnap.data() || {};
    if (text(unit.propertyId) !== text(data.propertyId)) {
      throw new HttpsError("failed-precondition", "Selected unit is not part of the requested property.");
    }
    const existingTenantId = text(unit.tenantUid || unit.tenantId || unit.currentTenantId);
    if (existingTenantId && existingTenantId !== tenantId) {
      throw new HttpsError("already-exists", "Selected unit is already linked to another tenant.");
    }

    transaction.set(unitRef, {
      tenantId,
      tenantUid: tenantId,
      currentTenantId: tenantId,
      tenantEmail: normalizedEmail(data.tenantEmail),
      tenantName: text(data.tenantName),
      occupancyStatus: "occupied",
      tenantStatus: "linked",
      status: "OCCUPIED",
      linkedBy: actorId,
      linkedAt: now,
      updatedAt: now,
    }, { merge: true });
    transaction.set(db.collection("users").doc(tenantId), {
      unitId,
      propertyId: text(data.propertyId),
      tenantUnitLinkVerified: true,
      tenantUnitLinkedAt: now,
      updatedAt: now,
    }, { merge: true });
    transaction.set(requestRef, {
      status: "APPROVED",
      verificationState: "ADMIN_VERIFIED",
      linkedUnitId: unitId,
      linkedAt: now,
      resolvedAt: now,
      resolvedBy: actorId,
      updatedAt: now,
    }, { merge: true });
    transaction.set(db.collection("audit_logs").doc(), {
      action: "ADMIN_APPROVED_TENANT_UNIT_LINK",
      actorId,
      actorRole: "admin",
      targetType: "tenant_unit_link_requests",
      targetId: requestId,
      metadata: { propertyId: text(data.propertyId), unitId, tenantId },
      createdAt: now,
    });
  });

  return { status: decision === "APPROVE" ? "APPROVED" : "REJECTED", requestId, unitId: unitId || null };
});

export const adminRepairOrphanLinkage = onCall({ cors: true, region: "europe-west3" }, async (request) => {
  await requireAdmin(request.auth);

  const orphanId = text(request.data?.orphanId);
  const orphanType = text(request.data?.orphanType).toUpperCase();
  const propertyId = text(request.data?.propertyId);
  const unitId = text(request.data?.unitId);
  if (!orphanId || !["TICKET", "TENANT"].includes(orphanType) || !propertyId || !unitId) {
    throw new HttpsError("invalid-argument", "orphanId, orphanType, propertyId, and unitId are required.");
  }

  const propertyRef = db.collection("properties").doc(propertyId);
  const unitRef = db.collection("units").doc(unitId);
  const targetRef = db.collection(orphanType === "TICKET" ? "maintenanceTickets" : "users").doc(orphanId);
  const actorId = request.auth?.uid || "admin";
  const now = ts();

  await db.runTransaction(async (transaction) => {
    const [propertySnap, unitSnap, targetSnap] = await Promise.all([
      transaction.get(propertyRef),
      transaction.get(unitRef),
      transaction.get(targetRef),
    ]);
    if (!propertySnap.exists || !unitSnap.exists || !targetSnap.exists) {
      throw new HttpsError("not-found", "Property, unit, or orphan record no longer exists.");
    }
    const property = propertySnap.data() || {};
    const unit = unitSnap.data() || {};
    if (text(unit.propertyId) !== propertyId) {
      throw new HttpsError("failed-precondition", "Selected unit does not belong to the selected property.");
    }

    const commonPatch = {
      propertyId,
      unitId,
      propertyName: text(property.name || property.propertyName),
      unitNumber: text(unit.unitNumber),
      ownerId: text(property.ownerId || property.ownerUid),
      repairedAt: now,
      repairedBy: actorId,
      repairSource: "ADMIN_WAR_ROOM_CALLABLE",
      updatedAt: now,
    };

    if (orphanType === "TICKET") {
      transaction.set(targetRef, { ...commonPatch, status: "OPEN" }, { merge: true });
    } else {
      const existingTenantId = text(unit.tenantUid || unit.tenantId || unit.currentTenantId);
      if (existingTenantId && existingTenantId !== orphanId) {
        throw new HttpsError("already-exists", "Selected unit is already linked to another tenant.");
      }
      transaction.set(targetRef, commonPatch, { merge: true });
      transaction.set(unitRef, {
        occupancyStatus: "OCCUPIED",
        currentTenantId: orphanId,
        tenantId: orphanId,
        tenantUid: orphanId,
        linkedBy: actorId,
        linkedAt: now,
        updatedAt: now,
      }, { merge: true });
    }

    transaction.set(db.collection("audit_logs").doc(), {
      action: "SECURE_LINKAGE_REPAIR",
      actorId,
      actorRole: "admin",
      targetType: orphanType === "TICKET" ? "maintenanceTickets" : "users",
      targetId: orphanId,
      metadata: { orphanType, propertyId, unitId },
      createdAt: now,
    });
  });

  return { status: "REPAIRED", orphanId, orphanType, propertyId, unitId };
});

export const adminRepairPropertyGeo = onCall({ cors: true, region: "europe-west3" }, async (request) => {
  await requireAdmin(request.auth);

  const propertyId = text(request.data?.propertyId);
  const lat = numberValue(request.data?.lat, Number.NaN);
  const lng = numberValue(request.data?.lng, Number.NaN);
  if (!propertyId || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new HttpsError("invalid-argument", "A propertyId and valid latitude/longitude are required.");
  }
  const propertyRef = db.collection("properties").doc(propertyId);
  const propertySnap = await propertyRef.get();
  if (!propertySnap.exists) throw new HttpsError("not-found", "Property not found.");
  const property = propertySnap.data() || {};
  const actorId = request.auth?.uid || "admin";
  const now = ts();
  const address = text(request.data?.address || property.addressLine || property.address);
  const emirate = text(request.data?.emirate || property.emirate);
  const city = text(request.data?.city || property.city || property.area);
  const area = text(request.data?.area || property.area || property.city);
  const companyId = text(property.companyId, "BIN_GROUP");
  const geo = {
    lat,
    lng,
    latitude: lat,
    longitude: lng,
    point: new admin.firestore.GeoPoint(lat, lng),
    address,
    emirate,
    city,
    area,
    source: "ADMIN_WAR_ROOM_CALLABLE",
    verified: true,
  };

  const batch = db.batch();
  const patch = {
    geo,
    location: { lat, lng },
    coordinates: { lat, lng },
    addressLine: address,
    emirate,
    city,
    area,
    geoAnchorStatus: "admin_repaired",
    updatedAt: now,
  };
  batch.set(propertyRef, patch, { merge: true });
  batch.set(db.collection("companies").doc(companyId).collection("properties").doc(propertyId), {
    ...patch,
    propertyId,
    companyId,
  }, { merge: true });
  batch.set(db.collection("audit_logs").doc(), {
    action: "GEO_ANCHOR_REPAIR",
    actorId,
    actorRole: "admin",
    targetType: "properties",
    targetId: propertyId,
    metadata: { companyId, lat, lng },
    createdAt: now,
  });
  await batch.commit();

  return { status: "REPAIRED", propertyId };
});
