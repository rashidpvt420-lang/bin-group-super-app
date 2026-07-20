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
  "finance_admin",
  "hr_admin",
  "support_admin",
  "hr_manager",
  "hr_staff",
  "finance_staff",
  "account_manager",
  "dispatcher",
  "operations_manager",
]);
const READINESS_VIEWER_ROLES = new Set(["ceo", "super_admin"]);
const RECOVERY_APPROVER_ROLES = new Set(["ceo", "super_admin"]);
const INACTIVE_PROFILE_STATUSES = new Set(["suspended", "disabled", "rejected", "inactive"]);

const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const lower = (value: unknown, max = 500) => text(value, max).toLowerCase();

function roleOf(claims: Record<string, unknown> = {}, profile: FirebaseFirestore.DocumentData = {}) {
  const explicit = lower(
    claims.role || claims.userRole || claims.primaryRole || profile.role || profile.userRole || profile.primaryRole,
    80,
  );
  if (explicit) return explicit;
  if (claims.ceo === true) return "ceo";
  if (claims.super_admin === true || claims.superAdmin === true) return "super_admin";
  return "";
}

function claimsGrantAdminPortal(claims: Record<string, unknown> = {}) {
  const role = roleOf(claims);
  return Boolean(
    claims.admin === true ||
    claims.isAdmin === true ||
    claims.super_admin === true ||
    claims.superAdmin === true ||
    claims.ceo === true ||
    claims.manager === true ||
    ADMIN_ROLES.has(role)
  );
}

function profileIsActive(profile: FirebaseFirestore.DocumentData = {}) {
  if (profile.suspended === true) return false;
  return !INACTIVE_PROFILE_STATUSES.has(lower(profile.status, 80));
}

function maskedEmail(value: unknown) {
  const email = lower(value, 320);
  const [local = "", domain = ""] = email.split("@");
  if (!local || !domain) return "unavailable";
  const visible = local.slice(0, Math.min(2, local.length));
  const hiddenLength = Math.max(2, Math.min(8, Math.max(0, local.length - visible.length)));
  return `${visible}${"•".repeat(hiddenLength)}@${domain}`;
}

async function requireReadinessViewer(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const [userRecord, profileSnap] = await Promise.all([
    admin.auth().getUser(auth.uid),
    db.collection("users").doc(auth.uid).get(),
  ]);
  if (!profileSnap.exists) throw new HttpsError("permission-denied", "Active Admin profile required.");
  const profile = profileSnap.data() || {};
  const role = roleOf(auth.token || {}, profile);
  if (!READINESS_VIEWER_ROLES.has(role)) {
    throw new HttpsError("permission-denied", "CEO or Super Admin authority is required.");
  }
  if (userRecord.disabled || !profileIsActive(profile) || auth.token?.suspended === true) {
    throw new HttpsError("permission-denied", "This Admin account is not active.");
  }
  return { uid: auth.uid, role };
}

async function fetchAllUsers() {
  const users: admin.auth.UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

export type AdminMfaReadinessTarget = {
  displayName: string;
  emailMasked: string;
  role: string;
  emailVerified: boolean;
  phoneMfaEnrolled: boolean;
  recoveryApprover: boolean;
  blockers: string[];
};

export function buildAdminMfaReadinessOverview(
  records: Array<{ user: admin.auth.UserRecord; profileExists: boolean; profile: FirebaseFirestore.DocumentData }>,
) {
  let claimedAdminCount = 0;
  let missingProfileCount = 0;
  let disabledAdminCount = 0;
  let inactiveProfileCount = 0;
  let activeAdminCount = 0;
  let emailVerifiedCount = 0;
  let phoneMfaEnrolledCount = 0;
  let recoveryApproverCount = 0;
  let recoveryApproverReadyCount = 0;
  const blockers: AdminMfaReadinessTarget[] = [];

  for (const record of records) {
    const user = record.user;
    const claims = (user.customClaims || {}) as Record<string, unknown>;
    if (!claimsGrantAdminPortal(claims)) continue;
    claimedAdminCount += 1;
    const role = roleOf(claims, record.profile);
    if (!record.profileExists) {
      missingProfileCount += 1;
      continue;
    }
    if (user.disabled) {
      disabledAdminCount += 1;
      continue;
    }
    if (!profileIsActive(record.profile)) {
      inactiveProfileCount += 1;
      continue;
    }

    activeAdminCount += 1;
    const emailVerified = user.emailVerified === true;
    const phoneMfaEnrolled = (user.multiFactor?.enrolledFactors || [])
      .some((factor) => lower(factor.factorId, 80) === "phone");
    const recoveryApprover = RECOVERY_APPROVER_ROLES.has(role);
    if (emailVerified) emailVerifiedCount += 1;
    if (phoneMfaEnrolled) phoneMfaEnrolledCount += 1;
    if (recoveryApprover) recoveryApproverCount += 1;
    if (recoveryApprover && emailVerified && phoneMfaEnrolled) recoveryApproverReadyCount += 1;

    const targetBlockers: string[] = [];
    if (!emailVerified) targetBlockers.push("EMAIL_UNVERIFIED");
    if (!phoneMfaEnrolled) targetBlockers.push("PHONE_MFA_MISSING");
    if (targetBlockers.length > 0) {
      blockers.push({
        displayName: user.displayName || text(record.profile.displayName || record.profile.fullName, 160) || role || "Admin",
        emailMasked: maskedEmail(user.email || record.profile.email),
        role,
        emailVerified,
        phoneMfaEnrolled,
        recoveryApprover,
        blockers: targetBlockers,
      });
    }
  }

  blockers.sort((left, right) => {
    if (left.recoveryApprover !== right.recoveryApprover) return left.recoveryApprover ? -1 : 1;
    return `${left.role}|${left.emailMasked}`.localeCompare(`${right.role}|${right.emailMasked}`);
  });

  const recoveryQuorumReady =
    recoveryApproverCount >= 2 &&
    recoveryApproverReadyCount >= 2 &&
    recoveryApproverReadyCount === recoveryApproverCount;
  const launchReady =
    activeAdminCount > 0 &&
    missingProfileCount === 0 &&
    emailVerifiedCount === activeAdminCount &&
    phoneMfaEnrolledCount === activeAdminCount &&
    recoveryQuorumReady;

  return {
    status: launchReady ? "READY" : "BLOCKED",
    launchReady,
    summary: {
      claimedAdminCount,
      missingProfileCount,
      disabledAdminCount,
      inactiveProfileCount,
      activeAdminCount,
      emailVerifiedCount,
      phoneMfaEnrolledCount,
      recoveryApproverCount,
      recoveryApproverReadyCount,
      recoveryQuorumReady,
      blockingAccountCount: blockers.length,
    },
    blockers,
    sensitiveValuesExcluded: true,
    hardLaunchClaim: false,
  };
}

export const getAdminMfaReadinessOverview = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true, timeoutSeconds: 120 },
  async (request) => {
    const viewer = await requireReadinessViewer(request.auth);
    const users = await fetchAllUsers();
    const claimedAdmins = users.filter((user) => claimsGrantAdminPortal((user.customClaims || {}) as Record<string, unknown>));
    const profiles = new Map<string, { profileExists: boolean; profile: FirebaseFirestore.DocumentData }>();
    for (let offset = 0; offset < claimedAdmins.length; offset += 100) {
      const chunk = claimedAdmins.slice(offset, offset + 100);
      const snapshots = chunk.length > 0
        ? await db.getAll(...chunk.map((user) => db.collection("users").doc(user.uid)))
        : [];
      snapshots.forEach((snapshot) => profiles.set(snapshot.id, {
        profileExists: snapshot.exists,
        profile: snapshot.data() || {},
      }));
    }
    const overview = buildAdminMfaReadinessOverview(claimedAdmins.map((user) => ({
      user,
      ...(profiles.get(user.uid) || { profileExists: false, profile: {} }),
    })));
    await db.collection("audit_logs").add({
      action: "ADMIN_MFA_READINESS_VIEWED",
      actorId: viewer.uid,
      actorRole: viewer.role,
      targetType: "system",
      targetId: "admin-mfa-production-readiness",
      activeAdminCount: overview.summary.activeAdminCount,
      blockingAccountCount: overview.summary.blockingAccountCount,
      recoveryQuorumReady: overview.summary.recoveryQuorumReady,
      sensitiveValuesExcluded: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    return overview;
  },
);
