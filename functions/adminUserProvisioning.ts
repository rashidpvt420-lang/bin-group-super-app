import { randomBytes } from "crypto";
import { FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
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

function cleanString(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeEmail(value: unknown) {
  return cleanString(value).toLowerCase();
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

function generatedPassword() {
  const secureRandom = randomBytes(6).toString("hex");
  return `BinPilot#${secureRandom}!`;
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
  if (!authContext) {
    throw new HttpsError("unauthenticated", "Admin session required.");
  }

  const actorId = authContext.uid;
  const actorToken = authContext.token || {};
  const actorRole = cleanString(actorToken.role || actorToken.userRole || actorToken.primaryRole, "admin");

  if (!hasAdminAccess(actorToken)) {
    throw new HttpsError("permission-denied", "Only authorized admins can provision staff accounts.");
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

  if (!email || !email.includes("@")) {
    throw new HttpsError("invalid-argument", "A valid email address is required.");
  }
  if (!displayName) {
    throw new HttpsError("invalid-argument", "Full name is required.");
  }
  if (!STAFF_ROLES.has(role)) {
    throw new HttpsError("invalid-argument", `Unsupported staff role: ${role}`);
  }

  const now = FieldValue.serverTimestamp();
  let userRecord: admin.auth.UserRecord;
  let createdAuthUser = false;

  const initialPassword = cleanString(payload.initialPassword || payload.password || payload.tempPassword);
  const passwordToUse = initialPassword.length >= 8 ? initialPassword : generatedPassword();

  try {
    userRecord = await admin.auth().getUserByEmail(email);
  } catch (err: any) {
    if (err?.code !== "auth/user-not-found") {
      throw new HttpsError("internal", `Unable to check existing user: ${err?.message || err}`);
    }
    userRecord = await admin.auth().createUser({
      email,
      displayName,
      password: passwordToUse,
      emailVerified: false,
      disabled: false,
    });
    createdAuthUser = true;
  }

  const uid = userRecord.uid;
  const queueInvitation = payload.sendInvitation !== false;
  const resendInvitation = payload.resendInvitation === true;
  const shouldQueueInvitation = queueInvitation && (createdAuthUser || resendInvitation);
  const loginUrl = loginUrlForRole(role);
  let invitationRef: FirebaseFirestore.DocumentReference | null = null;
  let invitationMessage: ReturnType<typeof buildInvitationMessage> | null = null;

  try {
    await admin.auth().setCustomUserClaims(uid, {
      role,
      userRole: role,
      primaryRole: role,
      staff: true,
      technician: role === "technician",
      admin: PRIVILEGED_ADMIN_ROLES.has(role),
    });

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

    const commonProfile = {
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
      isAdmin: PRIVILEGED_ADMIN_ROLES.has(role),
      onboardingComplete: true,
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      provisionedBy: actorId,
      provisionedVia: "adminCreateUser",
      employeeId: cleanString(payload.employeeId),
      emiratesId: cleanString(payload.emiratesId),
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

    await db.runTransaction(async (tx) => {
      tx.set(db.collection("users").doc(uid), {
        ...commonProfile,
        salaryPackage,
      }, { merge: true });

      tx.set(db.collection("staffAccess").doc(uid), {
        uid,
        role,
        active: true,
        permissions: payload.permissions || {},
        grantedAt: now,
        grantedBy: actorId,
        updatedAt: now,
      }, { merge: true });

      tx.set(db.collection("hrProfiles").doc(uid), {
        ...commonProfile,
        employeeType: role,
        joiningDate: cleanString(payload.joiningDate) || null,
        offDay: cleanString(payload.offDay, "Sunday"),
        shiftName: cleanString(payload.shiftName, "Day Shift"),
        workingHours: cleanString(payload.workingHours, "9 AM - 4 PM"),
        salaryPackage,
      }, { merge: true });

      if (role === "technician") {
        tx.set(db.collection("technicians").doc(uid), {
          ...commonProfile,
          available: true,
          onDuty: false,
          currentJobCount: 0,
          maxConcurrentJobs: Number(payload.maxConcurrentJobs || 3),
          emergencyEligible: Boolean(payload.emergencyEligible || false),
          salaryPackage,
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
        action: "ADMIN_CREATE_STAFF_USER",
        targetType: "users",
        targetId: uid,
        metadata: {
          email,
          role,
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
    createdAuthUser,
    invitationQueued,
    message: createdAuthUser
      ? invitationQueued
        ? "Staff account created. A secure email-verification and password-setup invitation was queued."
        : "Staff account created without an invitation. Send a password-reset email before first login."
      : invitationQueued
        ? "Existing staff account updated and a fresh secure invitation was queued."
        : "Existing staff account updated.",
  };
});

import { onDocumentUpdated } from "firebase-functions/v2/firestore";

export const syncStaffCustomClaims = onDocumentUpdated("users/{userId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!after) return;

  const roleBefore = cleanString(before?.role);
  const roleAfter = cleanString(after?.role);
  const staffModulesBefore = JSON.stringify(before?.staffModules || []);
  const staffModulesAfter = JSON.stringify(after?.staffModules || []);
  const statusBefore = before?.status;
  const statusAfter = cleanString(after?.status).toLowerCase();

  if (roleBefore === roleAfter && staffModulesBefore === staffModulesAfter && statusBefore === statusAfter) {
    return;
  }

  const uid = event.params.userId;
  const role = roleAfter.toLowerCase();

  try {
    const userRecord = await admin.auth().getUser(uid);
    const existingClaims = userRecord.customClaims || {};

    if (["suspended", "disabled", "rejected"].includes(statusAfter)) {
      await admin.auth().updateUser(uid, { disabled: true });
      await admin.auth().setCustomUserClaims(uid, { suspended: true });
      await admin.auth().revokeRefreshTokens(uid);
      return;
    }

    if (userRecord.disabled) {
      await admin.auth().updateUser(uid, { disabled: false });
    }
    await admin.auth().setCustomUserClaims(uid, {
      role,
      userRole: role,
      primaryRole: role,
      staff: STAFF_ROLES.has(role) || PRIVILEGED_ADMIN_ROLES.has(role),
      technician: role === "technician",
      admin: PRIVILEGED_ADMIN_ROLES.has(role),
      modules: after.staffModules || [],
      permissions: after.permissions || existingClaims.permissions || {},
      suspended: false,
    });
  } catch (error: any) {
    if (error.code !== "auth/user-not-found") {
      console.error(`Failed to sync claims for ${uid}`, error);
    }
  }
});
