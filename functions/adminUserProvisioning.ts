import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

 review/deployed-hosting-state
const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "manager", "operations_admin", "hr_manager"]);

const ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "manager", "operations_admin", "hr_manager", "finance_admin"]);
 main
const STAFF_ROLES = new Set([
  "technician",
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

function hasAdminAccess(token: any, dbRole?: string, dbIsAdmin?: boolean) {
  const role = cleanString(token?.role || token?.userRole || token?.primaryRole).toLowerCase();
  return (
    token?.admin === true ||
    token?.super_admin === true ||
    token?.superAdmin === true ||
    ADMIN_ROLES.has(role) ||
    dbIsAdmin === true ||
    (dbRole && ADMIN_ROLES.has(dbRole.toLowerCase()))
  );
}

import { randomBytes } from "crypto";

function generatedPassword() {
  const secureRandom = randomBytes(6).toString("hex"); // Generates 12 cryptographically secure hex characters
  return `BinPilot#${secureRandom}!`;
}

export const adminCreateUser = onCall({ cors: true, region: "europe-west3" }, async (request) => {
  const authContext = request.auth;
  if (!authContext) {
    throw new HttpsError("unauthenticated", "Admin session required.");
  }

  const actorId = authContext.uid;
  const actorToken = authContext.token || {};
  const actorRole = cleanString(actorToken.role || actorToken.userRole || actorToken.primaryRole, "admin");

  // Fetch actor's database profile to verify admin access as a fallback
  const actorProfile = await db.collection("users").doc(actorId).get();
  const actorProfileData = actorProfile.data() || {};
  const dbRole = cleanString(actorProfileData.role || actorProfileData.userRole || actorProfileData.primaryRole);
  const dbIsAdmin = actorProfileData.admin === true || actorProfileData.isAdmin === true;

  if (!hasAdminAccess(actorToken, dbRole, dbIsAdmin)) {
    throw new HttpsError("permission-denied", "Only authorized admins can provision staff accounts.");
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

  const now = admin.firestore.FieldValue.serverTimestamp();
  let userRecord: admin.auth.UserRecord;
  let createdAuthUser = false;

  // Resolve password
  const initialPassword = cleanString(payload.initialPassword || payload.password);
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
  await admin.auth().setCustomUserClaims(uid, {
    role,
    userRole: role,
    primaryRole: role,
    staff: true,
    technician: role === "technician",
 review/deployed-hosting-state
    admin: false,

    admin: ADMIN_ROLES.has(role),
 main
  });

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
 review/deployed-hosting-state
    isAdmin: false,

    isAdmin: ADMIN_ROLES.has(role),
 main
    onboardingComplete: true,
    createdAt: now,
    updatedAt: now,
    createdBy: actorId,
    provisionedBy: actorId,
    provisionedVia: "adminCreateUser",
    // Added Registry fields
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

    tx.set(db.collection("audit_logs").doc(), {
      actorId,
      actorRole,
      action: "ADMIN_CREATE_STAFF_USER",
      targetType: "users",
      targetId: uid,
      metadata: { email, role, createdAuthUser },
      createdAt: now,
    });
  });

  return {
    success: true,
    uid,
    email,
    role,
    createdAuthUser,
    message: createdAuthUser
      ? `Staff account created. Ask the user to reset password before first login. Initial Password: ${passwordToUse}`
      : "Existing staff account updated.",
  };
});
