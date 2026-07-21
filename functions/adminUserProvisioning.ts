import { randomBytes } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const PRIVILEGED_ADMIN_ROLES = new Set(["admin", "super_admin", "ceo"]);
const CUSTOMER_ROLES = new Set(["owner", "tenant", "broker", "customer", "property_owner", "institutional_owner"]);
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
  "account_manager",
  "operations_manager",
  "finance_admin",
]);

const STAFF_MODULES = new Set([
  "dashboard",
  "owners",
  "tenants",
  "tickets",
  "technicians",
  "financials",
  "transactions",
  "broker",
  "documents",
  "properties",
  "contracts",
  "reports",
  "audit",
  "compliance",
  "map",
  "sos",
  "settings",
  "hr",
  "pricing",
]);

const MODULE_PERMISSION_MAP: Record<string, string[]> = {
  owners: ["canManageTenants"],
  tenants: ["canManageTenants"],
  tickets: ["canDispatchJobs"],
  technicians: ["canManageTechnicians"],
  financials: ["canViewFinancials"],
  transactions: ["canViewPayments", "canVerifyPayments"],
  documents: ["canManageProperties"],
  properties: ["canManageProperties"],
  contracts: ["canManageContracts"],
  reports: ["canExportReports"],
  audit: ["canViewAuditLogs"],
  compliance: ["canViewAuditLogs"],
  map: ["canDispatchJobs"],
  sos: ["canDispatchJobs"],
  settings: ["canManageCompanyProfile"],
  pricing: ["canEditPricing"],
};

function cleanString(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeEmail(value: unknown) {
  return cleanString(value).toLowerCase();
}

function roleFrom(value: any) {
  return cleanString(value?.role || value?.userRole || value?.primaryRole).toLowerCase();
}

function normalizeModules(value: unknown, role: string) {
  if (role === "technician") return [];
  if (!Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "Staff module access must be provided as an array.");
  }

  const normalized = [...new Set(value.map((item) => cleanString(item)).filter(Boolean))];
  const unsupported = normalized.filter((module) => !STAFF_MODULES.has(module));
  if (unsupported.length > 0) {
    throw new HttpsError("invalid-argument", `Unsupported staff module: ${unsupported.join(", ")}`);
  }
  return normalized;
}

function permissionsForModules(modules: string[]) {
  const permissions: Record<string, boolean> = {};
  for (const module of modules) {
    for (const permission of MODULE_PERMISSION_MAP[module] || []) permissions[permission] = true;
  }
  return permissions;
}

function operationalFieldDeletes() {
  return {
    employeeId: FieldValue.delete(),
    emiratesId: FieldValue.delete(),
    salaryPackage: FieldValue.delete(),
    basicSalary: FieldValue.delete(),
    housingAllowance: FieldValue.delete(),
    transportAllowance: FieldValue.delete(),
    foodAllowance: FieldValue.delete(),
    otherAllowance: FieldValue.delete(),
    salaryGrade: FieldValue.delete(),
  };
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
  const role = roleFrom(token);
  return token?.suspended !== true && (
    PRIVILEGED_ADMIN_ROLES.has(role) ||
    token?.super_admin === true ||
    token?.superAdmin === true ||
    token?.ceo === true ||
    (role === "" && (token?.admin === true || token?.isAdmin === true))
  );
}

function generatedPassword() {
  return `${randomBytes(24).toString("base64url")}Aa1!`;
}

function loginUrlForRole(role: string) {
  const mainAppUrl = cleanString(process.env.MAIN_APP_URL, "https://bin-group-57c60.web.app").replace(/\/$/, "");
  const adminAppUrl = cleanString(process.env.ADMIN_APP_URL, "https://bin-group-admin-panel.web.app").replace(/\/$/, "");
  return role === "technician"
    ? `${mainAppUrl}/login?role=technician`
    : `${adminAppUrl}/login`;
}

function buildInvitationMessage({
  displayName,
  email,
  role,
  loginUrl,
  emailVerificationLink,
  passwordResetLink,
}: {
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
      <div style="background:#020617;color:#d4af37;padding:20px 24px;border-radius:16px 16px 0 0">
        <h1 style="margin:0;font-size:24px">BIN GROUP</h1>
        <p style="margin:4px 0 0;color:#cbd5e1">Secure account invitation</p>
      </div>
      <div style="border:1px solid #e5e7eb;border-top:0;padding:24px;border-radius:0 0 16px 16px">
        <p>Hello <strong>${safeName}</strong>,</p>
        <p>A <strong>${safeRole}</strong> account has been created for <strong>${safeEmail}</strong>.</p>
        <ol>
          <li style="margin-bottom:16px">
            <a href="${safeVerificationLink}" style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Verify email address</a>
          </li>
          <li style="margin-bottom:16px">
            <a href="${safePasswordResetLink}" style="display:inline-block;background:#d4af37;color:#111827;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Set private password</a>
          </li>
          <li>
            <a href="${safeLoginUrl}" style="font-weight:700">Open the ${escapeHtml(portalName)}</a>
          </li>
        </ol>
        <p style="margin-top:24px;padding:12px;background:#f8fafc;border-radius:8px"><strong>Security:</strong> Never share passwords, verification links, SMS codes, or device access.</p>
        <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0" />
        <p dir="rtl" style="text-align:right">مرحباً <strong>${safeName}</strong>، تم إنشاء حسابك في BIN GROUP. يرجى تأكيد البريد الإلكتروني، تعيين كلمة مرور خاصة، ثم تسجيل الدخول من الرابط الرسمي أعلاه.</p>
      </div>
    </div>
  `.trim();

  return { subject, text, html };
}

export const adminCreateUser = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const authContext = request.auth;
  if (!authContext) throw new HttpsError("unauthenticated", "Admin session required.");

  const actorId = authContext.uid;
  const actorToken = authContext.token || {};
  const actorRole = roleFrom(actorToken) || "admin";
  if (!hasAdminAccess(actorToken)) {
    throw new HttpsError("permission-denied", "Only the canonical Founder/Admin can provision staff accounts.");
  }

  const actorRecord = await admin.auth().getUser(actorId);
  if (actorRecord.disabled) {
    throw new HttpsError("permission-denied", "Disabled administrators cannot provision accounts.");
  }

  const payload = request.data || {};
  const role = cleanString(payload.role, "technician").toLowerCase();
  const email = normalizeEmail(payload.email);
  const displayName = cleanString(payload.displayName || payload.fullName);
  const phoneNumber = cleanString(payload.phoneNumber || payload.phone || payload.mobile);
  const specialization = cleanString(payload.specialization || payload.trade || payload.department, "General Maintenance");

  if (!email || !email.includes("@")) throw new HttpsError("invalid-argument", "A valid email address is required.");
  if (!displayName) throw new HttpsError("invalid-argument", "Full name is required.");
  if (!STAFF_ROLES.has(role)) throw new HttpsError("invalid-argument", `Unsupported staff role: ${role}`);

  const modules = normalizeModules(payload.modules, role);
  const permissions = permissionsForModules(modules);
  const now = FieldValue.serverTimestamp();
  let userRecord: admin.auth.UserRecord;
  let createdAuthUser = false;
  let previousClaims: Record<string, unknown> = {};
  let previousDisabled = false;
  let previousProfile: FirebaseFirestore.DocumentData | null = null;

  try {
    userRecord = await admin.auth().getUserByEmail(email);
    previousClaims = { ...(userRecord.customClaims || {}) };
    previousDisabled = userRecord.disabled === true;
    if (userRecord.disabled) {
      throw new HttpsError("failed-precondition", "The existing account is disabled and cannot be converted through staff provisioning.");
    }

    const profileSnap = await db.collection("users").doc(userRecord.uid).get();
    previousProfile = profileSnap.exists ? profileSnap.data() || null : null;
    const existingRole = roleFrom(previousProfile) || roleFrom(previousClaims);
    const existingIsStaff = Boolean(
      previousProfile?.isStaff === true ||
      previousClaims.staff === true ||
      STAFF_ROLES.has(existingRole)
    );

    if (!profileSnap.exists || !existingIsStaff || PRIVILEGED_ADMIN_ROLES.has(existingRole) || CUSTOMER_ROLES.has(existingRole)) {
      throw new HttpsError(
        "already-exists",
        "This email already belongs to a non-staff or privileged identity. Use a different work email; customer and Founder/Admin accounts cannot be converted here.",
      );
    }
  } catch (error: any) {
    if (error instanceof HttpsError) throw error;
    if (error?.code !== "auth/user-not-found") {
      throw new HttpsError("internal", `Unable to validate the existing identity safely: ${error?.message || error}`);
    }

    userRecord = await admin.auth().createUser({
      email,
      displayName,
      password: generatedPassword(),
      emailVerified: false,
      disabled: false,
    });
    createdAuthUser = true;
  }

  const uid = userRecord.uid;
  const queueInvitation = payload.sendInvitation !== false;
  const resendInvitation = payload.resendInvitation === true;
  if (createdAuthUser && !queueInvitation) {
    await admin.auth().deleteUser(uid).catch(() => undefined);
    throw new HttpsError("failed-precondition", "New staff accounts require the secure email-verification and private-password invitation.");
  }

  const shouldQueueInvitation = queueInvitation && (createdAuthUser || resendInvitation);
  const loginUrl = loginUrlForRole(role);
  const customClaims = {
    role,
    userRole: role,
    primaryRole: role,
    staff: true,
    technician: role === "technician",
    admin: false,
    isAdmin: false,
    super_admin: false,
    superAdmin: false,
    ceo: false,
    manager: false,
    modules,
    permissions,
    suspended: false,
  };

  let invitationRef: FirebaseFirestore.DocumentReference | null = null;
  let invitationMessage: ReturnType<typeof buildInvitationMessage> | null = null;

  try {
    if (shouldQueueInvitation) {
      const actionCodeSettings = { url: loginUrl, handleCodeInApp: false };
      const [emailVerificationLink, passwordResetLink] = await Promise.all([
        admin.auth().generateEmailVerificationLink(email, actionCodeSettings),
        admin.auth().generatePasswordResetLink(email, actionCodeSettings),
      ]);
      invitationRef = db.collection("mail").doc();
      invitationMessage = buildInvitationMessage({
        displayName,
        email,
        role,
        loginUrl,
        emailVerificationLink,
        passwordResetLink,
      });
    }

    await admin.auth().updateUser(uid, { displayName, disabled: false });
    await admin.auth().setCustomUserClaims(uid, { ...customClaims });

    const createdAt = previousProfile?.createdAt || now;
    const operationalProfile = {
      uid,
      email,
      displayName,
      fullName: displayName,
      phoneNumber,
      phone: phoneNumber,
      role,
      userRole: role,
      primaryRole: role,
      department: cleanString(payload.department, role === "technician" ? "Technical" : "Operations"),
      specialization,
      trade: specialization,
      status: "active",
      isStaff: true,
      isAdmin: false,
      staffModules: modules,
      permissions,
      onboardingComplete: true,
      createdAt,
      updatedAt: now,
      createdBy: previousProfile?.createdBy || actorId,
      provisionedBy: actorId,
      provisionedVia: "adminCreateUser",
    };

    const parsedSalaryPaymentDay = parseInt(cleanString(payload.salaryPaymentDay, "1"), 10);
    const salaryPaymentDay = Number.isInteger(parsedSalaryPaymentDay) ? parsedSalaryPaymentDay : 1;
    const salaryPackage = {
      basicSalary: Number(payload.basicSalary || 0),
      housingAllowance: Number(payload.housingAllowance || 0),
      transportAllowance: Number(payload.transportAllowance || 0),
      foodAllowance: Number(payload.foodAllowance || 0),
      otherAllowance: Number(payload.otherAllowance || 0),
      salaryPaymentDay,
      salaryGrade: cleanString(payload.salaryGrade),
      contractEndDate: cleanString(payload.contractEndDate) || null,
      employmentType: cleanString(payload.employmentType, "full_time"),
      overtimeEligible: payload.overtimeEligible !== false,
      companyAccommodationProvided: Boolean(payload.companyAccommodationProvided),
      companyTransportProvided: Boolean(payload.companyTransportProvided),
      companyMedicalInsuranceProvided: payload.companyMedicalInsuranceProvided !== false,
    };

    const privateHrProfile = {
      ...operationalProfile,
      employeeId: cleanString(payload.employeeId),
      emiratesId: cleanString(payload.emiratesId),
      employeeType: role,
      joiningDate: cleanString(payload.joiningDate) || null,
      offDay: cleanString(payload.offDay, "Sunday"),
      shiftName: cleanString(payload.shiftName, "Day Shift"),
      workingHours: cleanString(payload.workingHours, "9 AM - 4 PM"),
      salaryPackage,
      privateHrRecord: true,
    };

    await db.runTransaction(async (tx) => {
      tx.set(db.collection("users").doc(uid), {
        ...operationalProfile,
        ...operationalFieldDeletes(),
      }, { merge: true });

      tx.set(db.collection("staffAccess").doc(uid), {
        uid,
        role,
        active: true,
        modules,
        permissions,
        grantedAt: now,
        grantedBy: actorId,
        updatedAt: now,
      }, { merge: true });

      tx.set(db.collection("hrProfiles").doc(uid), privateHrProfile, { merge: true });

      if (role === "technician") {
        tx.set(db.collection("technicians").doc(uid), {
          ...operationalProfile,
          ...operationalFieldDeletes(),
          available: true,
          onDuty: false,
          currentJobCount: 0,
          maxConcurrentJobs: Number(payload.maxConcurrentJobs || 3),
          emergencyEligible: Boolean(payload.emergencyEligible || false),
        }, { merge: true });
      }

      if (invitationRef && invitationMessage) {
        tx.set(invitationRef, {
          to: [email],
          message: {
            subject: invitationMessage.subject,
            text: invitationMessage.text,
            html: invitationMessage.html,
            from: "BIN GROUP <ceo@bin-groups.com>",
            replyTo: "BIN GROUP Admin <ceo@bin-groups.com>",
          },
          type: "staff_account_invitation",
          template: "staff-account-invitation-v1",
          targetUid: uid,
          targetRole: role,
          status: "QUEUED",
          delivery: { state: "QUEUED" },
          createdAt: now,
          updatedAt: now,
          createdBy: actorId,
        });
      }

      tx.set(db.collection("audit_logs").doc(), {
        actorId,
        actorRole,
        action: createdAuthUser ? "ADMIN_CREATE_STAFF_USER" : "ADMIN_UPDATE_STAFF_ACCESS",
        targetType: "users",
        targetId: uid,
        metadata: {
          email,
          role,
          modules,
          permissionKeys: Object.keys(permissions),
          createdAuthUser,
          invitationQueued: Boolean(invitationRef),
          invitationMailId: invitationRef?.id || null,
        },
        createdAt: now,
      });
    });
  } catch (error: any) {
    if (createdAuthUser) {
      await admin.auth().deleteUser(uid).catch((rollbackError) => {
        console.error("Failed to roll back newly created staff Auth user", { uid, rollbackError });
      });
    } else {
      await admin.auth().setCustomUserClaims(uid, previousClaims).catch((rollbackError) => {
        console.error("Failed to restore previous staff claims after provisioning failure", { uid, rollbackError });
      });
      await admin.auth().updateUser(uid, { disabled: previousDisabled }).catch((rollbackError) => {
        console.error("Failed to restore previous disabled state after provisioning failure", { uid, rollbackError });
      });
    }
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", `Unable to provision staff account safely: ${error?.message || error}`);
  }

  const invitationQueued = Boolean(invitationRef);
  return {
    success: true,
    uid,
    email,
    role,
    modules,
    permissions,
    createdAuthUser,
    invitationQueued,
    message: createdAuthUser
      ? "Staff account created. A secure email-verification and private-password invitation was queued."
      : invitationQueued
        ? "Existing staff access updated and a fresh secure invitation was queued."
        : "Existing staff access updated. The user must refresh their token or sign in again.",
  };
});

export const syncStaffCustomClaims = onDocumentUpdated("users/{userId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!after) return;

  const roleBefore = roleFrom(before);
  const roleAfter = roleFrom(after);
  const staffModulesBefore = JSON.stringify(before?.staffModules || []);
  const staffModulesAfter = JSON.stringify(after?.staffModules || []);
  const statusBefore = cleanString(before?.status).toLowerCase();
  const statusAfter = cleanString(after?.status).toLowerCase();

  if (roleBefore === roleAfter && staffModulesBefore === staffModulesAfter && statusBefore === statusAfter) return;
  if (!STAFF_ROLES.has(roleAfter) && !PRIVILEGED_ADMIN_ROLES.has(roleAfter)) return;

  const uid = event.params.userId;
  try {
    const userRecord = await admin.auth().getUser(uid);
    const existingClaims = userRecord.customClaims || {};

    if (["suspended", "disabled", "rejected"].includes(statusAfter)) {
      await admin.auth().updateUser(uid, { disabled: true });
      await admin.auth().setCustomUserClaims(uid, { ...existingClaims, suspended: true });
      await admin.auth().revokeRefreshTokens(uid);
      return;
    }

    if (userRecord.disabled) await admin.auth().updateUser(uid, { disabled: false });

    if (PRIVILEGED_ADMIN_ROLES.has(roleAfter)) {
      await admin.auth().setCustomUserClaims(uid, {
        ...existingClaims,
        role: roleAfter,
        userRole: roleAfter,
        primaryRole: roleAfter,
        admin: true,
        isAdmin: true,
        staff: true,
        technician: false,
        suspended: false,
      });
      return;
    }

    const modules = normalizeModules(after.staffModules || [], roleAfter);
    const permissions = permissionsForModules(modules);
    await admin.auth().setCustomUserClaims(uid, {
      role: roleAfter,
      userRole: roleAfter,
      primaryRole: roleAfter,
      staff: true,
      technician: roleAfter === "technician",
      admin: false,
      isAdmin: false,
      super_admin: false,
      superAdmin: false,
      ceo: false,
      manager: false,
      modules,
      permissions,
      suspended: false,
    });
  } catch (error: any) {
    if (error.code !== "auth/user-not-found") {
      console.error(`Failed to sync claims for ${uid}`, error);
    }
  }
});
