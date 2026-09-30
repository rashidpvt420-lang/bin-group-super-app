import * as admin from "firebase-admin";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const ts = admin.firestore.FieldValue.serverTimestamp;

const text = (value: unknown, maxLength = 1000) => String(value ?? "").trim().slice(0, maxLength);
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "manager", "operations_admin"]);

export function assertTenantUnitLinkReviewEvidence(data: any) {
  const decision = text(data?.decision, 24).toUpperCase();
  if (!["APPROVE", "REJECT"].includes(decision)) {
    throw new HttpsError("invalid-argument", "decision must be APPROVE or REJECT.");
  }
  const reason = text(data?.reason || data?.rejectionReason || data?.notes);
  if (decision === "REJECT" && reason.length < 8) {
    throw new HttpsError(
      "invalid-argument",
      "A rejection reason of at least 8 characters is required and retained in the review history.",
    );
  }
  return { decision, reason };
}

async function requireAdmin(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const token = auth.token || {};
  const role = text(token.role || token.userRole || token.primaryRole, 40).toLowerCase();
  const allowed = token.admin === true
    || token.isAdmin === true
    || token.superAdmin === true
    || token.super_admin === true
    || ADMIN_ROLES.has(role);
  if (!allowed) throw new HttpsError("permission-denied", "Admin permission required.");
  const record = await admin.auth().getUser(auth.uid);
  if (record.disabled || token.suspended === true) {
    throw new HttpsError("permission-denied", "Admin account is disabled or suspended.");
  }
}

export const adminResolveTenantUnitLink = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    await requireAdmin(request.auth);
    const requestId = text(request.data?.requestId, 128);
    const requestedUnitId = text(request.data?.unitId, 128);
    const { decision, reason } = assertTenantUnitLinkReviewEvidence(request.data);
    if (!requestId) throw new HttpsError("invalid-argument", "requestId is required.");

    const requestRef = db.collection("tenant_unit_link_requests").doc(requestId);
    const initialRequest = await requestRef.get();
    if (!initialRequest.exists) throw new HttpsError("not-found", "Tenant unit-link request not found.");
    const initialData = initialRequest.data() || {};
    const requestedPropertyId = text(initialData.propertyId, 128);
    const requestedUnitNumber = text(initialData.unitNumber, 80);
    let unitId = requestedUnitId || text(initialData.candidateUnitId, 128);

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

    const actorId = request.auth!.uid;
    const actorEmail = text(request.auth?.token?.email, 320).toLowerCase() || null;
    const now = ts();

    await db.runTransaction(async (transaction) => {
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists) throw new HttpsError("not-found", "Tenant unit-link request not found.");
      const data = requestSnap.data() || {};
      if (text(data.status, 80).toUpperCase() !== "PENDING_ADMIN_REVIEW") {
        throw new HttpsError("failed-precondition", "Tenant unit-link request has already been resolved.");
      }

      const tenantId = text(data.tenantUid || data.tenantId, 128);
      if (!tenantId) throw new HttpsError("failed-precondition", "Tenant identity is missing from the request.");

      if (decision === "REJECT") {
        transaction.set(requestRef, {
          status: "REJECTED",
          verificationState: "ADMIN_REJECTED",
          rejectionReason: reason,
          resolutionReason: reason,
          resolvedAt: now,
          resolvedBy: actorId,
          resolvedByEmail: actorEmail,
          updatedAt: now,
        }, { merge: true });
        transaction.set(db.collection("audit_logs").doc(), {
          action: "ADMIN_REJECTED_TENANT_UNIT_LINK",
          actorId,
          actorEmail,
          actorRole: "admin",
          targetType: "tenant_unit_link_requests",
          targetId: requestId,
          reason,
          metadata: { tenantId, propertyId: text(data.propertyId, 128), unitNumber: text(data.unitNumber, 80) },
          createdAt: now,
        });
        return;
      }

      const unitRef = db.collection("units").doc(unitId);
      const unitSnap = await transaction.get(unitRef);
      if (!unitSnap.exists) throw new HttpsError("not-found", "Selected unit does not exist.");
      const unit = unitSnap.data() || {};
      if (text(unit.propertyId, 128) !== text(data.propertyId, 128)) {
        throw new HttpsError("failed-precondition", "Selected unit is not part of the requested property.");
      }
      const existingTenantId = text(unit.tenantUid || unit.tenantId || unit.currentTenantId, 128);
      if (existingTenantId && existingTenantId !== tenantId) {
        throw new HttpsError("already-exists", "Selected unit is already linked to another tenant.");
      }

      transaction.set(unitRef, {
        tenantId,
        tenantUid: tenantId,
        currentTenantId: tenantId,
        tenantEmail: text(data.tenantEmail, 320).toLowerCase(),
        tenantName: text(data.tenantName, 180),
        occupancyStatus: "occupied",
        tenantStatus: "linked",
        status: "OCCUPIED",
        linkedBy: actorId,
        linkedAt: now,
        updatedAt: now,
      }, { merge: true });
      transaction.set(db.collection("users").doc(tenantId), {
        unitId,
        propertyId: text(data.propertyId, 128),
        tenantUnitLinkVerified: true,
        tenantUnitLinkedAt: now,
        updatedAt: now,
      }, { merge: true });
      transaction.set(requestRef, {
        status: "APPROVED",
        verificationState: "ADMIN_VERIFIED",
        linkedUnitId: unitId,
        resolutionReason: reason || null,
        linkedAt: now,
        resolvedAt: now,
        resolvedBy: actorId,
        resolvedByEmail: actorEmail,
        updatedAt: now,
      }, { merge: true });
      transaction.set(db.collection("audit_logs").doc(), {
        action: "ADMIN_APPROVED_TENANT_UNIT_LINK",
        actorId,
        actorEmail,
        actorRole: "admin",
        targetType: "tenant_unit_link_requests",
        targetId: requestId,
        reason: reason || null,
        metadata: { propertyId: text(data.propertyId, 128), unitId, tenantId },
        createdAt: now,
      });
    });

    return { status: decision === "APPROVE" ? "APPROVED" : "REJECTED", requestId, unitId: unitId || null };
  },
);
