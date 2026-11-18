import { createHash, randomBytes } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import type * as FirebaseFirestore from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { DEFAULT_WORKING_HOURS } from "./hrPayConfig";
import { requirePrivilegedMfaSession } from "./adminMfaSession";
import {
  FINANCE_AUTHORIZATION_TTL_MS,
  parseAuthorizationTimestampMs,
  isAuthorizationExpired,
} from "./financeAdminMfa";

export { FINANCE_AUTHORIZATION_TTL_MS, parseAuthorizationTimestampMs, isAuthorizationExpired };

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const PRIVILEGED_ADMIN_ROLES = new Set(["admin", "super_admin", "ceo"]);
const STAFF_ROLES = new Set([
  "technician",
  "manager",
  "operations_admin",
  "hr_admin",
  "support_admin",
  "hr_staff",
  "hr_manager",
  "finance_staff",
  "dispatcher",
  "admin_assistant",
  "account_manager",
  "operations_manager",
  "finance_admin",
  // Nov 9 audit (P1-8): painting payment reviewers. They get no admin modules; the
  // painting finance page is role-gated and every decision still needs MFA and a
  // live finance_manager / finance_controller claim (paintingFinanceApprover.ts),
  // and the issuer of an invoice can never approve it.
  "finance_manager",
  "finance_controller",
  // Payroll Admin (Rashid, 9 Nov): prepares the monthly payroll batch only (adminGeneratePayrollBatch,
  // with an MFA session). No admin modules and no money authority: settling payroll and every payment
  // approval stay with MFA Finance Admin. Assigned through this same MFA, audited provisioning path.
  "payroll_admin",
]);

export const STAFF_NUMBER_COUNTER_DOC = "staff_number";
export const STAFF_NUMBER_START = 10001;

export async function resolveStaffUid(uidOrNumber: string): Promise<string> {
  const trimmed = cleanString(uidOrNumber);
  if (!trimmed) throw new HttpsError("invalid-argument", "Staff identifier is required.");
  if (/^\d{5}$/.test(trimmed)) {
    const num = Number(trimmed);
    const snap = await db.collection("users").where("staffNumber", "==", num).limit(1).get();
    if (!snap.empty) return snap.docs[0].id;
    const strSnap = await db.collection("users").where("staffNumber", "==", trimmed).limit(1).get();
    if (!strSnap.empty) return strSnap.docs[0].id;
    throw new HttpsError("not-found", `No staff account found with staff number ${trimmed}.`);
  }
  return trimmed;
}

/**
 * D-04 (ported from #2000): finance tiers that carry money-adjacent authority
 * (painting payments, payroll prep). Only a Super Admin or CEO, signed in with MFA
 * and holding those LIVE claims, may assign a finance tier or change/restore an
 * account that holds one. A plain Admin may still suspend such an account.
 * Payroll Admin stays prep-only (no admin modules). Every assignment writes
 * audit_logs with financeTierAssignment: true.
 */
const FINANCE_TIER_ROLES: ReadonlySet<string> = new Set(["finance_admin", "finance_manager", "finance_controller", "payroll_admin"]);
const FINANCE_TIER_ASSIGNER_ROLES = new Set(["super_admin", "ceo"]);

function isFinanceTierAssigner(claims: any) {
  const role = cleanString(claims?.role || claims?.userRole || claims?.primaryRole).toLowerCase();
  return claims?.suspended !== true && (
    FINANCE_TIER_ASSIGNER_ROLES.has(role) || claims?.superAdmin === true || claims?.super_admin === true || claims?.ceo === true
  );
}

async function requireFinanceTierAssigner(request: any) {
  const token = request.auth?.token || {};
  if (!isFinanceTierAssigner(token)) {
    throw new HttpsError("permission-denied", "Only a Super Admin or CEO can assign or change a finance role (Finance Admin, Finance Manager, Finance Controller, Payroll Admin).");
  }
  const record = await admin.auth().getUser(request.auth.uid);
  if (!isFinanceTierAssigner(record.customClaims || {})) {
    throw new HttpsError("permission-denied", "Super Admin / CEO authority is no longer active on this account.");
  }
}

export const FINANCE_APPROVER_ROLES: ReadonlySet<string> = new Set(["finance_admin", "finance_manager", "finance_controller"]);
/**
 * Re-grant: refreshes financeAuthorizedAt for an ACTIVE account that already holds the same explicit
 * Finance approver role. It is the same two-person flow (Super Admin/CEO requests, an independent
 * Super Admin/CEO/Finance Controller who is neither requester nor target approves, both with MFA, 24h
 * request TTL). On approval it changes nothing except financeAuthorizedAt: no role, module, status or
 * suspension change, and the authorization is consumed so it can never be replayed elsewhere.
 */
export const FINANCE_REGRANT_ACTION = "REGRANT_FINANCE_AUTHORITY";
const INDEPENDENT_FINANCE_APPROVER_ROLES = new Set(["super_admin", "ceo", "finance_controller"]);

function isIndependentFinanceApprover(claims: any) {
  const role = cleanString(claims?.role || claims?.userRole || claims?.primaryRole).toLowerCase();
  return claims?.suspended !== true && (
    INDEPENDENT_FINANCE_APPROVER_ROLES.has(role) ||
    claims?.superAdmin === true ||
    claims?.super_admin === true ||
    claims?.ceo === true ||
    claims?.finance_controller === true
  );
}

async function requireIndependentFinanceApprover(request: any) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
  await requirePrivilegedMfaSession(request.auth);
  const token = request.auth.token || {};
  if (!isIndependentFinanceApprover(token)) {
    throw new HttpsError(
      "permission-denied",
      "Only an independent authorized authority (Super Admin, CEO, or Finance Controller) can approve Finance role assignments.",
    );
  }
  const record = await admin.auth().getUser(request.auth.uid);
  if (record.disabled || !isIndependentFinanceApprover(record.customClaims || {})) {
    throw new HttpsError(
      "permission-denied",
      "Independent approval authority is not active or account is disabled.",
    );
  }
  const role = cleanString(
    record.customClaims?.role ||
    record.customClaims?.userRole ||
    record.customClaims?.primaryRole ||
    (record.customClaims?.ceo ? "ceo" : record.customClaims?.super_admin ? "super_admin" : "finance_controller"),
    "super_admin",
  );
  return {
    approverId: request.auth.uid,
    approverRole: role,
    approverEmail: cleanString(record.email || token.email),
  };
}


const ROLE_ALLOWED_MODULES: Record<string, readonly string[]> = {
  technician: [],
  manager: ["dashboard", "reports", "audit", "owners", "tenants", "properties"],
  operations_admin: ["dashboard", "tickets", "technicians", "map", "sos", "properties", "owners", "tenants", "documents"],
  hr_admin: ["dashboard", "technicians", "hr", "reports", "audit"],
  support_admin: ["dashboard", "tenants", "tickets", "sos", "documents"],
  hr_staff: ["dashboard", "technicians", "hr"],
  hr_manager: ["dashboard", "technicians", "hr", "reports", "audit"],
  finance_staff: ["dashboard", "financials", "transactions", "reports"],
  dispatcher: ["dashboard", "tickets", "technicians", "map", "sos"],
  admin_assistant: ["dashboard", "owners", "tenants", "tickets", "documents", "properties"],
  account_manager: ["dashboard", "owners", "contracts", "documents", "properties"],
  operations_manager: ["dashboard", "tickets", "technicians", "map", "sos", "properties", "reports"],
  // "broker" is allowed (never a default) so a two-person-granted Finance Admin can open /broker for
  // payout approval; payout decisions still require requireMfaFinanceAdminActor and the 24h grant.
  finance_admin: ["dashboard", "financials", "transactions", "reports", "audit", "broker"],
  finance_manager: [],
  finance_controller: [],
  payroll_admin: [],
};

const ROLE_DEFAULT_MODULES: Record<string, readonly string[]> = {
  technician: [],
  manager: ["dashboard", "reports"],
  operations_admin: ["dashboard", "tickets", "technicians", "map", "sos"],
  hr_admin: ["dashboard", "technicians", "hr"],
  support_admin: ["dashboard", "tenants", "tickets"],
  hr_staff: ["dashboard", "hr"],
  hr_manager: ["dashboard", "technicians", "hr", "reports"],
  finance_staff: ["dashboard", "financials", "transactions"],
  dispatcher: ["dashboard", "tickets", "technicians", "map"],
  admin_assistant: ["dashboard", "owners", "tenants", "documents"],
  account_manager: ["dashboard", "owners", "contracts", "documents", "properties"],
  operations_manager: ["dashboard", "tickets", "technicians", "reports"],
  finance_admin: ["dashboard", "financials", "transactions", "reports"],
  finance_manager: [],
  finance_controller: [],
  payroll_admin: [],
};

const MODULE_PERMISSION_MAP: Record<string, readonly string[]> = {
  owners: ["canManageTenants"],
  tenants: ["canManageTenants"],
  tickets: ["canDispatchJobs"],
  technicians: ["canManageTechnicians"],
  properties: ["canManageProperties"],
  documents: ["canManageProperties"],
  contracts: ["canManageContracts"],
  settings: ["canManageCompanyProfile"],
};

function cleanString(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeEmail(value: unknown) {
  return cleanString(value).toLowerCase();
}

function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function escapeHtml(value: unknown) {
  return cleanString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function titleCaseRole(role: string) {
  return role
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function hasAdminAccess(token: any) {
  const role = cleanString(token?.role || token?.userRole || token?.primaryRole).toLowerCase();
  return token?.suspended !== true && (
    PRIVILEGED_ADMIN_ROLES.has(role) ||
    token?.super_admin === true ||
    token?.superAdmin === true ||
    token?.ceo === true ||
    (role === "" && (token?.admin === true || token?.isAdmin === true))
  );
}

async function requireProvisioningAdmin(request: any) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Admin session required.");
  const actorToken = request.auth.token || {};
  if (!hasAdminAccess(actorToken)) {
    throw new HttpsError("permission-denied", "Only an authorized Founder or Admin can manage staff access.");
  }
  if (actorToken.email_verified !== true || !actorToken.firebase?.sign_in_second_factor) {
    throw new HttpsError("permission-denied", "A verified Admin MFA session is required to manage staff access.");
  }
  const actorRecord = await admin.auth().getUser(request.auth.uid);
  if (actorRecord.disabled || !actorRecord.emailVerified || !hasAdminAccess(actorRecord.customClaims || {})) {
    throw new HttpsError("permission-denied", "Current Founder/Admin authority is inactive or no longer valid.");
  }
  return {
    actorId: request.auth.uid,
    actorRole: cleanString(actorToken.role || actorToken.userRole || actorToken.primaryRole, "admin"),
  };
}

function generatedBootstrapPassword() {
  return `BinBootstrap#${randomBytes(32).toString("base64url")}!`;
}

function loginUrlForRole(role: string) {
  const mainAppUrl = cleanString(process.env.MAIN_APP_URL, "https://bin-group-57c60.web.app").replace(/\/$/, "");
  const adminAppUrl = cleanString(process.env.ADMIN_APP_URL, "https://bin-group-admin-panel.web.app").replace(/\/$/, "");
  return role === "technician" ? `${mainAppUrl}/login?role=technician` : `${adminAppUrl}/login`;
}

function normalizeModules(role: string, rawModules: unknown) {
  const allowed = new Set(ROLE_ALLOWED_MODULES[role] || []);
  const defaults = ROLE_DEFAULT_MODULES[role] || [];
  let requested: string[];
  if (rawModules === undefined) {
    requested = [...defaults];
  } else if (Array.isArray(rawModules)) {
    requested = rawModules.map((value) => cleanString(value).toLowerCase()).filter(Boolean);
  } else {
    throw new HttpsError("invalid-argument", "modules must be an array.");
  }

  const modules = [...new Set(requested)].sort();
  for (const moduleKey of modules) {
    if (!allowed.has(moduleKey)) {
      throw new HttpsError("permission-denied", `Module ${moduleKey} is not allowed for role ${role}.`);
    }
  }
  return modules;
}

function permissionsForModules(modules: string[]) {
  const permissions: Record<string, boolean> = {};
  for (const moduleKey of modules) {
    for (const permission of MODULE_PERMISSION_MAP[moduleKey] || []) permissions[permission] = true;
  }
  return permissions;
}

function canonicalAccess(role: string, payload: any) {
  if (!STAFF_ROLES.has(role)) throw new HttpsError("invalid-argument", `Unsupported staff role: ${role}`);
  if (payload?.permissions !== undefined) {
    throw new HttpsError("invalid-argument", "permissions are server-derived from the selected modules.");
  }
  const modules = normalizeModules(role, payload?.modules);
  return { modules, permissions: permissionsForModules(modules) };
}

function claimsForAccess(role: string, modules: string[], permissions: Record<string, boolean>, suspended = false) {
  return {
    role,
    userRole: role,
    primaryRole: role,
    staff: true,
    isStaff: true,
    technician: role === "technician",
    finance_admin: role === "finance_admin",
    finance_manager: role === "finance_manager",
    finance_controller: role === "finance_controller",
    admin: false,
    isAdmin: false,
    superAdmin: false,
    super_admin: false,
    ceo: false,
    modules,
    staffModules: modules,
    permissions,
    suspended,
  };
}

function numberAtLeastZero(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(cleanString(value, String(fallback)), 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function buildInvitationMessage({ displayName, email, role, loginUrl, emailVerificationLink, passwordResetLink }: {
  displayName: string;
  email: string;
  role: string;
  loginUrl: string;
  emailVerificationLink: string;
  passwordResetLink: string;
}) {
  const safeName = escapeHtml(displayName);
  const safeEmail = escapeHtml(email);
  const safeRole = escapeHtml(titleCaseRole(role));
  const safeLoginUrl = escapeHtml(loginUrl);
  const safeVerificationLink = escapeHtml(emailVerificationLink);
  const safePasswordResetLink = escapeHtml(passwordResetLink);
  const portalName = role === "technician" ? "Technician Portal" : "Admin Portal";

  const subject = `BIN GROUP ${titleCaseRole(role)} account invitation`;
  const text = [
    `Hello ${displayName},`,
    "",
    `A BIN GROUP ${titleCaseRole(role)} account has been created for ${email}.`,
    `1. Verify your email: ${emailVerificationLink}`,
    `2. Set your private password: ${passwordResetLink}`,
    `3. Open the ${portalName}: ${loginUrl}`,
    "",
    "Your account remains onboarding-restricted until HR completes and approves the canonical activation checklist.",
    "Do not share your password, verification links, SMS codes, or device access.",
    "",
    "مرحباً، تم إنشاء حسابك في BIN GROUP. يرجى تأكيد البريد الإلكتروني، تعيين كلمة مرور خاصة، ثم انتظار اعتماد التفعيل من الموارد البشرية.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:640px;margin:0 auto;padding:24px">
      <div style="background:#020617;color:#d4af37;padding:20px 24px;border-radius:16px 16px 0 0"><h1 style="margin:0;font-size:24px">BIN GROUP</h1><p style="margin:4px 0 0;color:#cbd5e1">Secure account invitation</p></div>
      <div style="border:1px solid #e5e7eb;border-top:0;padding:24px;border-radius:0 0 16px 16px">
        <p>Hello <strong>${safeName}</strong>,</p><p>A <strong>${safeRole}</strong> account has been created for <strong>${safeEmail}</strong>.</p>
        <ol><li style="margin-bottom:16px"><a href="${safeVerificationLink}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Verify email address</a></li><li style="margin-bottom:16px"><a href="${safePasswordResetLink}" style="display:inline-block;background:#d4af37;color:#111827;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Set private password</a></li><li><a href="${safeLoginUrl}" style="font-weight:700">Open the ${escapeHtml(portalName)}</a></li></ol>
        <p style="margin-top:20px;padding:12px;background:#fffbeb;border-radius:8px"><strong>Activation:</strong> Portal authority remains restricted until HR completes and approves the canonical onboarding checklist.</p>
        <p style="margin-top:12px;padding:12px;background:#f8fafc;border-radius:8px"><strong>Security:</strong> Never share passwords, verification links, SMS codes, or device access.</p><hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0" /><p dir="rtl" style="text-align:right">مرحباً <strong>${safeName}</strong>، تم إنشاء حسابك في BIN GROUP. يرجى تأكيد البريد الإلكتروني، تعيين كلمة مرور خاصة، ثم انتظار اعتماد التفعيل من الموارد البشرية.</p>
      </div>
    </div>
  `.trim();
  return { subject, text, html };
}

async function assertNoExistingIdentity(email: string) {
  try {
    await admin.auth().getUserByEmail(email);
    throw new HttpsError("already-exists", "An authentication identity already exists for this email. Customer identities cannot be converted through Staff Access.");
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    if (error?.code !== "auth/user-not-found") throw new HttpsError("internal", "Unable to validate email uniqueness.");
  }
  const duplicateProfiles = await db.collection("users").where("email", "==", email).limit(1).get();
  if (!duplicateProfiles.empty) {
    throw new HttpsError("already-exists", "A profile already exists for this email. Resolve the duplicate identity through a protected remediation workflow.");
  }
}

async function loadExistingStaff(uidOrNumber: string) {
  if (!uidOrNumber) throw new HttpsError("invalid-argument", "Staff UID is required.");
  const uid = await resolveStaffUid(uidOrNumber);
  const [authUser, userSnap, accessSnap] = await Promise.all([
    admin.auth().getUser(uid),
    db.collection("users").doc(uid).get(),
    db.collection("staffAccess").doc(uid).get(),
  ]);
  if (!userSnap.exists || userSnap.data()?.isStaff !== true || !accessSnap.exists) {
    throw new HttpsError("failed-precondition", "The target identity is not a fully provisioned staff account.");
  }
  const currentRole = cleanString(userSnap.data()?.role).toLowerCase();
  if (!STAFF_ROLES.has(currentRole) || PRIVILEGED_ADMIN_ROLES.has(currentRole)) {
    throw new HttpsError("permission-denied", "Privileged or customer identities cannot be managed from Staff Access.");
  }
  const claims = authUser.customClaims || {};
  if (claims.admin === true || claims.superAdmin === true || claims.super_admin === true || claims.ceo === true) {
    throw new HttpsError("permission-denied", "Privileged identities cannot be managed from Staff Access.");
  }
  const currentStatus = cleanString(userSnap.data()?.status).toUpperCase();
  if (currentStatus === "OFFBOARDED" || claims.offboarded === true || userSnap.data()?.offboarded === true) {
    throw new HttpsError("failed-precondition", "OFFBOARDED is terminal. Create a new staff identity through the approved provisioning lifecycle instead of restoring this account.");
  }
  return { authUser, userSnap, accessSnap, currentRole, uid };
}

export const adminCreateUser = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const { actorId, actorRole } = await requireProvisioningAdmin(request);
  const payload = request.data || {};
  const role = cleanString(payload.role, "technician").toLowerCase();
  const email = normalizeEmail(payload.email);
  const displayName = cleanString(payload.displayName || payload.fullName);
  const phoneNumber = cleanString(payload.phoneNumber || payload.phone || payload.mobile);
  const department = cleanString(payload.department, role === "technician" ? "Technical" : "Operations");
  const specialization = cleanString(payload.specialization || payload.trade || payload.department, "General Maintenance");

  if (!email || !email.includes("@")) throw new HttpsError("invalid-argument", "A valid email address is required.");
  if (!displayName) throw new HttpsError("invalid-argument", "Full name is required.");
  if (payload.initialPassword !== undefined || payload.password !== undefined || payload.tempPassword !== undefined) {
    throw new HttpsError("invalid-argument", "Client-supplied passwords are prohibited. The user must set a private password from the invitation.");
  }

  const { modules, permissions } = canonicalAccess(role, payload);
  const financeTierAssignment = FINANCE_TIER_ROLES.has(role);
  if (financeTierAssignment) await requireFinanceTierAssigner(request);
  const isFinanceApprover = FINANCE_APPROVER_ROLES.has(role);
  await assertNoExistingIdentity(email);
  const authUser = await admin.auth().createUser({ email, displayName, password: generatedBootstrapPassword(), emailVerified: false, disabled: false });
  const uid = authUser.uid;
  const now = FieldValue.serverTimestamp();
  const authDocRef = db.collection("finance_role_authorizations").doc();
  const authorizationId = authDocRef.id;
  const onboardingChecklist = {
    profileComplete: false,
    documentsComplete: false,
    contractComplete: false,
    deviceReady: role !== "technician",
    activationApproved: false,
  };

  try {
    const claims = claimsForAccess(role, modules, permissions, true);
    if (isFinanceApprover) {
      claims.finance_admin = false;
      claims.finance_manager = false;
      claims.finance_controller = false;
      (claims as any).financeApprovalPending = true;
    }
    await admin.auth().setCustomUserClaims(uid, claims);
    const loginUrl = loginUrlForRole(role);
    const actionCodeSettings = { url: loginUrl, handleCodeInApp: false };
    const [emailVerificationLink, passwordResetLink] = await Promise.all([
      admin.auth().generateEmailVerificationLink(email, actionCodeSettings),
      admin.auth().generatePasswordResetLink(email, actionCodeSettings),
    ]);
    const invitationMessage = buildInvitationMessage({ displayName, email, role, loginUrl, emailVerificationLink, passwordResetLink });
    const invitationRef = db.collection("mail").doc();

    const operationalProfile = {
      uid, email, displayName, fullName: displayName, phoneNumber, phone: phoneNumber,
      role, userRole: role, primaryRole: role, department, specialization, trade: specialization,
      status: "INVITED", suspended: true, isStaff: true, isAdmin: false, staffModules: modules, modules, permissions,
      onboardingStage: "INVITED", onboardingChecklist, onboardingComplete: false,
      invitationStatus: "QUEUED", createdAt: now, updatedAt: now, createdBy: actorId,
      provisionedBy: actorId, provisionedVia: "adminCreateUser",
      staffNumber: 0,
      staffNumberStr: "",
      ...(isFinanceApprover ? { financeApprovalStatus: "PENDING_INDEPENDENT_APPROVAL", financeApprovalRequired: true } : {}),
    };
    const scheduleProfile = {
      uid, displayName, role, employeeType: role, department, specialization,
      status: "INVITED", suspended: true, onboardingStage: "INVITED", onboardingComplete: false,
      joiningDate: cleanString(payload.joiningDate) || null, offDay: cleanString(payload.offDay, "Sunday"),
      shiftName: cleanString(payload.shiftName, "Day Shift"), workingHours: cleanString(payload.workingHours, DEFAULT_WORKING_HOURS),
      employmentType: cleanString(payload.employmentType, "full_time"), createdAt: now, updatedAt: now,
    };
    const privateHrProfile = {
      uid, emailHash: hashValue(email), employeeId: cleanString(payload.employeeId) || null,
      emiratesId: cleanString(payload.emiratesId) || null, joiningDate: cleanString(payload.joiningDate) || null,
      contractEndDate: cleanString(payload.contractEndDate) || null,
      employmentType: cleanString(payload.employmentType, "full_time"),
      salaryPackage: {
        basicSalary: numberAtLeastZero(payload.basicSalary), housingAllowance: numberAtLeastZero(payload.housingAllowance),
        transportAllowance: numberAtLeastZero(payload.transportAllowance), foodAllowance: numberAtLeastZero(payload.foodAllowance),
        otherAllowance: numberAtLeastZero(payload.otherAllowance), salaryPaymentDay: boundedInteger(payload.salaryPaymentDay, 1, 1, 31),
        salaryGrade: cleanString(payload.salaryGrade) || null, overtimeEligible: payload.overtimeEligible !== false,
        companyAccommodationProvided: Boolean(payload.companyAccommodationProvided),
        companyTransportProvided: Boolean(payload.companyTransportProvided),
        companyMedicalInsuranceProvided: payload.companyMedicalInsuranceProvided !== false,
      },
      accessClassification: "PRIVATE_HR_SERVER_ONLY", createdAt: now, updatedAt: now, createdBy: actorId,
    };

    let assignedStaffNumber = STAFF_NUMBER_START;

    await db.runTransaction(async (tx) => {
      const counterRef = db.collection("system_counters").doc(STAFF_NUMBER_COUNTER_DOC);
      const counterSnap = await tx.get(counterRef);
      let staffNumber = STAFF_NUMBER_START;
      if (counterSnap.exists) {
        const rawCurrent = counterSnap.data()?.nextStaffNumber ?? counterSnap.data()?.current;
        const parsed = Number(rawCurrent);
        if (Number.isInteger(parsed) && parsed >= STAFF_NUMBER_START) {
          staffNumber = parsed;
        }
      }
      assignedStaffNumber = staffNumber;

      tx.set(counterRef, {
        current: staffNumber,
        nextStaffNumber: staffNumber + 1,
        lastAssignedStaffNumber: staffNumber,
        updatedAt: now,
      }, { merge: true });

      operationalProfile.staffNumber = staffNumber;
      operationalProfile.staffNumberStr = String(staffNumber);
      tx.create(db.collection("users").doc(uid), operationalProfile);
      tx.create(db.collection("staffAccess").doc(uid), {
        uid, role, active: false, suspended: true, status: "INVITED", onboardingStage: "INVITED",
        modules, staffModules: modules, permissions, grantedAt: now, grantedBy: actorId, updatedAt: now,
        staffNumber,
        staffNumberStr: String(staffNumber),
        ...(isFinanceApprover ? { financeApprovalStatus: "PENDING_INDEPENDENT_APPROVAL" } : {}),
      });
      tx.create(db.collection("hrProfiles").doc(uid), scheduleProfile);
      tx.create(db.collection("private_hr_profiles").doc(uid), privateHrProfile);
      if (role === "technician") {
        tx.create(db.collection("technicians").doc(uid), {
          ...operationalProfile,
          staffNumber,
          staffNumberStr: String(staffNumber),
          available: false, onDuty: false, currentJobCount: 0, approvalStatus: "PENDING",
          maxConcurrentJobs: boundedInteger(payload.maxConcurrentJobs, 3, 1, 10), emergencyEligible: Boolean(payload.emergencyEligible),
        });
      }
      tx.create(invitationRef, {
        to: [email], message: { subject: invitationMessage.subject, text: invitationMessage.text, html: invitationMessage.html, from: "BIN GROUP <ceo@bin-groups.com>", replyTo: "BIN GROUP Admin <ceo@bin-groups.com>" },
        type: "staff_account_invitation", template: "staff-account-invitation-v2", targetUid: uid, targetRole: role,
        status: "QUEUED", delivery: { state: "QUEUED" }, createdAt: now, updatedAt: now, createdBy: actorId,
      });
      tx.create(db.collection("audit_logs").doc(), {
        actorId, actorRole, action: "ADMIN_CREATE_STAFF_USER", targetType: "users", targetId: uid,
        metadata: {
          emailHash: hashValue(email), role, modules, permissionKeys: Object.keys(permissions).sort(),
          financeTierAssignment,
          isFinanceApprover,
          staffNumber,
          invitationQueued: true, invitationMailId: invitationRef.id, privateHrSeparated: true,
          onboardingStage: "INVITED", activationRequired: true, portalAccessActive: false,
        },
        createdAt: now,
      });
      if (isFinanceApprover) {
        tx.create(authDocRef, {
          authorizationId,
          actionType: "CREATE_FINANCE_APPROVER",
          targetUid: uid,
          targetStaffNumber: staffNumber,
          targetEmail: email,
          targetRole: role,
          modules,
          requesterId: actorId,
          requesterRole: actorRole,
          status: "PENDING_INDEPENDENT_APPROVAL",
          twoPersonVerified: false,
          consumed: false,
          createdAt: now,
          updatedAt: now,
        });
        tx.create(db.collection("audit_logs").doc(), {
          actorId,
          actorRole,
          action: "ADMIN_REQUEST_FINANCE_ROLE_ASSIGNMENT",
          targetType: "users",
          targetId: uid,
          metadata: {
            authorizationId,
            actionType: "CREATE_FINANCE_APPROVER",
            targetUid: uid,
            targetStaffNumber: staffNumber,
            targetRole: role,
            requesterId: actorId,
            status: "PENDING_INDEPENDENT_APPROVAL",
          },
          createdAt: now,
        });
      }
    });

    return {
      success: true, uid, staffNumber: assignedStaffNumber, role, modules, invitationQueued: true, onboardingStage: "INVITED", portalAccessActive: false,
      ...(isFinanceApprover ? {
        pendingIndependentApproval: true,
        authorizationId,
        message: "Staff identity created. Two-person authorization is required before Finance approver authority is granted.",
      } : {
        message: "Staff identity created and invitation queued. HR activation is required before portal authority is granted.",
      }),
    };
  } catch (error: any) {
    await admin.auth().deleteUser(uid).catch((rollbackError) => console.error("Failed to roll back newly created staff Auth user", { uid, rollbackError }));
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", `Unable to provision staff account safely: ${error?.message || error}`);
  }
});

export const adminUpdateStaffAccess = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const { actorId, actorRole } = await requireProvisioningAdmin(request);
  const payload = request.data || {};
  const uid = cleanString(payload.uid);
  if (uid && uid === actorId) {
    throw new HttpsError("permission-denied", "Self-assignment prohibited: an administrator cannot modify their own staff access or assigned roles.");
  }
  const role = cleanString(payload.role).toLowerCase();
  const { authUser, userSnap, accessSnap, currentRole } = await loadExistingStaff(uid);
  if ((currentRole === "technician") !== (role === "technician")) {
    throw new HttpsError("failed-precondition", "Technician identities cannot be converted to or from Admin-portal staff roles.");
  }
  const financeTierAssignment = FINANCE_TIER_ROLES.has(role) || FINANCE_TIER_ROLES.has(currentRole);
  if (financeTierAssignment) await requireFinanceTierAssigner(request);
  const isFinanceApproverChange = (FINANCE_APPROVER_ROLES.has(role) || FINANCE_APPROVER_ROLES.has(currentRole)) && role !== currentRole;
  const authorizationId = cleanString(payload.authorizationId);
  if (isFinanceApproverChange) {
    if (!authorizationId) {
      throw new HttpsError(
        "failed-precondition",
        "Two-person authorization required: promoting staff into a Finance approver role or changing an existing Finance approver's role requires independent second-person approval. Request authorization and supply the approved authorizationId.",
      );
    }
    const authSnap = await db.collection("finance_role_authorizations").doc(authorizationId).get();
    if (!authSnap.exists) {
      throw new HttpsError("not-found", "Finance role authorization request not found.");
    }
    const authData = authSnap.data() || {};
    if (authData.status !== "APPROVED" || authData.consumed === true) {
      throw new HttpsError("failed-precondition", "Finance role authorization is not approved or has already been consumed.");
    }
    const expiry = isAuthorizationExpired(authData.createdAt);
    if (expiry.expired) {
      throw new HttpsError("failed-precondition", "Finance role authorization request has expired (24-hour limit exceeded).");
    }
    if (authData.targetUid !== uid || authData.targetRole !== role) {
      throw new HttpsError("failed-precondition", "Finance role authorization does not match the target user or requested role.");
    }
    if (authData.approverId === actorId || authData.requesterId === authData.approverId) {
      throw new HttpsError("permission-denied", "Segregation of duties: requester cannot apply their own unverified approval.");
    }
  }
  const { modules, permissions } = canonicalAccess(role, payload);
  const lifecycleActive = cleanString(userSnap.data()?.status).toUpperCase() === "ACTIVE" &&
    userSnap.data()?.onboardingComplete === true && accessSnap.data()?.active === true;
  const previousClaims = authUser.customClaims || {};
  const previousDisabled = authUser.disabled;
  const now = FieldValue.serverTimestamp();

  try {
    await admin.auth().setCustomUserClaims(uid, claimsForAccess(role, modules, permissions, !lifecycleActive));
    await db.runTransaction(async (tx) => {
      tx.update(db.collection("users").doc(uid), { role, userRole: role, primaryRole: role, staffModules: modules, modules, permissions, updatedAt: now });
      tx.update(db.collection("staffAccess").doc(uid), {
        role, modules, staffModules: modules, permissions,
        active: lifecycleActive, suspended: !lifecycleActive, updatedAt: now, updatedBy: actorId,
      });
      tx.update(db.collection("hrProfiles").doc(uid), { role, employeeType: role, updatedAt: now });
      if (role === "technician") tx.update(db.collection("technicians").doc(uid), { role, userRole: role, primaryRole: role, staffModules: modules, modules, permissions, updatedAt: now });
      if (isFinanceApproverChange && authorizationId) {
        const txAuthSnap = await tx.get(db.collection("finance_role_authorizations").doc(authorizationId));
        if (!txAuthSnap.exists) throw new HttpsError("not-found", "Finance role authorization request not found.");
        const txAuthData = txAuthSnap.data() || {};
        if (txAuthData.status !== "APPROVED" || txAuthData.consumed === true) {
          throw new HttpsError("failed-precondition", "Finance role authorization is no longer valid or has already been consumed.");
        }
        if (isAuthorizationExpired(txAuthData.createdAt).expired) {
          throw new HttpsError("failed-precondition", "Finance role authorization request has expired (24-hour limit exceeded).");
        }
        tx.update(db.collection("finance_role_authorizations").doc(authorizationId), {
          consumed: true,
          consumedAt: now,
          consumedBy: actorId,
        });
      }
      tx.create(db.collection("audit_logs").doc(), {
        actorId, actorRole, action: "ADMIN_UPDATE_STAFF_ACCESS", targetType: "users", targetId: uid,
        metadata: {
          previousRole: currentRole, role, modules, permissionKeys: Object.keys(permissions).sort(), financeTierAssignment,
          lifecycleActive, onboardingComplete: userSnap.data()?.onboardingComplete === true,
          ...(authorizationId ? { authorizationId, twoPersonVerified: true } : {}),
        },
        createdAt: now,
      });
    });
    await admin.auth().revokeRefreshTokens(uid);
    return { success: true, uid, role, modules, lifecycleActive, tokenRefreshRequired: true };
  } catch (error: any) {
    await Promise.all([admin.auth().setCustomUserClaims(uid, previousClaims), admin.auth().updateUser(uid, { disabled: previousDisabled })])
      .catch((rollbackError) => console.error("Failed to restore staff Auth state after access update failure", { uid, rollbackError }));
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", `Unable to update staff access safely: ${error?.message || error}`);
  }
});

export const adminRequestFinanceRoleAssignment = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const { actorId, actorRole } = await requireProvisioningAdmin(request);
  const token = request.auth?.token || {};
  if (!isFinanceTierAssigner(token)) {
    throw new HttpsError("permission-denied", "Only a Super Admin or CEO can initiate a Finance role assignment request.");
  }
  const payload = request.data || {};
  const rawTarget = cleanString(payload.targetUid || payload.uid || payload.staffNumber);
  if (!rawTarget) throw new HttpsError("invalid-argument", "targetUid is required.");
  const targetUid = await resolveStaffUid(rawTarget);
  const targetRole = cleanString(payload.targetRole || payload.role).toLowerCase();
  const actionType = cleanString(payload.actionType, "PROMOTE_STAFF").toUpperCase();
  const isDemotion = actionType === "DEMOTE_STAFF" || actionType === "REVOKE_AUTHORITY" || actionType === "DEMOTE_FINANCE_APPROVER" || actionType === "REVOKE_FINANCE_APPROVER";

  if (targetUid === actorId) {
    throw new HttpsError("permission-denied", isDemotion
      ? "Self-demotion prohibited: you cannot request demotion or revocation for yourself."
      : "Self-assignment prohibited: you cannot request Finance authority for yourself.");
  }

  const { authUser, userSnap, currentRole } = await loadExistingStaff(targetUid);

  if (isDemotion) {
    if (!FINANCE_APPROVER_ROLES.has(currentRole)) {
      throw new HttpsError("failed-precondition", `Target user is not currently a Finance approver (current role: ${currentRole}). Demotion request invalid.`);
    }
    if (!STAFF_ROLES.has(targetRole)) {
      throw new HttpsError("invalid-argument", `Invalid demotion target role: ${targetRole}. Must be a valid staff role.`);
    }
    if (FINANCE_APPROVER_ROLES.has(targetRole)) {
      throw new HttpsError("invalid-argument", `Demotion workflow cannot assign a Finance approver role (${targetRole}). Authority escalation prohibited.`);
    }
  } else {
    if (!FINANCE_APPROVER_ROLES.has(targetRole)) {
      throw new HttpsError("invalid-argument", `Invalid Finance approver role: ${targetRole}. Must be one of: finance_admin, finance_manager, finance_controller.`);
    }
    if (actionType === FINANCE_REGRANT_ACTION) {
      const claims = authUser.customClaims || {};
      if (targetRole !== currentRole || !FINANCE_APPROVER_ROLES.has(currentRole)) {
        throw new HttpsError("invalid-argument", "A Finance re-grant must keep the target's current explicit Finance approver role.");
      }
      if (cleanString(claims.role || claims.userRole || claims.primaryRole).toLowerCase() !== currentRole || claims[currentRole] !== true) {
        throw new HttpsError("failed-precondition", "The target does not currently hold this explicit Finance approver claim. Use the assignment flow instead.");
      }
      if (authUser.disabled || claims.suspended === true || userSnap.data()?.suspended === true) {
        throw new HttpsError("failed-precondition", "A Finance re-grant is only for an active, unsuspended account. Use the reactivation flow instead.");
      }
      const pending = await db.collection("finance_role_authorizations")
        .where("targetUid", "==", targetUid)
        .where("status", "==", "PENDING_INDEPENDENT_APPROVAL")
        .limit(10)
        .get();
      if (pending.docs.some((doc) => doc.data()?.actionType === FINANCE_REGRANT_ACTION && !isAuthorizationExpired(doc.data()?.createdAt).expired)) {
        throw new HttpsError("already-exists", "A Finance re-grant request for this account is already pending independent approval.");
      }
    }
  }

  const now = FieldValue.serverTimestamp();
  const authDocRef = db.collection("finance_role_authorizations").doc();
  const authorizationId = authDocRef.id;

  await db.runTransaction(async (tx) => {
    tx.create(authDocRef, {
      authorizationId,
      actionType,
      targetUid,
      targetStaffNumber: userSnap.data()?.staffNumber || null,
      targetEmail: authUser.email || userSnap.data()?.email || "",
      targetRole,
      previousRole: currentRole,
      requesterId: actorId,
      requesterRole: actorRole,
      status: "PENDING_INDEPENDENT_APPROVAL",
      twoPersonVerified: false,
      consumed: false,
      createdAt: now,
      updatedAt: now,
    });
    tx.create(db.collection("audit_logs").doc(), {
      actorId,
      actorRole,
      action: isDemotion
        ? "ADMIN_REQUEST_FINANCE_ROLE_DEMOTION"
        : (actionType === FINANCE_REGRANT_ACTION ? "ADMIN_REQUEST_FINANCE_ROLE_REGRANT" : "ADMIN_REQUEST_FINANCE_ROLE_ASSIGNMENT"),
      targetType: "users",
      targetId: targetUid,
      metadata: {
        authorizationId,
        actionType,
        targetUid,
        targetRole,
        previousRole: currentRole,
        requesterId: actorId,
        status: "PENDING_INDEPENDENT_APPROVAL",
      },
      createdAt: now,
    });
  });

  return {
    success: true,
    authorizationId,
    targetUid,
    targetStaffNumber: userSnap.data()?.staffNumber || null,
    targetRole,
    status: "PENDING_INDEPENDENT_APPROVAL",
    message: isDemotion
      ? "Finance role demotion request submitted. An independent authorized approver must approve it."
      : "Finance role assignment request submitted. An independent authorized approver must approve it.",
  };
});

export const adminApproveFinanceRoleAssignment = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const { approverId, approverRole } = await requireIndependentFinanceApprover(request);
  const payload = request.data || {};
  const authorizationId = cleanString(payload.authorizationId);
  if (!authorizationId) throw new HttpsError("invalid-argument", "authorizationId is required.");

  const authRef = db.collection("finance_role_authorizations").doc(authorizationId);
  const now = FieldValue.serverTimestamp();

  let expiredAuditPayload: any = null;
  let txResult: any;

  // 1. Authoritative Firestore transaction: lock document, enforce TTL expiry, verify segregation of duties & live role
  try {
    txResult = await db.runTransaction(async (tx) => {
      const authSnap = await tx.get(authRef);
      if (!authSnap.exists) throw new HttpsError("not-found", "Finance role authorization request not found.");

      const authData = authSnap.data() || {};
      if (authData.status === "APPROVED") {
        if (authData.authSyncRetryRequired === true) {
          if (approverId === authData.requesterId) {
            throw new HttpsError("permission-denied", "Segregation of duties violation: requester cannot approve auth sync recovery.");
          }
          if (approverId === authData.targetUid) {
            throw new HttpsError("permission-denied", "Self-promotion/demotion violation: target user cannot approve their own auth sync recovery.");
          }
          const actionType = authData.actionType;
          const isDemotion = actionType === "DEMOTE_STAFF" || actionType === "REVOKE_AUTHORITY" || actionType === "DEMOTE_FINANCE_APPROVER" || actionType === "REVOKE_FINANCE_APPROVER";
          const isReactivation = actionType === "REACTIVATE_STAFF" || actionType === "RESTORE_AUTHORITY";
          const { modules, permissions } = canonicalAccess(authData.targetRole, {});
          return {
            targetUid: authData.targetUid,
            targetRole: authData.targetRole,
            actionType,
            isDemotion,
            isReactivation,
            isRegrant: actionType === FINANCE_REGRANT_ACTION,
            modules,
            permissions,
            isRecovery: true,
          };
        }
        throw new HttpsError("failed-precondition", `Request is not pending approval (current status: ${authData.status}).`);
      }
      if (authData.status !== "PENDING_INDEPENDENT_APPROVAL") {
        throw new HttpsError("failed-precondition", `Request is not pending approval (current status: ${authData.status}).`);
      }

      // Authoritative 24-hour expiration check (fail closed)
      const expiry = isAuthorizationExpired(authData.createdAt);
      if (expiry.expired) {
        expiredAuditPayload = {
          actorId: approverId,
          actorRole: approverRole,
          action: "FINANCE_ROLE_ASSIGNMENT_EXPIRED_REFUSAL",
          targetType: "finance_role_authorizations",
          targetId: authorizationId,
          metadata: {
            authorizationId,
            actionType: authData.actionType || null,
            targetUid: authData.targetUid || null,
            targetRole: authData.targetRole || null,
            previousRole: authData.previousRole || null,
            createdAt: authData.createdAt ?? null,
            reason: expiry.reason || "AUTHORIZATION_EXPIRED_24H",
            ageMs: typeof expiry.ageMs === "number" ? expiry.ageMs : null,
            attemptedAt: now,
          },
          createdAt: now,
        };
        throw new HttpsError("failed-precondition", "Finance role authorization request has expired (24-hour limit exceeded).");
      }

    // Segregation of duties:
    if (approverId === authData.requesterId) {
      throw new HttpsError("permission-denied", "Segregation of duties violation: the person requesting the Finance role assignment cannot approve it.");
    }
    if (approverId === authData.targetUid) {
      throw new HttpsError("permission-denied", "Self-promotion/demotion violation: target user cannot approve their own Finance role assignment.");
    }

    const targetUid = authData.targetUid;
    const targetRole = authData.targetRole;
    const actionType = authData.actionType;
    const isDemotion = actionType === "DEMOTE_STAFF" || actionType === "REVOKE_AUTHORITY" || actionType === "DEMOTE_FINANCE_APPROVER" || actionType === "REVOKE_FINANCE_APPROVER";

    // Re-read target user doc inside transaction to prevent stale role mutations
    const userRef = db.collection("users").doc(targetUid);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "Target user record not found.");
    }
    const userData = userSnap.data() || {};
    const liveTargetRole = cleanString(userData.role || userData.userRole || userData.primaryRole).toLowerCase();

    // Verify underlying conditions haven't changed:
    if (authData.previousRole && liveTargetRole !== authData.previousRole) {
      throw new HttpsError(
        "failed-precondition",
        `Underlying condition changed: target user role (${liveTargetRole}) no longer matches authorization previous role (${authData.previousRole}).`,
      );
    }

    if (isDemotion) {
      if (!FINANCE_APPROVER_ROLES.has(liveTargetRole)) {
        throw new HttpsError("failed-precondition", "Target user does not currently hold a Finance approver role to demote.");
      }
      if (FINANCE_APPROVER_ROLES.has(targetRole)) {
        throw new HttpsError("failed-precondition", "Demotion cannot grant financial approval authority.");
      }
    }

    if (actionType === FINANCE_REGRANT_ACTION) {
      if (!FINANCE_APPROVER_ROLES.has(targetRole) || liveTargetRole !== targetRole) {
        throw new HttpsError("failed-precondition", "Underlying condition changed: the target no longer holds the Finance approver role being re-granted.");
      }
      if (userData.suspended === true) {
        throw new HttpsError("failed-precondition", "Underlying condition changed: the target account is suspended. Use the reactivation flow instead.");
      }
      // Consumed at approval: a re-grant authorization can never be replayed by adminUpdateStaffAccess
      // or adminSetStaffStatus. No role, module, status or staffAccess change is made.
      tx.update(authRef, {
        status: "APPROVED",
        consumed: true,
        consumedAt: now,
        consumedBy: approverId,
        authSyncStatus: "PENDING",
        authSyncRetryRequired: false,
        approverId,
        approverRole,
        twoPersonVerified: true,
        approvedAt: now,
        updatedAt: now,
      });
      tx.create(db.collection("audit_logs").doc(), {
        actorId: approverId,
        actorRole: approverRole,
        action: "FINANCE_ROLE_REGRANT_APPROVED",
        targetType: "users",
        targetId: targetUid,
        metadata: {
          authorizationId,
          actionType,
          targetUid,
          targetRole,
          previousRole: authData.previousRole || liveTargetRole,
          requesterId: authData.requesterId,
          approverId,
          twoPersonVerified: true,
          decision: "APPROVED",
          reason: "Finance authorization independently re-granted (financeAuthorizedAt refresh only)",
        },
        createdAt: now,
      });
      return {
        targetUid,
        targetRole,
        actionType,
        isDemotion: false,
        isReactivation: false,
        isRegrant: true,
        modules: [],
        permissions: {},
      };
    }

    const isReactivation = actionType === "REACTIVATE_STAFF" || actionType === "RESTORE_AUTHORITY";
    const { modules, permissions } = canonicalAccess(targetRole, {});

    tx.update(authRef, {
      status: "APPROVED",
      authSyncStatus: "PENDING",
      authSyncRetryRequired: false,
      approverId,
      approverRole,
      twoPersonVerified: true,
      approvedAt: now,
      updatedAt: now,
    });
    tx.update(userRef, {
      role: targetRole,
      userRole: targetRole,
      primaryRole: targetRole,
      staffModules: modules,
      modules,
      permissions,
      ...(isReactivation ? { status: "ACTIVE", suspended: false, restoredAt: now, restoredBy: approverId } : {}),
      updatedAt: now,
    });
    tx.update(db.collection("staffAccess").doc(targetUid), {
      role: targetRole,
      modules,
      staffModules: modules,
      permissions,
      active: isReactivation ? true : (isDemotion ? true : false),
      suspended: isReactivation ? false : (isDemotion ? false : true),
      updatedAt: now,
      updatedBy: approverId,
    });
    tx.create(db.collection("audit_logs").doc(), {
      actorId: approverId,
      actorRole: approverRole,
      action: isDemotion ? "FINANCE_ROLE_DEMOTION_APPROVED" : "FINANCE_ROLE_ASSIGNMENT_APPROVED",
      targetType: "users",
      targetId: targetUid,
      metadata: {
        authorizationId,
        actionType,
        targetUid,
        targetRole,
        proposedRole: targetRole,
        previousRole: authData.previousRole || liveTargetRole,
        requesterId: authData.requesterId,
        approverId,
        twoPersonVerified: true,
        decision: "APPROVED",
        reason: isDemotion ? "Finance role demotion independently approved" : "Finance role assignment independently approved",
      },
      createdAt: now,
    });

    return {
      targetUid,
      targetRole,
      actionType,
      isDemotion,
      isReactivation,
      modules,
      permissions,
    };
  });
  } catch (txErr: any) {
    if (expiredAuditPayload) {
      await Promise.all([
        db.collection("audit_logs").add(expiredAuditPayload),
        authRef.update({
          status: "EXPIRED",
          expiredAt: now,
          updatedAt: now,
        }),
      ]).catch((auditErr) => console.error("Failed to persist expired refusal audit", auditErr));
    }
    throw txErr;
  }

  // 2. Auth claims synchronization & session revocation with resilient error handling & recoverable state
  let authSyncSuccess = false;
  let authSyncError: any = null;

  try {
    const targetUser = await admin.auth().getUser(txResult.targetUid);
    const existingClaims = targetUser.customClaims || {};
    if (txResult.isRegrant) {
      const liveClaimRole = cleanString(existingClaims.role || existingClaims.userRole || existingClaims.primaryRole).toLowerCase();
      if (
        targetUser.disabled ||
        existingClaims.suspended === true ||
        liveClaimRole !== txResult.targetRole ||
        existingClaims[txResult.targetRole] !== true
      ) {
        throw new Error("Re-grant target no longer holds an active explicit Finance approver claim; financeAuthorizedAt was not refreshed.");
      }
      await admin.auth().setCustomUserClaims(txResult.targetUid, {
        ...existingClaims,
        financeApprovalPending: false,
        financeAuthorizedAt: Date.now(),
      });
      await admin.auth().revokeRefreshTokens(txResult.targetUid);
      authSyncSuccess = true;
    }
    const nextClaims = {
      ...existingClaims,
      ...claimsForAccess(
        txResult.targetRole,
        txResult.modules,
        txResult.permissions,
        txResult.isReactivation ? false : (txResult.isDemotion ? false : existingClaims.suspended === true),
      ),
      role: txResult.targetRole,
      userRole: txResult.targetRole,
      primaryRole: txResult.targetRole,
      finance_admin: txResult.targetRole === "finance_admin",
      finance_manager: txResult.targetRole === "finance_manager",
      finance_controller: txResult.targetRole === "finance_controller",
      financeApprovalPending: false,
      ...(txResult.isReactivation ? { suspended: false } : {}),
      ...(txResult.isDemotion
        ? { financeAuthorizedAt: null }
        : (FINANCE_APPROVER_ROLES.has(txResult.targetRole) ? { financeAuthorizedAt: Date.now() } : {})),
    };

    if (!txResult.isRegrant) {
      if (txResult.isReactivation) {
        await admin.auth().updateUser(txResult.targetUid, { disabled: false });
      }
      await admin.auth().setCustomUserClaims(txResult.targetUid, nextClaims);
      await admin.auth().revokeRefreshTokens(txResult.targetUid);
      authSyncSuccess = true;
    }
  } catch (authErr: any) {
    authSyncError = authErr;
    console.error("Critical: Auth claims sync or token revocation failed post-transaction", {
      targetUid: txResult.targetUid,
      authorizationId,
      error: authErr,
    });
  }

  if (!authSyncSuccess) {
    // Explicit failure handling & recoverable state:
    // Mark authorization and user doc as requiring retry, and log immutable failure audit.
    const failureAudit = {
      actorId: approverId,
      actorRole: approverRole,
      action: txResult.isDemotion ? "FINANCE_ROLE_DEMOTION_AUTH_SYNC_FAILED" : "FINANCE_ROLE_ASSIGNMENT_AUTH_SYNC_FAILED",
      targetType: "users",
      targetId: txResult.targetUid,
      metadata: {
        authorizationId,
        actionType: txResult.actionType,
        targetUid: txResult.targetUid,
        targetRole: txResult.targetRole,
        error: String(authSyncError?.message || authSyncError),
        authSyncRetryRequired: true,
      },
      createdAt: now,
    };

    await Promise.allSettled([
      authRef.update({
        authSyncStatus: "FAILED",
        authSyncRetryRequired: true,
        authSyncError: String(authSyncError?.message || authSyncError),
        updatedAt: now,
      }),
      db.collection("users").doc(txResult.targetUid).update({
        authSyncRetryRequired: true,
        updatedAt: now,
      }),
      db.collection("audit_logs").add(failureAudit),
    ]);

    throw new HttpsError(
      "internal",
      `Database transaction succeeded, but external Auth claims sync or token revocation failed: ${authSyncError?.message || authSyncError}. Security flag authSyncRetryRequired set for recovery.`,
    );
  }

  if (txResult.isRecovery) {
    await Promise.allSettled([
      authRef.update({
        authSyncStatus: "COMPLETED",
        authSyncRetryRequired: false,
        authSyncError: null,
        recoveredAt: now,
        recoveredBy: approverId,
        updatedAt: now,
      }),
      db.collection("users").doc(txResult.targetUid).update({
        authSyncRetryRequired: false,
        updatedAt: now,
      }),
      db.collection("audit_logs").add({
        actorId: approverId,
        actorRole: approverRole,
        action: txResult.isDemotion ? "FINANCE_ROLE_DEMOTION_AUTH_SYNC_RECOVERED" : "FINANCE_ROLE_ASSIGNMENT_AUTH_SYNC_RECOVERED",
        targetType: "users",
        targetId: txResult.targetUid,
        metadata: {
          authorizationId,
          targetUid: txResult.targetUid,
          targetRole: txResult.targetRole,
          recoveryCompleted: true,
        },
        createdAt: now,
      }),
    ]);
  } else {
    await authRef.update({
      authSyncStatus: "COMPLETED",
      authSyncRetryRequired: false,
      updatedAt: now,
    }).catch((err) => console.error("Non-fatal: failed to set authSyncStatus to COMPLETED", err));
  }

  return {
    success: true,
    authorizationId,
    status: "APPROVED",
    targetUid: txResult.targetUid,
    targetRole: txResult.targetRole,
    twoPersonVerified: true,
    message: txResult.isDemotion
      ? "Finance role demotion independently approved and applied."
      : (txResult.isRegrant
        ? "Finance authorization independently re-granted. The account must sign in again with MFA."
        : "Finance role assignment independently approved and granted."),
  };
});

export const adminRejectFinanceRoleAssignment = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const { approverId, approverRole } = await requireIndependentFinanceApprover(request);
  const payload = request.data || {};
  const authorizationId = cleanString(payload.authorizationId);
  const reason = cleanString(payload.reason, "Rejected by independent approver.");
  if (!authorizationId) throw new HttpsError("invalid-argument", "authorizationId is required.");

  const authRef = db.collection("finance_role_authorizations").doc(authorizationId);
  const now = FieldValue.serverTimestamp();

  let expiredAuditPayload: any = null;

  try {
    await db.runTransaction(async (tx) => {
      const authSnap = await tx.get(authRef);
      if (!authSnap.exists) throw new HttpsError("not-found", "Finance role authorization request not found.");

      const authData = authSnap.data() || {};
      if (authData.status !== "PENDING_INDEPENDENT_APPROVAL") {
        throw new HttpsError("failed-precondition", `Request is not pending approval (current status: ${authData.status}).`);
      }
      if (approverId === authData.requesterId) {
        throw new HttpsError("permission-denied", "Segregation of duties violation: requester cannot reject their own request in place of independent review.");
      }

      const expiry = isAuthorizationExpired(authData.createdAt);
      if (expiry.expired) {
        expiredAuditPayload = {
          actorId: approverId,
          actorRole: approverRole,
          action: "FINANCE_ROLE_ASSIGNMENT_EXPIRED_REFUSAL",
          targetType: "finance_role_authorizations",
          targetId: authorizationId,
          metadata: {
            authorizationId,
            actionType: authData.actionType || null,
            targetUid: authData.targetUid || null,
            targetRole: authData.targetRole || null,
            previousRole: authData.previousRole || null,
            createdAt: authData.createdAt ?? null,
            reason: expiry.reason || "AUTHORIZATION_EXPIRED_24H",
            ageMs: typeof expiry.ageMs === "number" ? expiry.ageMs : null,
            attemptedAt: now,
          },
          createdAt: now,
        };
        throw new HttpsError("failed-precondition", "Finance role authorization request has expired (24-hour limit exceeded).");
      }

      tx.update(authRef, {
        status: "REJECTED",
        rejectedBy: approverId,
        rejectedByRole: approverRole,
        rejectionReason: reason,
        rejectedAt: now,
        updatedAt: now,
      });
      tx.create(db.collection("audit_logs").doc(), {
        actorId: approverId,
        actorRole: approverRole,
        action: "FINANCE_ROLE_ASSIGNMENT_REJECTED",
        targetType: "users",
        targetId: authData.targetUid,
        metadata: {
          authorizationId,
          actionType: authData.actionType || null,
          targetUid: authData.targetUid || null,
          targetRole: authData.targetRole || null,
          previousRole: authData.previousRole || null,
          requesterId: authData.requesterId || null,
          approverId,
          decision: "REJECTED",
          reason,
        },
        createdAt: now,
      });
    });
  } catch (txErr: any) {
    if (expiredAuditPayload) {
      await Promise.all([
        db.collection("audit_logs").add(expiredAuditPayload),
        authRef.update({
          status: "EXPIRED",
          expiredAt: now,
          updatedAt: now,
        }),
      ]).catch((auditErr) => console.error("Failed to persist expired refusal audit on rejection", auditErr));
    }
    throw txErr;
  }

  return {
    success: true,
    authorizationId,
    status: "REJECTED",
    reason,
  };
});

export const adminGetFinanceRoleAuthorization = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
  const token = request.auth.token || {};
  if (!hasAdminAccess(token) && !isIndependentFinanceApprover(token)) {
    throw new HttpsError("permission-denied", "Only administrators or finance approvers may evaluate finance role authorizations.");
  }

  const payload = request.data || {};
  const authorizationId = cleanString(payload.authorizationId);
  if (!authorizationId) throw new HttpsError("invalid-argument", "authorizationId is required.");

  const authRef = db.collection("finance_role_authorizations").doc(authorizationId);
  const authSnap = await authRef.get();
  if (!authSnap.exists) throw new HttpsError("not-found", "Finance role authorization request not found.");

  const authData = authSnap.data() || {};
  const expiryCheck = isAuthorizationExpired(authData.createdAt);

  return {
    success: true,
    authorization: {
      ...authData,
      isExpired: expiryCheck.expired,
      expiredReason: expiryCheck.reason || null,
      ageMs: expiryCheck.ageMs || null,
      ttlRemainingMs: expiryCheck.expired ? 0 : Math.max(0, FINANCE_AUTHORIZATION_TTL_MS - (expiryCheck.ageMs || 0)),
    },
  };
});

/**
 * Read-only overview for the Admin "Finance grants" screen. Visible only to an MFA-verified Super Admin,
 * CEO or Finance Controller (the request and approval authorities). It mutates nothing except an audit
 * entry, and every decision still goes through adminRequestFinanceRoleAssignment /
 * adminApproveFinanceRoleAssignment / adminRejectFinanceRoleAssignment, which remain the authority.
 */
export function describeFinanceGrantViewer(liveClaims: Record<string, unknown>) {
  return {
    canRequest: isFinanceTierAssigner(liveClaims),
    canApprove: isIndependentFinanceApprover(liveClaims),
  };
}

export function financeGrantAge(financeAuthorizedAt: unknown, nowMs: number = Date.now()) {
  const grantedMs = parseAuthorizationTimestampMs(financeAuthorizedAt);
  if (grantedMs === null) return { grantedAtMs: null, ageMs: null, expiresAtMs: null, fresh: false };
  const ageMs = nowMs - grantedMs;
  return {
    grantedAtMs: grantedMs,
    ageMs,
    expiresAtMs: grantedMs + FINANCE_AUTHORIZATION_TTL_MS,
    fresh: ageMs >= 0 && ageMs < FINANCE_AUTHORIZATION_TTL_MS,
  };
}

export const adminListFinanceGrantOverview = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
  await requirePrivilegedMfaSession(request.auth);
  const token = request.auth.token || {};
  if (!isFinanceTierAssigner(token) && !isIndependentFinanceApprover(token)) {
    throw new HttpsError("permission-denied", "Only a Super Admin, CEO or Finance Controller can view Finance grants.");
  }
  const viewerRecord = await admin.auth().getUser(request.auth.uid);
  const liveClaims = (viewerRecord.customClaims || {}) as Record<string, unknown>;
  const viewer = describeFinanceGrantViewer(liveClaims);
  if (viewerRecord.disabled || (!viewer.canRequest && !viewer.canApprove)) {
    throw new HttpsError("permission-denied", "Finance grant authority is not active on this account.");
  }
  const viewerUid = request.auth.uid;
  const nowMs = Date.now();

  const [pendingSnap, financeUsersSnap] = await Promise.all([
    db.collection("finance_role_authorizations").where("status", "==", "PENDING_INDEPENDENT_APPROVAL").limit(100).get(),
    db.collection("users").where("role", "in", [...FINANCE_APPROVER_ROLES]).limit(100).get(),
  ]);

  const lookupUids = new Set<string>();
  pendingSnap.docs.forEach((doc) => {
    const data = doc.data() || {};
    if (data.requesterId) lookupUids.add(String(data.requesterId));
    if (data.targetUid) lookupUids.add(String(data.targetUid));
  });
  financeUsersSnap.docs.forEach((doc) => lookupUids.add(doc.id));
  const authByUid = new Map<string, admin.auth.UserRecord>();
  const userStaffNumberMap = new Map<string, number | null>();
  const uidList = [...lookupUids];
  for (let offset = 0; offset < uidList.length; offset += 100) {
    const batchUids = uidList.slice(offset, offset + 100);
    const [result, userDocs] = await Promise.all([
      admin.auth().getUsers(batchUids.map((uid) => ({ uid }))),
      Promise.all(batchUids.map((uid) => db.collection("users").doc(uid).get())),
    ]);
    result.users.forEach((user) => authByUid.set(user.uid, user));
    userDocs.forEach((docSnap) => {
      if (docSnap.exists) {
        const sNum = docSnap.data()?.staffNumber;
        userStaffNumberMap.set(docSnap.id, typeof sNum === "number" ? sNum : null);
      }
    });
  }

  const pendingRegrantTargets = new Set<string>();
  const pending = pendingSnap.docs.map((doc) => {
    const data = doc.data() || {};
    const createdAtMs = parseAuthorizationTimestampMs(data.createdAt);
    const expiry = isAuthorizationExpired(data.createdAt, nowMs);
    const targetUid = cleanString(data.targetUid);
    const requesterId = cleanString(data.requesterId);
    const actionType = cleanString(data.actionType, "PROMOTE_STAFF");
    if (actionType === FINANCE_REGRANT_ACTION && !expiry.expired) pendingRegrantTargets.add(targetUid);
    const viewerIsRequester = viewerUid === requesterId;
    const viewerIsTarget = viewerUid === targetUid;
    const targetStaffNumber = data.targetStaffNumber || userStaffNumberMap.get(targetUid) || null;
    const requesterStaffNumber = data.requesterStaffNumber || userStaffNumberMap.get(requesterId) || null;
    return {
      authorizationId: doc.id,
      actionType,
      targetUid,
      targetStaffNumber,
      targetEmail: cleanString(authByUid.get(targetUid)?.email || data.targetEmail),
      targetDisplayName: cleanString(authByUid.get(targetUid)?.displayName),
      targetRole: cleanString(data.targetRole),
      previousRole: cleanString(data.previousRole),
      requesterId,
      requesterStaffNumber,
      requesterEmail: cleanString(authByUid.get(requesterId)?.email),
      requesterRole: cleanString(data.requesterRole),
      createdAtMs,
      expiresAtMs: createdAtMs === null ? null : createdAtMs + FINANCE_AUTHORIZATION_TTL_MS,
      isExpired: expiry.expired,
      viewerIsRequester,
      viewerIsTarget,
      viewerCanApprove: viewer.canApprove && !viewerIsRequester && !viewerIsTarget && !expiry.expired,
      viewerCanReject: viewer.canApprove && !viewerIsRequester && !expiry.expired,
    };
  }).sort((left, right) => (left.createdAtMs || 0) - (right.createdAtMs || 0));

  const financeAccounts = financeUsersSnap.docs.map((doc) => {
    const data = doc.data() || {};
    const record = authByUid.get(doc.id);
    const claims = (record?.customClaims || {}) as Record<string, unknown>;
    const role = cleanString(data.role).toLowerCase();
    const claimRole = cleanString(claims.role || claims.userRole || claims.primaryRole).toLowerCase();
    const grant = financeGrantAge(claims.financeAuthorizedAt, nowMs);
    const explicitClaim = claimRole === role && claims[role] === true;
    const active = Boolean(record) && record?.disabled !== true && claims.suspended !== true && data.suspended !== true;
    const staffNumber = data.staffNumber || userStaffNumberMap.get(doc.id) || null;
    return {
      uid: doc.id,
      staffNumber,
      email: cleanString(record?.email || data.email),
      displayName: cleanString(record?.displayName || data.displayName || data.fullName),
      role,
      status: cleanString(data.status),
      active,
      explicitClaim,
      totpEnrolled: (record?.multiFactor?.enrolledFactors || []).some((factor) => factor.factorId === "totp"),
      financeApprovalPending: claims.financeApprovalPending === true,
      grantedAtMs: grant.grantedAtMs,
      grantAgeMs: grant.ageMs,
      grantExpiresAtMs: grant.expiresAtMs,
      grantFresh: grant.fresh && explicitClaim && active,
      pendingRegrant: pendingRegrantTargets.has(doc.id),
      viewerIsTarget: doc.id === viewerUid,
      viewerCanRequestRegrant: viewer.canRequest && doc.id !== viewerUid && active && explicitClaim && !pendingRegrantTargets.has(doc.id),
    };
  }).sort((left, right) => `${left.role}|${left.email}`.localeCompare(`${right.role}|${right.email}`));

  await db.collection("audit_logs").add({
    action: "FINANCE_GRANT_OVERVIEW_VIEWED",
    actorId: viewerUid,
    actorRole: cleanString(liveClaims.role || liveClaims.userRole || liveClaims.primaryRole),
    targetType: "finance_role_authorizations",
    targetId: "overview",
    pendingCount: pending.length,
    financeAccountCount: financeAccounts.length,
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    success: true,
    nowMs,
    ttlMs: FINANCE_AUTHORIZATION_TTL_MS,
    viewer: {
      uid: viewerUid,
      role: cleanString(liveClaims.role || liveClaims.userRole || liveClaims.primaryRole),
      canRequest: viewer.canRequest,
      canApprove: viewer.canApprove,
    },
    pending,
    financeAccounts,
  };
});

export const adminSetStaffStatus = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const { actorId, actorRole } = await requireProvisioningAdmin(request);
  const payload = request.data || {};
  const uid = cleanString(payload.uid);
  if (uid && uid === actorId) {
    throw new HttpsError("permission-denied", "Self-modification prohibited: an administrator cannot modify their own operational status.");
  }
  const requestedStatus = cleanString(payload.status).toUpperCase();
  if (!["ACTIVE", "SUSPENDED"].includes(requestedStatus)) throw new HttpsError("invalid-argument", "status must be ACTIVE or SUSPENDED.");

  const { authUser, userSnap, accessSnap, currentRole } = await loadExistingStaff(uid);
  if (requestedStatus === "ACTIVE" && FINANCE_TIER_ROLES.has(currentRole)) await requireFinanceTierAssigner(request);
  const isFinanceApproverReactivation = requestedStatus === "ACTIVE" && FINANCE_APPROVER_ROLES.has(currentRole);
  const authorizationId = cleanString(payload.authorizationId);
  if (isFinanceApproverReactivation) {
    if (!authorizationId) {
      throw new HttpsError(
        "failed-precondition",
        "Two-person authorization required: reactivating a suspended Finance approver requires independent second-person approval. Provide the approved authorizationId.",
      );
    }
    const authSnap = await db.collection("finance_role_authorizations").doc(authorizationId).get();
    if (!authSnap.exists) {
      throw new HttpsError("not-found", "Finance role authorization request not found.");
    }
    const authData = authSnap.data() || {};
    if (authData.status !== "APPROVED" || authData.consumed === true) {
      throw new HttpsError("failed-precondition", "Finance role authorization is not approved or has already been used.");
    }
    const expiry = isAuthorizationExpired(authData.createdAt);
    if (expiry.expired) {
      throw new HttpsError("failed-precondition", "Finance role authorization request has expired (24-hour limit exceeded).");
    }
    if (authData.targetUid !== uid) {
      throw new HttpsError("failed-precondition", "Finance role authorization does not match the target user.");
    }
    if (authData.approverId === actorId || authData.requesterId === authData.approverId) {
      throw new HttpsError("permission-denied", "Segregation of duties: requester cannot apply their own unverified approval.");
    }
  }
  if (requestedStatus === "ACTIVE" && userSnap.data()?.onboardingComplete !== true) {
    throw new HttpsError("failed-precondition", "Complete canonical HR onboarding before activating staff access.");
  }
  const modules = normalizeModules(currentRole, userSnap.data()?.staffModules || accessSnap.data()?.modules || []);
  const permissions = permissionsForModules(modules);
  const suspended = requestedStatus === "SUSPENDED";
  const previousClaims = authUser.customClaims || {};
  const previousDisabled = authUser.disabled;
  const now = FieldValue.serverTimestamp();

  try {
    await admin.auth().updateUser(uid, { disabled: suspended });
    await admin.auth().setCustomUserClaims(uid, claimsForAccess(currentRole, modules, permissions, suspended));
    await admin.auth().revokeRefreshTokens(uid);
    await db.runTransaction(async (tx) => {
      tx.update(db.collection("users").doc(uid), { status: requestedStatus, suspended, updatedAt: now, ...(suspended ? { suspendedAt: now, suspendedBy: actorId } : { restoredAt: now, restoredBy: actorId }) });
      tx.update(db.collection("staffAccess").doc(uid), { active: !suspended, suspended, status: requestedStatus, updatedAt: now, updatedBy: actorId });
      tx.update(db.collection("hrProfiles").doc(uid), { status: requestedStatus, suspended, updatedAt: now });
      if (currentRole === "technician") tx.update(db.collection("technicians").doc(uid), { status: requestedStatus, suspended, available: suspended ? false : true, onDuty: false, updatedAt: now });
      if (isFinanceApproverReactivation && authorizationId) {
        const txAuthSnap = await tx.get(db.collection("finance_role_authorizations").doc(authorizationId));
        if (!txAuthSnap.exists) throw new HttpsError("not-found", "Finance role authorization request not found.");
        const txAuthData = txAuthSnap.data() || {};
        if (txAuthData.status !== "APPROVED" || txAuthData.consumed === true) {
          throw new HttpsError("failed-precondition", "Finance role authorization is no longer valid or has already been used.");
        }
        if (isAuthorizationExpired(txAuthData.createdAt).expired) {
          throw new HttpsError("failed-precondition", "Finance role authorization request has expired (24-hour limit exceeded).");
        }
        tx.update(db.collection("finance_role_authorizations").doc(authorizationId), {
          consumed: true,
          consumedAt: now,
          consumedBy: actorId,
        });
      }
      tx.create(db.collection("audit_logs").doc(), {
        actorId, actorRole, action: suspended ? "ADMIN_SUSPEND_STAFF_USER" : "ADMIN_RESTORE_STAFF_USER",
        targetType: "users", targetId: uid, metadata: {
          role: currentRole, refreshTokensRevoked: true, onboardingComplete: userSnap.data()?.onboardingComplete === true,
          ...(authorizationId ? { authorizationId, twoPersonVerified: true } : {}),
        }, createdAt: now,
      });
    });
    return { success: true, uid, status: requestedStatus, refreshTokensRevoked: true };
  } catch (error: any) {
    await Promise.all([admin.auth().updateUser(uid, { disabled: previousDisabled }), admin.auth().setCustomUserClaims(uid, previousClaims)])
      .catch((rollbackError) => console.error("Failed to restore staff Auth state after status update failure", { uid, rollbackError }));
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", `Unable to update staff status safely: ${error?.message || error}`);
  }
});

export const adminBackfillStaffNumbers = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const { actorId, actorRole } = await requireProvisioningAdmin(request);
  const staffRoleValues = Array.from(STAFF_ROLES);
  const [usersSnap, roleSnap] = await Promise.all([
    db.collection("users").where("isStaff", "==", true).get(),
    db.collection("users").where("role", "in", staffRoleValues.slice(0, 30)).get(),
  ]);

  const candidateMap = new Map<string, FirebaseFirestore.DocumentData>();
  usersSnap.docs.forEach((doc) => candidateMap.set(doc.id, doc.data()));
  roleSnap.docs.forEach((doc) => candidateMap.set(doc.id, doc.data()));

  const unassigned = Array.from(candidateMap.entries())
    .filter(([_, data]) => data.staffNumber === undefined || data.staffNumber === null || data.staffNumber === "")
    .map(([id, data]) => ({ id, data }))
    .sort((a, b) => {
      const aTime = a.data.createdAt?.toMillis?.() || (typeof a.data.createdAt === "number" ? a.data.createdAt : 0);
      const bTime = b.data.createdAt?.toMillis?.() || (typeof b.data.createdAt === "number" ? b.data.createdAt : 0);
      return aTime - bTime || a.id.localeCompare(b.id);
    });

  if (unassigned.length === 0) {
    return { success: true, backfilledCount: 0, message: "All staff accounts already have staff numbers." };
  }

  const now = FieldValue.serverTimestamp();
  const counterRef = db.collection("system_counters").doc(STAFF_NUMBER_COUNTER_DOC);
  const assignedRecords: Array<{ uid: string; staffNumber: number }> = [];

  await db.runTransaction(async (tx) => {
    const counterSnap = await tx.get(counterRef);
    let nextNumber = STAFF_NUMBER_START;
    if (counterSnap.exists) {
      const rawCurrent = counterSnap.data()?.nextStaffNumber ?? counterSnap.data()?.current;
      const parsed = Number(rawCurrent);
      if (Number.isInteger(parsed) && parsed >= STAFF_NUMBER_START) {
        nextNumber = parsed;
      }
    }

    const verifiedCandidates: Array<{ uid: string; hasTechDoc: boolean }> = [];
    for (const item of unassigned) {
      const userDoc = await tx.get(db.collection("users").doc(item.id));
      if (userDoc.exists) {
        const uData = userDoc.data();
        if (uData?.staffNumber === undefined || uData?.staffNumber === null || uData?.staffNumber === "") {
          const techDoc = await tx.get(db.collection("technicians").doc(item.id));
          verifiedCandidates.push({ uid: item.id, hasTechDoc: techDoc.exists });
        }
      }
    }

    let currentNumber = nextNumber;
    for (const { uid, hasTechDoc } of verifiedCandidates) {
      const assigned = currentNumber++;
      tx.update(db.collection("users").doc(uid), {
        staffNumber: assigned,
        staffNumberStr: String(assigned),
        updatedAt: now,
      });
      tx.set(db.collection("staffAccess").doc(uid), {
        staffNumber: assigned,
        staffNumberStr: String(assigned),
        updatedAt: now,
      }, { merge: true });
      if (hasTechDoc) {
        tx.set(db.collection("technicians").doc(uid), {
          staffNumber: assigned,
          staffNumberStr: String(assigned),
          updatedAt: now,
        }, { merge: true });
      }
      assignedRecords.push({ uid, staffNumber: assigned });
    }

    tx.set(counterRef, {
      current: currentNumber - 1,
      nextStaffNumber: currentNumber,
      lastAssignedStaffNumber: currentNumber - 1,
      updatedAt: now,
    }, { merge: true });

    tx.create(db.collection("audit_logs").doc(), {
      actorId,
      actorRole,
      action: "ADMIN_BACKFILL_STAFF_NUMBERS",
      targetType: "system_counters",
      targetId: STAFF_NUMBER_COUNTER_DOC,
      metadata: {
        count: assignedRecords.length,
        startNumber: nextNumber,
        endNumber: currentNumber - 1,
        assignedUids: assignedRecords.map((r) => r.uid),
      },
      createdAt: now,
    });
  });

  return {
    success: true,
    backfilledCount: assignedRecords.length,
    startNumber: assignedRecords[0]?.staffNumber ?? null,
    endNumber: assignedRecords[assignedRecords.length - 1]?.staffNumber ?? null,
    assigned: assignedRecords,
  };
});

// Fail-safe only: direct Firestore edits may suspend an account, but they may
// never grant or change role/module claims. Access changes must use the callable.
export const syncStaffCustomClaims = onDocumentUpdated("users/{userId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!after || after.isStaff !== true) return;
  const beforeStatus = cleanString(before?.status).toUpperCase();
  const afterStatus = cleanString(after?.status).toUpperCase();
  if (beforeStatus === afterStatus || afterStatus !== "SUSPENDED") return;

  const uid = event.params.userId;
  try {
    const authUser = await admin.auth().getUser(uid);
    await admin.auth().updateUser(uid, { disabled: true });
    await admin.auth().setCustomUserClaims(uid, { ...(authUser.customClaims || {}), suspended: true });
    await admin.auth().revokeRefreshTokens(uid);
  } catch (error: any) {
    if (error?.code !== "auth/user-not-found") console.error(`Failed to enforce suspension for ${uid}`, error);
  }
});

