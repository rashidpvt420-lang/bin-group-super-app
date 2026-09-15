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
const TECHNICIAN_PROFILE_REPAIR_CONFIRMATION = "REPAIR_INCOMPLETE_TECHNICIAN_PROFILE_BIN_GROUP";
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
  const currentStatus = cleanString(userSnap.data()?.status).toUpperCase();
  if (currentStatus === "OFFBOARDED" || claims.offboarded === true || userSnap.data()?.offboarded === true) {
    throw new HttpsError("failed-precondition", "OFFBOARDED is terminal. Create a new staff identity through the approved provisioning lifecycle instead of restoring this account.");
  }
  return { authUser, userSnap, accessSnap, currentRole };
}

function hasPrivilegedTargetClaims(claims: any) {
  const role = cleanString(claims?.role || claims?.userRole || claims?.primaryRole).toLowerCase();
  return PRIVILEGED_ADMIN_ROLES.has(role) || claims?.admin === true || claims?.isAdmin === true ||
    claims?.superAdmin === true || claims?.super_admin === true || claims?.ceo === true;
}

function assertTechnicianOnlyRoles(label: string, values: unknown[]) {
  const roles = values.map((value) => cleanString(value).toLowerCase()).filter(Boolean);
  if (roles.some((role) => role !== "technician")) {
    throw new HttpsError("failed-precondition", `${label} contains a non-Technician role and cannot be repaired here.`);
  }
  return roles;
}

function hasGrantedPermissions(value: unknown) {
  return Boolean(value && typeof value === "object" && Object.values(value as Record<string, unknown>).some((entry) => entry === true));
}

function technicianRepairAssessment(authUser: admin.auth.UserRecord, snapshots: {
  userSnap: any;
  accessSnap: any;
  hrSnap: any;
  privateSnap: any;
  technicianSnap: any;
  duplicateSnap: any;
}) {
  const { userSnap, accessSnap, hrSnap, privateSnap, technicianSnap, duplicateSnap } = snapshots;
  if (!userSnap.exists) throw new HttpsError("not-found", "The existing Technician user profile was not found.");

  const user = userSnap.data() || {};
  const access = accessSnap.data() || {};
  const hr = hrSnap.data() || {};
  const privateHr = privateSnap.data() || {};
  const technician = technicianSnap.data() || {};
  const claims = authUser.customClaims || {};
  const uid = authUser.uid;
  const email = normalizeEmail(authUser.email);

  if (!email) throw new HttpsError("failed-precondition", "The existing Technician Auth identity has no email address.");
  if (authUser.disabled) throw new HttpsError("failed-precondition", "Disabled Auth identities require a separate controlled recovery.");
  if (authUser.emailVerified) throw new HttpsError("failed-precondition", "Verified Technician identities must use the normal HR lifecycle, not invitation repair.");
  if (hasPrivilegedTargetClaims(claims) || user.isAdmin === true || technician.isAdmin === true) {
    throw new HttpsError("permission-denied", "Privileged identities can never enter the Technician profile-repair path.");
  }

  const claimRoles = assertTechnicianOnlyRoles("Firebase Auth claims", [claims.role, claims.userRole, claims.primaryRole]);
  if (claimRoles.length === 0 || claims.technician !== true || (claims.staff !== true && claims.isStaff !== true)) {
    throw new HttpsError("failed-precondition", "The existing Auth claims do not prove a canonical Technician identity.");
  }
  if (claims.suspended !== true) {
    throw new HttpsError("failed-precondition", "The invited Technician Auth claims are not safely suspended.");
  }

  const profileRoles = assertTechnicianOnlyRoles("Firestore profiles", [
    user.role, user.userRole, user.primaryRole,
    access.role,
    hr.role, hr.employeeType,
    technician.role, technician.userRole, technician.primaryRole,
  ]);
  if (cleanString(user.role).toLowerCase() !== "technician" || profileRoles.length === 0) {
    throw new HttpsError("failed-precondition", "The canonical user profile is not a Technician.");
  }

  const profileEmails = [user.email, technician.email].map(normalizeEmail).filter(Boolean);
  if (profileEmails.some((candidate) => candidate !== email)) {
    throw new HttpsError("failed-precondition", "The Technician profile email conflicts with the preserved Auth identity.");
  }
  const duplicateIds = duplicateSnap.docs.map((doc: any) => doc.id).filter((id: string) => id !== uid);
  if (duplicateIds.length > 0) {
    throw new HttpsError("failed-precondition", "A duplicate Firestore profile already uses the Technician Auth email.");
  }

  const status = cleanString(user.status).toUpperCase();
  if (status !== "INVITED") {
    throw new HttpsError("failed-precondition", "Only an unverified INVITED Technician can use this repair.");
  }
  if (user.onboardingComplete === true || access.active === true || technician.available === true || technician.onDuty === true) {
    throw new HttpsError("failed-precondition", "An active or operational Technician cannot use invitation-profile repair.");
  }
  const checklist = user.onboardingChecklist || {};
  if (checklist.profileComplete === true || checklist.documentsComplete === true || checklist.contractComplete === true ||
      checklist.deviceReady === true || checklist.activationApproved === true) {
    throw new HttpsError("failed-precondition", "A progressed onboarding checklist cannot be reset by invitation-profile repair.");
  }

  const moduleSets = [user.modules, user.staffModules, access.modules, access.staffModules, technician.modules, technician.staffModules];
  if (moduleSets.some((value) => Array.isArray(value) && value.length > 0) ||
      [user.permissions, access.permissions, technician.permissions].some(hasGrantedPermissions)) {
    throw new HttpsError("failed-precondition", "The Technician has unexpected Admin modules or permissions.");
  }

  const emailHash = hashValue(email);
  if (privateSnap.exists && privateHr.emailHash && privateHr.emailHash !== emailHash) {
    throw new HttpsError("failed-precondition", "The private HR profile belongs to a different email hash.");
  }

  const missingComponents: string[] = [];
  if (user.uid !== uid) missingComponents.push("users.uid");
  if (normalizeEmail(user.email) !== email) missingComponents.push("users.email");
  if (user.isStaff !== true) missingComponents.push("users.isStaff");
  if (user.isAdmin !== false) missingComponents.push("users.isAdmin");
  if (user.suspended !== true) missingComponents.push("users.suspended");
  if (cleanString(user.onboardingStage).toUpperCase() !== "INVITED") missingComponents.push("users.onboardingStage");
  if (user.onboardingComplete !== false) missingComponents.push("users.onboardingComplete");
  if (!accessSnap.exists) missingComponents.push("staffAccess");
  if (!hrSnap.exists) missingComponents.push("hrProfiles");
  if (!privateSnap.exists) missingComponents.push("private_hr_profiles");
  if (!technicianSnap.exists) missingComponents.push("technicians");
  if (accessSnap.exists && (access.uid !== uid || access.active !== false || access.suspended !== true || cleanString(access.status).toUpperCase() !== "INVITED")) {
    missingComponents.push("staffAccess.lifecycle");
  }
  if (hrSnap.exists && (hr.uid !== uid || cleanString(hr.status).toUpperCase() !== "INVITED" || hr.onboardingComplete !== false)) {
    missingComponents.push("hrProfiles.lifecycle");
  }
  if (privateSnap.exists && (privateHr.uid !== uid || privateHr.emailHash !== emailHash || privateHr.accessClassification !== "PRIVATE_HR_SERVER_ONLY")) {
    missingComponents.push("private_hr_profiles.contract");
  }
  if (technicianSnap.exists && (technician.uid !== uid || technician.isStaff !== true || technician.suspended !== true || cleanString(technician.status).toUpperCase() !== "INVITED")) {
    missingComponents.push("technicians.lifecycle");
  }

  return {
    uid,
    email,
    emailHash,
    displayName: cleanString(user.displayName || user.fullName || authUser.displayName, "Technician"),
    phoneNumber: cleanString(user.phoneNumber || user.phone || technician.phoneNumber || technician.phone),
    department: cleanString(user.department || hr.department || technician.department, "Technical"),
    specialization: cleanString(user.specialization || user.trade || hr.specialization || technician.specialization || technician.trade, "General Maintenance"),
    invitationStatus: cleanString(user.invitationStatus, "QUEUED").toUpperCase(),
    missingComponents: [...new Set(missingComponents)].sort(),
    repairRequired: missingComponents.length > 0,
    user,
    access,
    hr,
    privateHr,
    technician,
  };
}

export const adminRepairIncompleteTechnicianProfile = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const { actorId, actorRole } = await requireProvisioningAdmin(request);
  const payload = request.data || {};
  const uid = cleanString(payload.uid);
  const execute = payload.execute === true;
  const confirmation = cleanString(payload.confirmation);

  if (!uid) throw new HttpsError("invalid-argument", "Technician UID is required.");
  if (payload.email !== undefined || payload.role !== undefined || payload.claims !== undefined || payload.password !== undefined) {
    throw new HttpsError("invalid-argument", "Technician identity, role and claims are server-derived and cannot be supplied by the client.");
  }
  if (execute && confirmation !== TECHNICIAN_PROFILE_REPAIR_CONFIRMATION) {
    throw new HttpsError("failed-precondition", "The exact protected Technician profile-repair confirmation is required.");
  }

  const authUser = await admin.auth().getUser(uid);
  const userRef = db.collection("users").doc(uid);
  const accessRef = db.collection("staffAccess").doc(uid);
  const hrRef = db.collection("hrProfiles").doc(uid);
  const privateRef = db.collection("private_hr_profiles").doc(uid);
  const technicianRef = db.collection("technicians").doc(uid);
  const duplicateQuery = db.collection("users").where("email", "==", normalizeEmail(authUser.email)).limit(2);

  if (!execute) {
    const [userSnap, accessSnap, hrSnap, privateSnap, technicianSnap, duplicateSnap] = await Promise.all([
      userRef.get(), accessRef.get(), hrRef.get(), privateRef.get(), technicianRef.get(), duplicateQuery.get(),
    ]);
    const assessment = technicianRepairAssessment(authUser, { userSnap, accessSnap, hrSnap, privateSnap, technicianSnap, duplicateSnap });
    return {
      success: true,
      execute: false,
      uid,
      role: "technician",
      repairRequired: assessment.repairRequired,
      missingComponents: assessment.missingComponents,
      authUidPreserved: true,
      authClaimsPreserved: true,
      invitationQueued: false,
    };
  }

  const outcome = await db.runTransaction(async (tx) => {
    const [userSnap, accessSnap, hrSnap, privateSnap, technicianSnap, duplicateSnap] = await Promise.all([
      tx.get(userRef), tx.get(accessRef), tx.get(hrRef), tx.get(privateRef), tx.get(technicianRef), tx.get(duplicateQuery),
    ]);
    const assessment = technicianRepairAssessment(authUser, { userSnap, accessSnap, hrSnap, privateSnap, technicianSnap, duplicateSnap });
    if (!assessment.repairRequired) {
      return { repaired: false, missingComponents: [] as string[] };
    }

    const now = FieldValue.serverTimestamp();
    const onboardingChecklist = {
      profileComplete: false,
      documentsComplete: false,
      contractComplete: false,
      deviceReady: false,
      activationApproved: false,
    };
    const salaryPackage = assessment.privateHr.salaryPackage || {
      basicSalary: 0,
      housingAllowance: 0,
      transportAllowance: 0,
      foodAllowance: 0,
      otherAllowance: 0,
      salaryPaymentDay: 1,
      salaryGrade: null,
      overtimeEligible: true,
      companyAccommodationProvided: false,
      companyTransportProvided: false,
      companyMedicalInsuranceProvided: true,
    };

    tx.set(userRef, {
      uid,
      email: assessment.email,
      displayName: assessment.displayName,
      fullName: assessment.displayName,
      phoneNumber: assessment.phoneNumber,
      phone: assessment.phoneNumber,
      role: "technician",
      userRole: "technician",
      primaryRole: "technician",
      department: assessment.department,
      specialization: assessment.specialization,
      trade: assessment.specialization,
      status: "INVITED",
      suspended: true,
      isStaff: true,
      isAdmin: false,
      staffModules: [],
      modules: [],
      permissions: {},
      onboardingStage: "INVITED",
      onboardingChecklist,
      onboardingComplete: false,
      invitationStatus: assessment.invitationStatus,
      profileRepairVersion: "technician-invitation-v1",
      profileRepairedAt: now,
      profileRepairedBy: actorId,
      updatedAt: now,
    }, { merge: true });
    tx.set(accessRef, {
      uid,
      role: "technician",
      active: false,
      suspended: true,
      status: "INVITED",
      onboardingStage: "INVITED",
      modules: [],
      staffModules: [],
      permissions: {},
      updatedAt: now,
      updatedBy: actorId,
      ...(!accessSnap.exists ? { grantedAt: now, grantedBy: actorId } : {}),
    }, { merge: true });
    tx.set(hrRef, {
      uid,
      displayName: assessment.displayName,
      role: "technician",
      employeeType: "technician",
      department: assessment.department,
      specialization: assessment.specialization,
      status: "INVITED",
      suspended: true,
      onboardingStage: "INVITED",
      onboardingComplete: false,
      employmentType: assessment.hr.employmentType || "full_time",
      shiftName: assessment.hr.shiftName || "Day Shift",
      workingHours: assessment.hr.workingHours || "9 AM - 4 PM",
      offDay: assessment.hr.offDay || "Sunday",
      updatedAt: now,
      ...(!hrSnap.exists ? { createdAt: now } : {}),
    }, { merge: true });
    tx.set(privateRef, {
      uid,
      emailHash: assessment.emailHash,
      employeeId: assessment.privateHr.employeeId || null,
      emiratesId: assessment.privateHr.emiratesId || null,
      joiningDate: assessment.privateHr.joiningDate || assessment.hr.joiningDate || null,
      contractEndDate: assessment.privateHr.contractEndDate || null,
      employmentType: assessment.privateHr.employmentType || assessment.hr.employmentType || "full_time",
      salaryPackage,
      accessClassification: "PRIVATE_HR_SERVER_ONLY",
      updatedAt: now,
      ...(!privateSnap.exists ? { createdAt: now, createdBy: actorId } : {}),
    }, { merge: true });
    tx.set(technicianRef, {
      uid,
      email: assessment.email,
      displayName: assessment.displayName,
      fullName: assessment.displayName,
      phoneNumber: assessment.phoneNumber,
      phone: assessment.phoneNumber,
      role: "technician",
      userRole: "technician",
      primaryRole: "technician",
      department: assessment.department,
      specialization: assessment.specialization,
      trade: assessment.specialization,
      status: "INVITED",
      suspended: true,
      isStaff: true,
      isAdmin: false,
      staffModules: [],
      modules: [],
      permissions: {},
      onboardingStage: "INVITED",
      onboardingChecklist,
      onboardingComplete: false,
      available: false,
      onDuty: false,
      currentJobCount: Number.isFinite(Number(assessment.technician.currentJobCount)) ? Number(assessment.technician.currentJobCount) : 0,
      approvalStatus: assessment.technician.approvalStatus || "PENDING",
      maxConcurrentJobs: boundedInteger(assessment.technician.maxConcurrentJobs, 3, 1, 10),
      emergencyEligible: assessment.technician.emergencyEligible === true,
      updatedAt: now,
      ...(!technicianSnap.exists ? { createdAt: now, createdBy: actorId } : {}),
    }, { merge: true });
    tx.create(db.collection("audit_logs").doc(), {
      actorId,
      actorRole,
      action: "ADMIN_REPAIR_INCOMPLETE_TECHNICIAN_PROFILE",
      targetType: "users",
      targetId: uid,
      metadata: {
        role: "technician",
        emailHash: assessment.emailHash,
        repairedComponents: assessment.missingComponents,
        authUidPreserved: true,
        authClaimsPreserved: true,
        invitationQueued: false,
        repairVersion: "technician-invitation-v1",
      },
      createdAt: now,
    });
    return { repaired: true, missingComponents: assessment.missingComponents };
  });

  return {
    success: true,
    execute: true,
    uid,
    role: "technician",
    repaired: outcome.repaired,
    repairRequired: false,
    missingComponents: outcome.missingComponents,
    authUidPreserved: true,
    authClaimsPreserved: true,
    invitationQueued: false,
  };
});

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
  const onboardingChecklist = {
    profileComplete: false,
    documentsComplete: false,
    contractComplete: false,
    deviceReady: role !== "technician",
    activationApproved: false,
  };

  try {
    await admin.auth().setCustomUserClaims(uid, claimsForAccess(role, modules, permissions, true));
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
    };
    const scheduleProfile = {
      uid, displayName, role, employeeType: role, department, specialization,
      status: "INVITED", suspended: true, onboardingStage: "INVITED", onboardingComplete: false,
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
      tx.create(db.collection("staffAccess").doc(uid), {
        uid, role, active: false, suspended: true, status: "INVITED", onboardingStage: "INVITED",
        modules, staffModules: modules, permissions, grantedAt: now, grantedBy: actorId, updatedAt: now,
      });
      tx.create(db.collection("hrProfiles").doc(uid), scheduleProfile);
      tx.create(db.collection("private_hr_profiles").doc(uid), privateHrProfile);
      if (role === "technician") {
        tx.create(db.collection("technicians").doc(uid), {
          ...operationalProfile, available: false, onDuty: false, currentJobCount: 0, approvalStatus: "PENDING",
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
          invitationQueued: true, invitationMailId: invitationRef.id, privateHrSeparated: true,
          onboardingStage: "INVITED", activationRequired: true, portalAccessActive: false,
        },
        createdAt: now,
      });
    });

    return {
      success: true, uid, role, modules, invitationQueued: true, onboardingStage: "INVITED", portalAccessActive: false,
      message: "Staff identity created and invitation queued. HR activation is required before portal authority is granted.",
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
  const role = cleanString(payload.role).toLowerCase();
  const { authUser, userSnap, accessSnap, currentRole } = await loadExistingStaff(uid);
  if ((currentRole === "technician") !== (role === "technician")) {
    throw new HttpsError("failed-precondition", "Technician identities cannot be converted to or from Admin-portal staff roles.");
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
      tx.create(db.collection("audit_logs").doc(), {
        actorId, actorRole, action: "ADMIN_UPDATE_STAFF_ACCESS", targetType: "users", targetId: uid,
        metadata: {
          previousRole: currentRole, role, modules, permissionKeys: Object.keys(permissions).sort(),
          lifecycleActive, onboardingComplete: userSnap.data()?.onboardingComplete === true,
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

export const adminSetStaffStatus = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const { actorId, actorRole } = await requireProvisioningAdmin(request);
  const payload = request.data || {};
  const uid = cleanString(payload.uid);
  const requestedStatus = cleanString(payload.status).toUpperCase();
  if (!["ACTIVE", "SUSPENDED"].includes(requestedStatus)) throw new HttpsError("invalid-argument", "status must be ACTIVE or SUSPENDED.");

  const { authUser, userSnap, accessSnap, currentRole } = await loadExistingStaff(uid);
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
      tx.create(db.collection("audit_logs").doc(), {
        actorId, actorRole, action: suspended ? "ADMIN_SUSPEND_STAFF_USER" : "ADMIN_RESTORE_STAFF_USER",
        targetType: "users", targetId: uid, metadata: { role: currentRole, refreshTokensRevoked: true, onboardingComplete: userSnap.data()?.onboardingComplete === true }, createdAt: now,
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
