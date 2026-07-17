import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "ceo",
  "manager",
  "operations_admin",
  "operations_manager",
]);
const CORRECTION_FIELDS = new Set([
  "displayName",
  "phoneNumber",
  "emergencyContactName",
  "emergencyContactPhone",
  "floorNumber",
  "leaseStart",
  "leaseEnd",
]);
const RESIDENCE_FIELDS = new Set(["floorNumber", "leaseStart", "leaseEnd"]);
const MAX_PENDING_REQUESTS = 5;

type CorrectionField =
  | "displayName"
  | "phoneNumber"
  | "emergencyContactName"
  | "emergencyContactPhone"
  | "floorNumber"
  | "leaseStart"
  | "leaseEnd";

type TenantAuthority = {
  uid: string;
  email: string;
  profile: FirebaseFirestore.DocumentData;
  authRecord: admin.auth.UserRecord;
};

const text = (value: unknown) => String(value ?? "").trim();
const lower = (value: unknown) => text(value).toLowerCase();
const timestamp = () => FieldValue.serverTimestamp();
const millis = (value: any) => Number(value?.toMillis?.() || 0);

function fieldOf(value: unknown): CorrectionField {
  const field = text(value);
  if (!CORRECTION_FIELDS.has(field)) {
    throw new HttpsError("invalid-argument", "Unsupported Tenant correction field.");
  }
  return field as CorrectionField;
}

function cleanRequestId(value: unknown): string {
  const requestId = text(value);
  if (!/^[A-Za-z0-9_-]{1,180}$/.test(requestId)) {
    throw new HttpsError("invalid-argument", "A valid correction request ID is required.");
  }
  return requestId;
}

function activeProfile(profile: FirebaseFirestore.DocumentData): boolean {
  return !["suspended", "disabled", "rejected"].includes(lower(profile.status));
}

async function requireTenant(auth: any): Promise<TenantAuthority> {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Tenant login required.");
  const [authRecord, profileSnap] = await Promise.all([
    admin.auth().getUser(auth.uid),
    db.collection("users").doc(auth.uid).get(),
  ]);
  const profile = profileSnap.data() || {};
  const role = lower(
    authRecord.customClaims?.role ||
    authRecord.customClaims?.userRole ||
    authRecord.customClaims?.primaryRole ||
    profile.role ||
    profile.userRole,
  );
  if (role !== "tenant") throw new HttpsError("permission-denied", "Tenant role required.");
  if (
    authRecord.disabled ||
    auth.token?.suspended === true ||
    !activeProfile(profile)
  ) {
    throw new HttpsError("permission-denied", "Tenant account is not active.");
  }
  if (!authRecord.emailVerified || !authRecord.email) {
    throw new HttpsError("failed-precondition", "A verified Tenant email is required.");
  }
  return { uid: auth.uid, email: lower(authRecord.email), profile, authRecord };
}

async function requireAdmin(auth: any): Promise<{ uid: string; email: string }> {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const record = await admin.auth().getUser(auth.uid);
  const claims = record.customClaims || {};
  const role = lower(claims.role || claims.userRole || claims.primaryRole || auth.token?.role);
  if (
    record.disabled ||
    auth.token?.suspended === true ||
    !(
      claims.admin === true ||
      claims.isAdmin === true ||
      claims.superAdmin === true ||
      claims.super_admin === true ||
      ADMIN_ROLES.has(role)
    )
  ) {
    throw new HttpsError("permission-denied", "Admin permission required.");
  }
  return { uid: auth.uid, email: lower(record.email || auth.token?.email) };
}

function residenceBelongsToTenant(
  residence: FirebaseFirestore.DocumentData,
  uid: string,
  email: string,
): boolean {
  const linkedUid = text(
    residence.tenantUid || residence.tenantId || residence.currentTenantId || residence.userId,
  );
  const linkedEmail = lower(residence.tenantEmail);
  return linkedUid === uid || (Boolean(email) && linkedEmail === email);
}

async function residenceForTenant(
  authority: TenantAuthority,
  residenceId: string,
): Promise<FirebaseFirestore.DocumentSnapshot> {
  const cleanResidenceId = cleanRequestId(residenceId);
  const residenceSnap = await db.collection("units").doc(cleanResidenceId).get();
  if (!residenceSnap.exists) throw new HttpsError("not-found", "Tenant residence was not found.");
  if (!residenceBelongsToTenant(residenceSnap.data() || {}, authority.uid, authority.email)) {
    throw new HttpsError("permission-denied", "This residence is not linked to the signed-in Tenant.");
  }
  return residenceSnap;
}

function normalizeRequestedValue(field: CorrectionField, value: unknown): string {
  const requested = text(value);
  if (["displayName", "emergencyContactName"].includes(field)) {
    if (requested.length < 2 || requested.length > 120) {
      throw new HttpsError("invalid-argument", "The requested name must contain 2 to 120 characters.");
    }
    return requested;
  }
  if (["phoneNumber", "emergencyContactPhone"].includes(field)) {
    const compact = requested.replace(/[\s()-]/g, "");
    if (!/^\+?[0-9]{8,20}$/.test(compact)) {
      throw new HttpsError("invalid-argument", "A valid phone number is required.");
    }
    return compact;
  }
  if (field === "floorNumber") {
    if (!requested || requested.length > 40) {
      throw new HttpsError("invalid-argument", "A valid floor number is required.");
    }
    return requested;
  }
  const parsed = new Date(requested);
  if (!requested || Number.isNaN(parsed.getTime())) {
    throw new HttpsError("invalid-argument", "A valid lease date is required.");
  }
  return parsed.toISOString().slice(0, 10);
}

function profileCurrentValue(
  field: CorrectionField,
  profile: FirebaseFirestore.DocumentData,
  authRecord?: admin.auth.UserRecord,
): string {
  if (field === "displayName") return text(profile.displayName || profile.name || authRecord?.displayName);
  if (field === "phoneNumber") return text(profile.phoneNumber || profile.phone || authRecord?.phoneNumber);
  if (field === "emergencyContactName") return text(profile.emergencyContact?.name);
  if (field === "emergencyContactPhone") return text(profile.emergencyContact?.phone);
  return "";
}

function residenceCurrentValue(
  field: CorrectionField,
  residence: FirebaseFirestore.DocumentData,
): string {
  if (field === "floorNumber") return text(residence.floorNumber || residence.floor);
  if (field === "leaseStart") return text(residence.leaseStart || residence.startDate);
  if (field === "leaseEnd") return text(residence.leaseEnd || residence.endDate);
  return "";
}

function serializeEvent(document: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = document.data() || {};
  return {
    id: document.id,
    eventType: text(data.eventType),
    actorRole: text(data.actorRole),
    actorId: text(data.actorId),
    reason: text(data.reason) || null,
    status: text(data.status),
    createdAtMs: millis(data.createdAt),
  };
}

async function serializeRequest(document: FirebaseFirestore.QueryDocumentSnapshot) {
  const data = document.data() || {};
  const eventsSnap = await document.ref.collection("events").orderBy("createdAt", "asc").limit(30).get();
  return {
    id: document.id,
    tenantUid: text(data.tenantUid),
    tenantEmail: text(data.tenantEmail),
    tenantName: text(data.tenantName),
    field: text(data.field),
    targetType: text(data.targetType),
    residenceId: text(data.residenceId) || null,
    propertyId: text(data.propertyId) || null,
    unitNumber: text(data.unitNumber) || null,
    currentValue: text(data.currentValue),
    requestedValue: text(data.requestedValue),
    reason: text(data.reason),
    status: text(data.status),
    reviewReason: text(data.reviewReason) || null,
    resolvedByEmail: text(data.resolvedByEmail) || null,
    authSyncState: text(data.authSyncState) || null,
    createdAtMs: millis(data.createdAt),
    updatedAtMs: millis(data.updatedAt),
    resolvedAtMs: millis(data.resolvedAt),
    events: eventsSnap.docs.map(serializeEvent),
  };
}

export const submitTenantCorrectionRequest = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const authority = await requireTenant(request.auth);
    const field = fieldOf(request.data?.field);
    const reason = text(request.data?.reason);
    if (reason.length < 8 || reason.length > 1000) {
      throw new HttpsError("invalid-argument", "Correction reason must contain 8 to 1000 characters.");
    }
    const requestedValue = normalizeRequestedValue(field, request.data?.requestedValue);
    const targetType = RESIDENCE_FIELDS.has(field) ? "RESIDENCE" : "PROFILE";
    let residenceId = "";
    let residence: FirebaseFirestore.DocumentData = {};
    if (targetType === "RESIDENCE") {
      residenceId = cleanRequestId(request.data?.residenceId);
      const residenceSnap = await residenceForTenant(authority, residenceId);
      residence = residenceSnap.data() || {};
    }
    const currentValue = targetType === "RESIDENCE"
      ? residenceCurrentValue(field, residence)
      : profileCurrentValue(field, authority.profile, authority.authRecord);
    if (lower(currentValue) === lower(requestedValue)) {
      throw new HttpsError("failed-precondition", "The requested value already matches the current record.");
    }

    const existingSnap = await db.collection("tenant_correction_requests")
      .where("tenantUid", "==", authority.uid)
      .limit(30)
      .get();
    const pending = existingSnap.docs.filter((document) => text(document.data().status) === "PENDING_ADMIN_REVIEW");
    if (pending.length >= MAX_PENDING_REQUESTS) {
      throw new HttpsError("resource-exhausted", "Resolve an existing Tenant correction before submitting another request.");
    }
    const duplicate = pending.some((document) => {
      const data = document.data() || {};
      return text(data.field) === field && text(data.residenceId) === residenceId;
    });
    if (duplicate) {
      throw new HttpsError("already-exists", "A pending correction already exists for this field.");
    }

    const now = timestamp();
    const correctionRef = db.collection("tenant_correction_requests").doc();
    const eventRef = correctionRef.collection("events").doc();
    const auditRef = db.collection("audit_logs").doc();
    const batch = db.batch();
    batch.create(correctionRef, {
      tenantUid: authority.uid,
      tenantId: authority.uid,
      tenantEmail: authority.email,
      tenantName: text(authority.profile.displayName || authority.profile.name || authority.authRecord.displayName),
      field,
      targetType,
      residenceId: residenceId || null,
      propertyId: targetType === "RESIDENCE" ? text(residence.propertyId) || null : null,
      unitNumber: targetType === "RESIDENCE" ? text(residence.unitNumber || residence.unit) || null : null,
      currentValue,
      requestedValue,
      reason,
      status: "PENDING_ADMIN_REVIEW",
      verificationState: "ADMIN_REVIEW_REQUIRED",
      createdByUid: authority.uid,
      createdAt: now,
      updatedAt: now,
    });
    batch.create(eventRef, {
      eventType: "SUBMITTED",
      actorId: authority.uid,
      actorRole: "tenant",
      status: "PENDING_ADMIN_REVIEW",
      reason,
      createdAt: now,
    });
    batch.create(auditRef, {
      action: "TENANT_CORRECTION_REQUESTED",
      actorId: authority.uid,
      actorEmail: authority.email,
      actorRole: "tenant",
      targetType: "tenant_correction_requests",
      targetId: correctionRef.id,
      field,
      residenceId: residenceId || null,
      createdAt: now,
    });
    await batch.commit();
    return { status: "PENDING_ADMIN_REVIEW", requestId: correctionRef.id };
  },
);

export const listTenantCorrectionRequests = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const authority = await requireTenant(request.auth);
    const snapshot = await db.collection("tenant_correction_requests")
      .where("tenantUid", "==", authority.uid)
      .limit(50)
      .get();
    const sorted = [...snapshot.docs].sort((left, right) => millis(right.data().createdAt) - millis(left.data().createdAt));
    return { requests: await Promise.all(sorted.map(serializeRequest)) };
  },
);

export const listAdminTenantCorrectionRequests = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    await requireAdmin(request.auth);
    const requestedStatus = text(request.data?.status || "ALL").toUpperCase();
    if (!["ALL", "PENDING_ADMIN_REVIEW", "APPROVED", "REJECTED"].includes(requestedStatus)) {
      throw new HttpsError("invalid-argument", "Unsupported Tenant correction status filter.");
    }
    const snapshot = await db.collection("tenant_correction_requests")
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    const documents = requestedStatus === "ALL"
      ? snapshot.docs
      : snapshot.docs.filter((document) => text(document.data().status).toUpperCase() === requestedStatus);
    return { requests: await Promise.all(documents.map(serializeRequest)) };
  },
);

export const adminResolveTenantCorrectionRequest = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const adminAuthority = await requireAdmin(request.auth);
    const requestId = cleanRequestId(request.data?.requestId);
    const decision = text(request.data?.decision).toUpperCase();
    const reviewReason = text(request.data?.reason || request.data?.reviewReason);
    if (!["APPROVE", "REJECT"].includes(decision)) {
      throw new HttpsError("invalid-argument", "decision must be APPROVE or REJECT.");
    }
    if (decision === "REJECT" && reviewReason.length < 8) {
      throw new HttpsError("invalid-argument", "A rejection reason of at least 8 characters is required.");
    }

    const correctionRef = db.collection("tenant_correction_requests").doc(requestId);
    const eventRef = correctionRef.collection("events").doc();
    let displayNameSync: { tenantUid: string; value: string } | null = null;

    await db.runTransaction(async (transaction) => {
      const correctionSnap = await transaction.get(correctionRef);
      if (!correctionSnap.exists) throw new HttpsError("not-found", "Tenant correction request not found.");
      const correction = correctionSnap.data() || {};
      if (text(correction.status) !== "PENDING_ADMIN_REVIEW") {
        throw new HttpsError("failed-precondition", "Tenant correction request has already been resolved.");
      }
      const tenantUid = text(correction.tenantUid || correction.tenantId);
      const field = fieldOf(correction.field);
      const requestedValue = normalizeRequestedValue(field, correction.requestedValue);
      if (!tenantUid) throw new HttpsError("failed-precondition", "Tenant identity is missing from the correction request.");

      let liveValue = "";
      if (RESIDENCE_FIELDS.has(field)) {
        const residenceId = cleanRequestId(correction.residenceId);
        const residenceRef = db.collection("units").doc(residenceId);
        const residenceSnap = await transaction.get(residenceRef);
        if (!residenceSnap.exists) throw new HttpsError("not-found", "Tenant residence no longer exists.");
        const residence = residenceSnap.data() || {};
        if (!residenceBelongsToTenant(residence, tenantUid, lower(correction.tenantEmail))) {
          throw new HttpsError("failed-precondition", "Tenant residence ownership changed after submission.");
        }
        liveValue = residenceCurrentValue(field, residence);
        if (text(liveValue) !== text(correction.currentValue)) {
          throw new HttpsError("aborted", "The residence record changed after this correction was submitted.");
        }
        if (decision === "APPROVE") {
          if (field === "leaseStart" || field === "leaseEnd") {
            const startValue = field === "leaseStart" ? requestedValue : text(residence.leaseStart || residence.startDate);
            const endValue = field === "leaseEnd" ? requestedValue : text(residence.leaseEnd || residence.endDate);
            if (startValue && endValue && new Date(endValue).getTime() < new Date(startValue).getTime()) {
              throw new HttpsError("failed-precondition", "Lease end date cannot be before the lease start date.");
            }
          }
          const residencePatch: Record<string, unknown> = { updatedAt: timestamp() };
          if (field === "floorNumber") Object.assign(residencePatch, { floorNumber: requestedValue, floor: requestedValue });
          if (field === "leaseStart") Object.assign(residencePatch, { leaseStart: requestedValue, startDate: requestedValue });
          if (field === "leaseEnd") Object.assign(residencePatch, { leaseEnd: requestedValue, endDate: requestedValue });
          transaction.set(residenceRef, residencePatch, { merge: true });
        }
      } else {
        const profileRef = db.collection("users").doc(tenantUid);
        const profileSnap = await transaction.get(profileRef);
        if (!profileSnap.exists) throw new HttpsError("not-found", "Tenant profile no longer exists.");
        const profile = profileSnap.data() || {};
        liveValue = profileCurrentValue(field, profile);
        if (!liveValue) liveValue = text(correction.currentValue);
        if (text(liveValue) !== text(correction.currentValue)) {
          throw new HttpsError("aborted", "The Tenant profile changed after this correction was submitted.");
        }
        if (decision === "APPROVE") {
          const profilePatch: Record<string, unknown> = { updatedAt: timestamp() };
          if (field === "displayName") {
            Object.assign(profilePatch, { displayName: requestedValue, name: requestedValue });
            displayNameSync = { tenantUid, value: requestedValue };
          }
          if (field === "phoneNumber") Object.assign(profilePatch, { phoneNumber: requestedValue, phone: requestedValue });
          if (field === "emergencyContactName") {
            Object.assign(profilePatch, {
              emergencyContact: {
                name: requestedValue,
                phone: text(profile.emergencyContact?.phone),
              },
            });
          }
          if (field === "emergencyContactPhone") {
            Object.assign(profilePatch, {
              emergencyContact: {
                name: text(profile.emergencyContact?.name),
                phone: requestedValue,
              },
            });
          }
          transaction.set(profileRef, profilePatch, { merge: true });
        }
      }

      const resolvedStatus = decision === "APPROVE" ? "APPROVED" : "REJECTED";
      transaction.set(correctionRef, {
        status: resolvedStatus,
        verificationState: decision === "APPROVE" ? "ADMIN_APPROVED_AND_APPLIED" : "ADMIN_REJECTED",
        decision,
        reviewReason: reviewReason || null,
        resolvedBy: adminAuthority.uid,
        resolvedByEmail: adminAuthority.email || null,
        resolvedAt: timestamp(),
        appliedAt: decision === "APPROVE" ? timestamp() : null,
        updatedAt: timestamp(),
      }, { merge: true });
      transaction.create(eventRef, {
        eventType: decision === "APPROVE" ? "APPROVED_AND_APPLIED" : "REJECTED",
        actorId: adminAuthority.uid,
        actorRole: "admin",
        status: resolvedStatus,
        reason: reviewReason || null,
        createdAt: timestamp(),
      });
      transaction.create(db.collection("audit_logs").doc(), {
        action: decision === "APPROVE" ? "ADMIN_APPROVE_TENANT_CORRECTION" : "ADMIN_REJECT_TENANT_CORRECTION",
        actorId: adminAuthority.uid,
        actorEmail: adminAuthority.email || null,
        actorRole: "admin",
        tenantUid,
        targetType: "tenant_correction_requests",
        targetId: requestId,
        field,
        before: text(correction.currentValue),
        after: decision === "APPROVE" ? requestedValue : text(correction.currentValue),
        reason: reviewReason || null,
        createdAt: timestamp(),
      });
    });

    let authSyncState = "NOT_REQUIRED";
    if (displayNameSync) {
      try {
        await admin.auth().updateUser(displayNameSync.tenantUid, { displayName: displayNameSync.value });
        authSyncState = "SYNCED";
      } catch (error) {
        console.error("Tenant display-name Auth sync failed:", error);
        authSyncState = "FAILED";
      }
      await correctionRef.set({ authSyncState, updatedAt: timestamp() }, { merge: true });
      await correctionRef.collection("events").add({
        eventType: authSyncState === "SYNCED" ? "AUTH_PROFILE_SYNCED" : "AUTH_PROFILE_SYNC_FAILED",
        actorId: adminAuthority.uid,
        actorRole: "admin",
        status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
        createdAt: timestamp(),
      });
    }

    return {
      status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
      requestId,
      authSyncState,
    };
  },
);
