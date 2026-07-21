import { createHash, randomBytes } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

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
]);

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
  finance_admin: ["dashboard", "financials", "transactions", "reports", "audit"],
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
  if (!request.auth) throw new HttpsError("unauthenticated", "Admin session required.");
  const actorToken = request.auth.token || {};
  if (!hasAdminAccess(actorToken)) {
    throw new HttpsError("permission-denied", "Only an authorized Founder or Admin can manage staff access.");
  }
  const actorRecord = await admin.auth().getUser(request.auth.uid);
  if (actorRecord.disabled) {
    throw new HttpsError("permission-denied", "Disabled administrators cannot manage staff access.");
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
    "Do not share your password, verification links, SMS codes, or device access.",
    "",
    "مرحباً، تم إنشاء حسابك في BIN GROUP. يرجى تأكيد البريد الإلكتروني، تعيين كلمة مرور خاصة، ثم تسجيل الدخول من الرابط الرسمي أعلاه.",
  ].join("\n");

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:640px;margin:0 auto;padding:24px">
      <div style="background:#020617;color:#d4af37;padding:20px 24px;border-radius:16px 16px 0 0"><h1 style="margin:0;font-size:24px">BIN GROUP</h1><p style="margin:4px 0 0;color:#cbd5e1">Secure account invitation</p></div>
      <div style="border:1px solid #e5e7eb;border-top:0;padding:24px;border-radius:0 0 16px 16px">
        <p>Hello <strong>${safeName}</strong>,</p><p>A <strong>${safeRole}</strong> account has been created for <strong>${safeEmail}</strong>.</p>
        <ol><li style="margin-bottom:16px"><a href="${safeVerificationLink}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Verify email address</a></li><li style="margin-bottom:16px"><a href="${safePasswordResetLink}" style="display:inline-block;background:#d4af37;color:#111827;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Set private password</a></li><li><a href="${safeLoginUrl}" style="font-weight:700">Open the ${escapeHtml(portalName)}</a></li></ol>
        <p style="margin-top:24px;padding:12px;background:#f8fafc;border-radius:8px"><strong>Security:</strong> Never share passwords, verification links, SMS codes, or device access.</p><hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0" /><p dir="rtl" style="text-align:right">مرحباً <strong>${safeName}</strong>، تم إنشاء حسابك في BIN GROUP. يرجى تأكيد البريد الإلكتروني، تعيين كلمة مرور خاصة، ثم تسجيل الدخول من الرابط الرسمي أعلاه.</p>
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

async function loadExistingStaff(uid: string) {
  if (!uid) throw new HttpsError("invalid-argument", "Staff UID is required.");
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
  return { authUser, userSnap, accessSnap, currentRole };
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
  await assertNoExistingIdentity(email);
  const authUser = await admin.auth().createUser({ email, displayName, password: generatedBootstrapPassword(), emailVerified: false, disabled: false });
  const uid = authUser.uid;
  const now = FieldValue.serverTimestamp();

  try {
    await admin.auth().setCustomUserClaims(uid, claimsForAccess(role, modules, permissions, false));
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
      status: "ACTIVE", isStaff: true, isAdmin: false, staffModules: modules, modules, permissions,
      onboardingComplete: true, createdAt: now, updatedAt: now, createdBy: actorId,
      provisionedBy: actorId, provisionedVia: "adminCreateUser",
    };
    const scheduleProfile = {
      uid, displayName, role, employeeType: role, department, specialization, status: "ACTIVE",
      joiningDate: cleanString(payload.joiningDate) || null, offDay: cleanString(payload.offDay, "Sunday"),
      shiftName: cleanString(payload.shiftName, "Day Shift"), workingHours: cleanString(payload.workingHours, "9 AM - 4 PM"),
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

    await db.runTransaction(async (tx) => {
      tx.create(db.collection("users").doc(uid), operationalProfile);
      tx.create(db.collection("staffAccess").doc(uid), { uid, role, active: true, modules, staffModules: modules, permissions, grantedAt: now, grantedBy: actorId, updatedAt: now });
      tx.create(db.collection("hrProfiles").doc(uid), scheduleProfile);
      tx.create(db.collection("private_hr_profiles").doc(uid), privateHrProfile);
      if (role === "technician") {
        tx.create(db.collection("technicians").doc(uid), {
          ...operationalProfile, available: true, onDuty: false, currentJobCount: 0,
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
        metadata: { emailHash: hashValue(email), role, modules, permissionKeys: Object.keys(permissions).sort(), invitationQueued: true, invitationMailId: invitationRef.id, privateHrSeparated: true },
        createdAt: now,
      });
    });

    return { success: true, uid, role, modules, invitationQueued: true, message: "Staff account created. Secure email verification and private password setup were queued." };
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
  const role = cleanString(payload.role).toLowerCase();
  const { authUser, currentRole } = await loadExistingStaff(uid);
  if ((currentRole === "technician") !== (role === "technician")) {
    throw new HttpsError("failed-precondition", "Technician identities cannot be converted to or from Admin-portal staff roles.");
  }
  const { modules, permissions } = canonicalAccess(role, payload);
  const previousClaims = authUser.customClaims || {};
  const previousDisabled = authUser.disabled;
  const now = FieldValue.serverTimestamp();

  try {
    await admin.auth().setCustomUserClaims(uid, claimsForAccess(role, modules, permissions, false));
    await db.runTransaction(async (tx) => {
      tx.update(db.collection("users").doc(uid), { role, userRole: role, primaryRole: role, staffModules: modules, modules, permissions, updatedAt: now });
      tx.update(db.collection("staffAccess").doc(uid), { role, modules, staffModules: modules, permissions, active: true, updatedAt: now, updatedBy: actorId });
      tx.update(db.collection("hrProfiles").doc(uid), { role, employeeType: role, updatedAt: now });
      if (role === "technician") tx.update(db.collection("technicians").doc(uid), { role, userRole: role, primaryRole: role, staffModules: modules, modules, permissions, updatedAt: now });
      tx.create(db.collection("audit_logs").doc(), {
        actorId, actorRole, action: "ADMIN_UPDATE_STAFF_ACCESS", targetType: "users", targetId: uid,
        metadata: { previousRole: currentRole, role, modules, permissionKeys: Object.keys(permissions).sort() }, createdAt: now,
      });
    });
    await admin.auth().revokeRefreshTokens(uid);
    return { success: true, uid, role, modules, tokenRefreshRequired: true };
  } catch (error: any) {
    await Promise.all([admin.auth().setCustomUserClaims(uid, previousClaims), admin.auth().updateUser(uid, { disabled: previousDisabled })])
      .catch((rollbackError) => console.error("Failed to restore staff Auth state after access update failure", { uid, rollbackError }));
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", `Unable to update staff access safely: ${error?.message || error}`);
  }
});

export const adminSetStaffStatus = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const { actorId, actorRole } = await requireProvisioningAdmin(request);
  const payload = request.data || {};
  const uid = cleanString(payload.uid);
  const requestedStatus = cleanString(payload.status).toUpperCase();
  if (!["ACTIVE", "SUSPENDED"].includes(requestedStatus)) throw new HttpsError("invalid-argument", "status must be ACTIVE or SUSPENDED.");

  const { authUser, userSnap, accessSnap, currentRole } = await loadExistingStaff(uid);
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
      tx.update(db.collection("staffAccess").doc(uid), { active: !suspended, status: requestedStatus, updatedAt: now, updatedBy: actorId });
      tx.update(db.collection("hrProfiles").doc(uid), { status: requestedStatus, updatedAt: now });
      if (currentRole === "technician") tx.update(db.collection("technicians").doc(uid), { status: requestedStatus, suspended, available: suspended ? false : true, onDuty: false, updatedAt: now });
      tx.create(db.collection("audit_logs").doc(), {
        actorId, actorRole, action: suspended ? "ADMIN_SUSPEND_STAFF_USER" : "ADMIN_RESTORE_STAFF_USER",
        targetType: "users", targetId: uid, metadata: { role: currentRole, refreshTokensRevoked: true }, createdAt: now,
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
