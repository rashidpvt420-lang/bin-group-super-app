import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const CANONICAL_FOUNDER_EMAIL = "ceo@bin-groups.com";
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
const FOUNDER_ROLES = new Set(["ceo", "super_admin"]);
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

// Explicit Finance tier approvers (assigned only through adminRequestFinanceRoleAssignment ->
// adminApproveFinanceRoleAssignment). They carry no Admin-portal authority, so they are never part of
// the Founder + Finance Admin privileged pair and are never cleanup targets. Anything that also carries
// an elevated flag (admin, super admin, CEO, manager, finance_admin) is NOT treated as a tier approver
// and stays an unexpected privileged account.
export const FINANCE_TIER_APPROVER_ROLES: ReadonlySet<string> = new Set(["finance_manager", "finance_controller"]);
const ELEVATED_CLAIM_FLAGS = ["admin", "isAdmin", "super_admin", "superAdmin", "ceo", "manager", "finance_admin"];

export function isExplicitFinanceTierApprover(user: { email?: string | null; customClaims?: Record<string, unknown> | null }) {
  const claims = (user?.customClaims || {}) as Record<string, unknown>;
  const role = lower(claims.role || claims.userRole || claims.primaryRole, 80);
  if (!FINANCE_TIER_APPROVER_ROLES.has(role)) return false;
  for (const key of ["role", "userRole", "primaryRole"]) {
    if (claims[key] !== undefined && claims[key] !== null && lower(claims[key], 80) !== role) return false;
  }
  if (claims[role] !== true) return false;
  for (const other of FINANCE_TIER_APPROVER_ROLES) {
    if (other !== role && claims[other] === true) return false;
  }
  if (ELEVATED_CLAIM_FLAGS.some((flag) => claims[flag] === true)) return false;
  if (claimsGrantAdminPortal(claims)) return false;
  if (lower(user?.email, 320) === CANONICAL_FOUNDER_EMAIL) return false;
  return true;
}

// Named second approver (Rashid, 18 Nov 2026): one Super Admin carrying the Admin-SDK-only
// designatedSecondApprover claim, set solely by the owner-confirmed Second Approver Bootstrap workflow
// for the account named by the protected SECOND_APPROVER_EMAIL secret (the deploy-time scripts also
// check that exact email). It is never a Finance money approver: any Finance/CEO/staff flag disqualifies.
export const SECOND_APPROVER_CLAIM = "designatedSecondApprover";
const SECOND_APPROVER_FORBIDDEN_FLAGS = [
  "ceo", "manager", "staff", "isStaff", "technician",
  "finance_admin", "finance_manager", "finance_controller", "finance_staff", "payroll_admin",
];

export function isDesignatedSecondApproverShape(user: { email?: string | null; customClaims?: Record<string, unknown> | null }) {
  const claims = (user?.customClaims || {}) as Record<string, unknown>;
  if (claims[SECOND_APPROVER_CLAIM] !== true) return false;
  if (lower(user?.email, 320) === CANONICAL_FOUNDER_EMAIL || !lower(user?.email, 320)) return false;
  for (const key of ["role", "userRole", "primaryRole"]) {
    if (claims[key] !== undefined && claims[key] !== null && lower(claims[key], 80) !== "super_admin") return false;
  }
  if (lower(claims.role, 80) !== "super_admin" || claims.super_admin !== true) return false;
  if (SECOND_APPROVER_FORBIDDEN_FLAGS.some((flag) => claims[flag] === true)) return false;
  if (claims.financeAuthorizedAt !== undefined && claims.financeAuthorizedAt !== null) return false;
  if (claims.suspended === true) return false;
  return true;
}

function profileIsActive(profile: FirebaseFirestore.DocumentData = {}) {
  if (profile.suspended === true) return false;
  return !INACTIVE_PROFILE_STATUSES.has(lower(profile.status, 80));
}

function isCanonicalFounder(user: admin.auth.UserRecord, role: string) {
  return FOUNDER_ROLES.has(role) && lower(user.email, 320) === CANONICAL_FOUNDER_EMAIL;
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
  if (!profileSnap.exists) throw new HttpsError("permission-denied", "Active founder profile required.");
  const profile = profileSnap.data() || {};
  const role = roleOf(auth.token || {}, profile);
  if (!FOUNDER_ROLES.has(role) || lower(userRecord.email, 320) !== CANONICAL_FOUNDER_EMAIL) {
    throw new HttpsError("permission-denied", "The canonical BIN GROUP founder account is required.");
  }
  if (userRecord.disabled || !profileIsActive(profile) || auth.token?.suspended === true) {
    throw new HttpsError("permission-denied", "The canonical founder account is not active.");
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
  let totpMfaEnrolledCount = 0;
  let canonicalFounderCount = 0;
  let canonicalFounderReadyCount = 0;
  let financeAdminCount = 0;
  let financeAdminReadyCount = 0;
  let unexpectedPrivilegedAccountCount = 0;
  let financeTierApproverCount = 0;
  let financeTierApproverTotpReadyCount = 0;
  let secondApproverCount = 0;
  let secondApproverReadyCount = 0;
  const blockers: AdminMfaReadinessTarget[] = [];
  // Only a single designated second approver can ever be accepted; two or more are all unexpected.
  const designatedCount = records.filter((record) =>
    claimsGrantAdminPortal((record.user.customClaims || {}) as Record<string, unknown>) &&
    !isCanonicalFounder(record.user, roleOf((record.user.customClaims || {}) as Record<string, unknown>, record.profile)) &&
    isDesignatedSecondApproverShape(record.user)
  ).length;

  for (const record of records) {
    const user = record.user;
    const claims = (user.customClaims || {}) as Record<string, unknown>;
    if (isExplicitFinanceTierApprover(user)) {
      // Expected Finance approver: reported for TOTP readiness, never DELETE_REQUIRED, and never
      // counted toward the Founder + Finance Admin privileged pair.
      financeTierApproverCount += 1;
      const tierFactors = user.multiFactor?.enrolledFactors || [];
      const tierActive = record.profileExists && !user.disabled && profileIsActive(record.profile);
      if (tierActive && user.emailVerified === true && tierFactors.some((factor) => lower(factor.factorId, 80) === "totp")) {
        financeTierApproverTotpReadyCount += 1;
      }
      continue;
    }
    if (!claimsGrantAdminPortal(claims)) continue;
    claimedAdminCount += 1;

    const role = roleOf(claims, record.profile);
    const canonicalFounder = isCanonicalFounder(user, role);
    const financeAdmin = role === "finance_admin";
    const secondApprover = !canonicalFounder && !financeAdmin && designatedCount === 1 && isDesignatedSecondApproverShape(user);
    const secondApproverFactors = user.multiFactor?.enrolledFactors || [];
    const secondApproverReady = secondApprover &&
      record.profileExists && !user.disabled && profileIsActive(record.profile) && user.emailVerified === true &&
      secondApproverFactors.some((factor) => ["phone", "totp"].includes(lower(factor.factorId, 80)));
    if (canonicalFounder) canonicalFounderCount += 1;
    else if (financeAdmin) financeAdminCount += 1;
    else if (secondApprover) {
      secondApproverCount += 1;
      if (secondApproverReady) secondApproverReadyCount += 1;
    } else unexpectedPrivilegedAccountCount += 1;

    const targetBlockers: string[] = [];
    if (!canonicalFounder && !financeAdmin && !secondApprover) targetBlockers.push("DELETE_REQUIRED");
    // A present but not MFA-ready second approver is not accepted (cleanup would still remove it).
    if (secondApprover && !secondApproverReady) targetBlockers.push("SECOND_APPROVER_MFA_REQUIRED");
    if (!record.profileExists) {
      missingProfileCount += 1;
      targetBlockers.push("PROFILE_MISSING");
    }
    if (user.disabled) {
      disabledAdminCount += 1;
      targetBlockers.push("DISABLED");
    }
    if (record.profileExists && !profileIsActive(record.profile)) {
      inactiveProfileCount += 1;
      targetBlockers.push("INACTIVE");
    }

    const active = record.profileExists && !user.disabled && profileIsActive(record.profile);
    const emailVerified = user.emailVerified === true;
    const factors = user.multiFactor?.enrolledFactors || [];
    const phoneMfaEnrolled = factors.some((factor) => lower(factor.factorId, 80) === "phone");
    const totpMfaEnrolled = factors.some((factor) => lower(factor.factorId, 80) === "totp");

    if (active) {
      activeAdminCount += 1;
      if (emailVerified) emailVerifiedCount += 1;
      else targetBlockers.push("EMAIL_UNVERIFIED");
      if (phoneMfaEnrolled) phoneMfaEnrolledCount += 1;
      if (totpMfaEnrolled) totpMfaEnrolledCount += 1;
      if (canonicalFounder && !phoneMfaEnrolled) targetBlockers.push("PHONE_MFA_MISSING");
      if (financeAdmin && !totpMfaEnrolled) targetBlockers.push("TOTP_MFA_MISSING");
    }
    if (canonicalFounder && active && emailVerified && phoneMfaEnrolled) {
      canonicalFounderReadyCount += 1;
    }
    if (financeAdmin && active && emailVerified && totpMfaEnrolled) {
      financeAdminReadyCount += 1;
    }

    if (targetBlockers.length > 0) {
      blockers.push({
        displayName: user.displayName || text(record.profile.displayName || record.profile.fullName, 160) || role || "Admin",
        emailMasked: maskedEmail(user.email || record.profile.email),
        role,
        emailVerified,
        phoneMfaEnrolled,
        recoveryApprover: canonicalFounder,
        blockers: [...new Set(targetBlockers)],
      });
    }
  }

  blockers.sort((left, right) => {
    if (left.recoveryApprover !== right.recoveryApprover) return left.recoveryApprover ? -1 : 1;
    return `${left.role}|${left.emailMasked}`.localeCompare(`${right.role}|${right.emailMasked}`);
  });

  const expectedPrivilegedAccountCount = secondApproverCount === 1 && secondApproverReadyCount === 1 ? 3 : 2;
  const dualControlReady =
    secondApproverReadyCount === secondApproverCount &&
    claimedAdminCount === expectedPrivilegedAccountCount &&
    canonicalFounderCount === 1 &&
    canonicalFounderReadyCount === 1 &&
    financeAdminCount === 1 &&
    financeAdminReadyCount === 1 &&
    unexpectedPrivilegedAccountCount === 0 &&
    missingProfileCount === 0 &&
    disabledAdminCount === 0 &&
    inactiveProfileCount === 0 &&
    activeAdminCount === expectedPrivilegedAccountCount &&
    emailVerifiedCount === expectedPrivilegedAccountCount;

  return {
    status: dualControlReady ? "READY" : "BLOCKED",
    launchReady: dualControlReady,
    summary: {
      claimedAdminCount,
      missingProfileCount,
      disabledAdminCount,
      inactiveProfileCount,
      activeAdminCount,
      emailVerifiedCount,
      phoneMfaEnrolledCount,
      totpMfaEnrolledCount,
      canonicalFounderCount,
      canonicalFounderReadyCount,
      financeAdminCount,
      financeAdminReadyCount,
      unexpectedPrivilegedAccountCount,
      financeTierApproverCount,
      financeTierApproverTotpReadyCount,
      secondApproverCount,
      secondApproverReadyCount,
      expectedPrivilegedAccountCount,
      dualControlReady,
      founderSingletonReady: dualControlReady,
      blockingAccountCount: blockers.length,
      // Compatibility values for the current Admin card.
      recoveryApproverCount: canonicalFounderCount,
      recoveryApproverReadyCount: canonicalFounderReadyCount,
      recoveryQuorumReady: dualControlReady,
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
    const claimedAdmins = users.filter((user) =>
      claimsGrantAdminPortal((user.customClaims || {}) as Record<string, unknown>) ||
      isExplicitFinanceTierApprover(user)
    );
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
      action: "ADMIN_DUAL_CONTROL_READINESS_VIEWED",
      actorId: viewer.uid,
      actorRole: viewer.role,
      targetType: "system",
      targetId: "admin-founder-finance-production-readiness",
      claimedAdminCount: overview.summary.claimedAdminCount,
      activeAdminCount: overview.summary.activeAdminCount,
      unexpectedPrivilegedAccountCount: overview.summary.unexpectedPrivilegedAccountCount,
      founderSingletonReady: overview.summary.founderSingletonReady,
      sensitiveValuesExcluded: true,
      createdAt: FieldValue.serverTimestamp(),
    });
    return overview;
  },
);

import type * as FirebaseFirestore from "firebase-admin/firestore";