import { randomUUID } from "node:crypto";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const FULL_ADMIN_ROLES = new Set(["admin", "super_admin", "ceo"]);
const STAFF_ROLES = new Set([
  "manager", "operations_admin", "finance_admin", "hr_admin", "support_admin",
  "hr_manager", "hr_staff", "finance_staff", "dispatcher", "admin_assistant",
  "account_manager", "operations_manager",
]);
const INACTIVE = new Set(["suspended", "disabled", "rejected", "inactive", "offboarded", "deleted"]);
const CANONICAL_FOUNDER_EMAIL = "ceo@bin-groups.com";
const MAX_OPERATIONS = 400;

type MutationKind = "create" | "set" | "update" | "delete";
type MutationOperation = {
  kind: MutationKind;
  path: string;
  data?: Record<string, unknown>;
  merge?: boolean;
};

type MutationActor = {
  uid: string;
  role: string;
  email: string;
  modules: Set<string>;
  fullAdmin: boolean;
  founder: boolean;
};

const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const lower = (value: unknown, max = 500) => text(value, max).toLowerCase();

function secondFactorOf(token: any) {
  return text(token?.firebase?.sign_in_second_factor || token?.sign_in_second_factor, 120);
}

function tokenRole(token: any) {
  return lower(token?.role || token?.userRole || token?.primaryRole, 80);
}

function profileRole(profile: FirebaseFirestore.DocumentData = {}) {
  return lower(profile.role || profile.userRole || profile.primaryRole, 80);
}

function activeProfile(profile: FirebaseFirestore.DocumentData = {}) {
  return profile.suspended !== true && !INACTIVE.has(lower(profile.status, 80));
}

async function requireMutationActor(auth: any): Promise<MutationActor> {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin authentication required.");
  const token = auth.token || {};
  if (token.suspended === true) throw new HttpsError("permission-denied", "Suspended accounts cannot mutate Admin data.");

  const role = tokenRole(token);
  const hasAdminBoolean =
    token.admin === true || token.isAdmin === true || token.super_admin === true ||
    token.superAdmin === true || token.ceo === true;
  if (!hasAdminBoolean && !FULL_ADMIN_ROLES.has(role) && !STAFF_ROLES.has(role)) {
    throw new HttpsError("permission-denied", "Approved Admin or staff authority is required.");
  }

  const [userRecord, profileSnap] = await Promise.all([
    admin.auth().getUser(auth.uid),
    db.collection("users").doc(auth.uid).get(),
  ]);
  if (userRecord.disabled || !userRecord.emailVerified) {
    throw new HttpsError("permission-denied", "A verified, active Firebase Auth identity is required.");
  }
  if (!profileSnap.exists) {
    throw new HttpsError("permission-denied", "An active Admin staff profile is required.");
  }
  const profile = profileSnap.data() || {};
  if (!activeProfile(profile)) {
    throw new HttpsError("permission-denied", "The Admin staff profile is not active.");
  }
  const storedRole = profileRole(profile);
  if (storedRole && role && storedRole !== role) {
    throw new HttpsError("permission-denied", "Admin role claim/profile mismatch.");
  }

  const factors = userRecord.multiFactor?.enrolledFactors || [];
  if (factors.length <= 0) {
    throw new HttpsError("failed-precondition", "Admin MFA enrollment is required before any mutation.");
  }
  if (!secondFactorOf(token)) {
    throw new HttpsError("permission-denied", "Verified Admin MFA sign-in is required for every mutation.");
  }

  const modules = new Set(
    (Array.isArray(token.modules) ? token.modules : [])
      .map((value: unknown) => lower(value, 80))
      .filter(Boolean),
  );
  const email = lower(userRecord.email || token.email, 320);
  const fullAdmin = hasAdminBoolean || FULL_ADMIN_ROLES.has(role);
  return {
    uid: auth.uid,
    role: role || (fullAdmin ? "admin" : ""),
    email,
    modules,
    fullAdmin,
    founder: (role === "ceo" || role === "super_admin") && email === CANONICAL_FOUNDER_EMAIL,
  };
}

const MODULE_BY_ROOT: Record<string, string> = {
  vendor_rfqs: "documents",
  vendor_quotes: "documents",
  vendors: "documents",
  maintenance_ledger: "documents",
  owner_approval_requests: "documents",
  pending_tenants: "tenants",
  units: "properties",
  keyRegister: "tenants",
  keyMovements: "tenants",
  data_governance_events: "compliance",
  conversations: "tickets",
  staffDirectory: "hr",
  pricingAuditLogs: "pricing",
  parcels: "tenants",
  announcements: "tenants",
  documentLibrary: "documents",
  amenities: "tenants",
  amenityBookings: "tenants",
  assets: "properties",
  binConnectThreads: "tickets",
  binGptEngineerCommands: "settings",
  jobPostings: "tenants",
  contractorProfiles: "tenants",
  visitorParkingRequests: "tenants",
  gatePasses: "tenants",
  communityPosts: "tenants",
  tenant_services_requests: "tenants",
  properties: "properties",
  propertyPassports: "properties",
  tenantInvitations: "tenants",
  tenants: "tenants",
  tenancies: "tenants",
  leases: "tenants",
  tenant_ledger: "tenants",
  tenant_invitations: "tenants",
  tenant_import_batches: "tenants",
  maintenanceTickets: "tickets",
  launch_evidence: "compliance",
  signed_in_smoke_checks: "compliance",
};

const NEVER_GENERIC_ROOTS = new Set([
  "audit_logs", "auditLogs", "payments", "payment_transactions", "admin_security_sessions",
  "admin_mfa_recovery_requests", "system_health", "hard_public_launch_clearance",
  "broker_kyc_profiles", "broker_payout_requests", "contracts", "archived_contracts",
  "contract_renewal_watch", "companies",
]);

function parsePath(value: unknown) {
  const path = text(value, 1200).replace(/^\/+|\/+$/g, "");
  const parts = path.split("/").filter(Boolean);
  if (!path || parts.length < 2 || parts.length > 8 || parts.some((part) => !/^[A-Za-z0-9._@-]{1,240}$/.test(part))) {
    throw new HttpsError("invalid-argument", "Mutation path is invalid.");
  }
  return { path, parts, root: parts[0] };
}

function requireModule(actor: MutationActor, root: string) {
  if (actor.fullAdmin) return;
  const required = MODULE_BY_ROOT[root];
  if (!required || !actor.modules.has(required)) {
    throw new HttpsError("permission-denied", `The ${required || root} module is required for this mutation.`);
  }
}

const PROPERTY_AUTHORITY_FIELDS = new Set([
  "geo", "geoAnchor", "verifiedGeo", "geoVerification", "verified", "verifiedBy", "verifiedAt",
  "dispatchReady", "requiresGeoReview", "geoReviewStatus", "geoVerifiedAt", "geoVerifiedBy",
  "active", "isActive", "activationStatus", "locationVerified", "inspectionVerified",
  "inspectionResult", "inspectionCompletedAt", "inspectionCompletedBy", "paymentVerified",
  "adminApproved", "approved", "contractActivated", "dashboardUnlocked", "dashboardUnlockApproved",
  "unlocksDashboard", "activeContractId", "geoAnchorStatus",
]);
const PRIVILEGE_FIELDS = new Set([
  "admin", "isAdmin", "superAdmin", "super_admin", "ceo", "permissions", "modules", "customClaims",
]);

function assertNoFields(data: Record<string, unknown>, forbidden: Set<string>, message: string) {
  for (const key of Object.keys(data)) {
    if (forbidden.has(key)) throw new HttpsError("permission-denied", message);
  }
}

function assertStatusNotActive(value: unknown) {
  const status = lower(value, 100);
  if (["active", "approved", "verified", "activated", "dispatch_ready", "ready_for_dispatch"].includes(status)) {
    throw new HttpsError("permission-denied", "This Admin write cannot activate or verify a property.");
  }
}

function validateOperation(actor: MutationActor, operation: MutationOperation) {
  if (!["create", "set", "update", "delete"].includes(operation.kind)) {
    throw new HttpsError("invalid-argument", "Unsupported mutation kind.");
  }
  const parsed = parsePath(operation.path);
  if (NEVER_GENERIC_ROOTS.has(parsed.root)) {
    throw new HttpsError("permission-denied", `${parsed.root} requires its dedicated protected callable.`);
  }
  if (!MODULE_BY_ROOT[parsed.root]) {
    throw new HttpsError("permission-denied", `Admin browser mutation is not registered for ${parsed.root}.`);
  }
  requireModule(actor, parsed.root);

  const data = operation.data && typeof operation.data === "object" && !Array.isArray(operation.data)
    ? operation.data
    : {};
  assertNoFields(data, PRIVILEGE_FIELDS, "Privilege fields are never writable through the Admin mutation bridge.");

  if (parsed.root === "launch_evidence" || parsed.root === "signed_in_smoke_checks") {
    if (!actor.founder) throw new HttpsError("permission-denied", "Canonical founder MFA authority is required for launch evidence.");
    if (operation.kind !== "create") throw new HttpsError("permission-denied", "Launch evidence is immutable and create-only.");
    if (lower(data.source, 120) === "github-actions" || data.executionGenerated === true || data.hardLaunchClaim === true) {
      throw new HttpsError("permission-denied", "Manual Admin evidence cannot impersonate execution-generated hard-launch proof.");
    }
    const sha = lower(data.releaseSha || data.commitSha, 80);
    if (!/^[a-f0-9]{40}$/.test(sha)) throw new HttpsError("invalid-argument", "Launch evidence requires an exact 40-character release SHA.");
  }

  if (parsed.root === "properties" && parsed.parts.length === 2) {
    if (operation.kind === "delete") {
      throw new HttpsError("permission-denied", "Canonical properties cannot be hard-deleted from the Admin browser.");
    }
    assertNoFields(data, PROPERTY_AUTHORITY_FIELDS, "Property activation, inspection and canonical geo authority require dedicated server workflows.");
    if ("status" in data) assertStatusNotActive(data.status);
    if ("lifecycleStatus" in data) assertStatusNotActive(data.lifecycleStatus);
    if ("onboardingState" in data) assertStatusNotActive(data.onboardingState);
    if ((operation.kind === "create" || operation.kind === "set") && !text(data.ownerId || data.ownerUid, 240)) {
      throw new HttpsError("failed-precondition", "Canonical property creation requires an ownerId/ownerUid.");
    }
  }

  if (parsed.root === "propertyPassports") {
    if ("status" in data) assertStatusNotActive(data.status);
  }

  if (parsed.root === "maintenanceTickets") {
    if (operation.kind !== "update") throw new HttpsError("permission-denied", "Ticket creation/deletion requires a dedicated workflow.");
    const allowed = new Set(["estimatedCost", "status", "updatedAt"]);
    for (const key of Object.keys(data)) if (!allowed.has(key)) {
      throw new HttpsError("permission-denied", "Only Admin estimate-state updates are allowed through this route.");
    }
    if ("status" in data && !["ESTIMATED", "AWAITING_OWNER_APPROVAL"].includes(text(data.status, 80))) {
      throw new HttpsError("permission-denied", "Ticket lifecycle changes require a dedicated callable.");
    }
  }

  if (parsed.root === "users") {
    throw new HttpsError("permission-denied", "User identity records require dedicated Admin identity workflows.");
  }

  if (parsed.root === "binGptEngineerCommands" && !actor.founder) {
    throw new HttpsError("permission-denied", "Canonical founder MFA authority is required for engineering commands.");
  }

  return parsed;
}

function revive(value: any): any {
  if (Array.isArray(value)) return value.map(revive);
  if (!value || typeof value !== "object") return value;
  if (value.__binFirestoreType === "serverTimestamp") return FieldValue.serverTimestamp();
  if (value.__binFirestoreType === "date") {
    const millis = Date.parse(text(value.value, 80));
    if (!Number.isFinite(millis)) throw new HttpsError("invalid-argument", "Invalid serialized date.");
    return Timestamp.fromMillis(millis);
  }
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, revive(nested)]));
}

function safeAuditSummary(operations: MutationOperation[]) {
  return operations.map((operation) => {
    const { root } = parsePath(operation.path);
    return { kind: operation.kind, root };
  });
}

export const adminAuthorizedFirestoreMutation = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true, timeoutSeconds: 120 },
  async (request) => {
    const actor = await requireMutationActor(request.auth);
    const raw = Array.isArray(request.data?.operations) ? request.data.operations : [];
    if (raw.length < 1 || raw.length > MAX_OPERATIONS) {
      throw new HttpsError("invalid-argument", `Mutation batches must contain 1-${MAX_OPERATIONS} operations.`);
    }

    const operations: MutationOperation[] = raw.map((item: any) => ({
      kind: text(item?.kind, 20) as MutationKind,
      path: text(item?.path, 1200),
      data: item?.data && typeof item.data === "object" && !Array.isArray(item.data) ? item.data : undefined,
      merge: item?.merge === true,
    }));
    operations.forEach((operation) => validateOperation(actor, operation));

    const batch = db.batch();
    for (const operation of operations) {
      const { path } = parsePath(operation.path);
      const ref = db.doc(path);
      if (operation.kind === "delete") {
        batch.delete(ref);
        continue;
      }
      const data = revive(operation.data || {});
      if (operation.kind === "create") {
        batch.create(ref, data);
      } else if (operation.kind === "update") {
        batch.update(ref, data);
      } else if (operation.merge) {
        batch.set(ref, data, { merge: true });
      } else {
        batch.set(ref, data);
      }
    }

    const mutationId = `admin_mutation_${randomUUID().replace(/-/g, "")}`;
    batch.create(db.collection("audit_logs").doc(), {
      action: "ADMIN_SERVER_AUTHORIZED_MUTATION",
      actorId: actor.uid,
      actorRole: actor.role,
      targetType: "admin_mutation_batch",
      targetId: mutationId,
      operationCount: operations.length,
      operations: safeAuditSummary(operations),
      authVerified: true,
      emailVerified: true,
      mfaVerified: true,
      appCheckRequired: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return { status: "SUCCESS", mutationId, operationCount: operations.length };
  },
);

function finiteCoordinate(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export const adminRepairPropertyGeo = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actor = await requireMutationActor(request.auth);
    if (!actor.founder) {
      throw new HttpsError("permission-denied", "Canonical founder MFA authority is required for canonical geo repair.");
    }
    const propertyId = text(request.data?.propertyId, 240);
    if (!/^[A-Za-z0-9._@-]{1,240}$/.test(propertyId)) {
      throw new HttpsError("invalid-argument", "A valid propertyId is required.");
    }
    const lat = finiteCoordinate(request.data?.lat, -90, 90);
    const lng = finiteCoordinate(request.data?.lng, -180, 180);
    if (lat === null || lng === null || (lat === 0 && lng === 0)) {
      throw new HttpsError("invalid-argument", "Valid non-zero coordinates are required.");
    }

    const propertyRef = db.collection("properties").doc(propertyId);
    const snap = await propertyRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "Property not found.");
    const property = snap.data() || {};
    const companyId = text(property.companyId || "BIN_GROUP", 120);
    const now = FieldValue.serverTimestamp();
    const geo = {
      lat,
      lng,
      address: text(request.data?.address || property.addressLine || property.address, 500),
      emirate: text(request.data?.emirate || property.emirate, 120),
      city: text(request.data?.city || property.city || property.area || property.serviceZone, 120),
      area: text(request.data?.area || property.area || property.serviceZone || property.city, 120),
      placeId: text(request.data?.placeId || property.googlePlaceId || property.placeId, 240) || null,
      source: "admin_manual_server_verified",
      verified: true,
      verifiedBy: actor.uid,
      verifiedAt: now,
    };
    if (!geo.emirate) throw new HttpsError("failed-precondition", "Property emirate is required before canonical geo verification.");

    const batch = db.batch();
    const patch = {
      companyId,
      geo,
      location: { lat, lng },
      coordinates: { lat, lng },
      geoAnchorStatus: "verified_and_locked",
      verified: true,
      verifiedBy: actor.uid,
      verifiedAt: now,
      requiresGeoReview: false,
      geoReviewStatus: "VERIFIED",
      geoVerifiedAt: now,
      geoVerifiedBy: actor.uid,
      updatedAt: now,
    };
    batch.set(propertyRef, patch, { merge: true });
    batch.set(db.collection("companies").doc(companyId).collection("properties").doc(propertyId), {
      ...property,
      ...patch,
      propertyId,
    }, { merge: true });
    batch.create(db.collection("audit_logs").doc(), {
      action: "ADMIN_PROPERTY_GEO_REPAIRED",
      actorId: actor.uid,
      actorRole: actor.role,
      targetType: "properties",
      targetId: propertyId,
      propertyId,
      companyId,
      source: "ADMIN_GEO_REPAIR_CENTER",
      mfaVerified: true,
      appCheckRequired: true,
      createdAt: now,
    });
    await batch.commit();
    return { status: "SUCCESS", propertyId, verified: true, dispatchReady: property.dispatchReady === true };
  },
);

import type * as FirebaseFirestore from "firebase-admin/firestore";
