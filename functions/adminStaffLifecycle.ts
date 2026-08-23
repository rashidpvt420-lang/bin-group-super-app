import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const FULL_ADMIN_ROLES = new Set(["admin", "super_admin", "ceo"]);
const STAFF_ROLES = new Set([
  "technician", "manager", "operations_admin", "hr_admin", "support_admin",
  "hr_staff", "hr_manager", "finance_staff", "dispatcher", "admin_assistant",
  "account_manager", "operations_manager", "finance_admin",
]);

function clean(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function numberOrZero(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function boundedInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(clean(value, String(fallback)), 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function roleFromToken(token: any) {
  return clean(token?.role || token?.userRole || token?.primaryRole).toLowerCase();
}

async function requireAdmin(request: any) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Admin session required.");
  const token = request.auth.token || {};
  const role = roleFromToken(token);
  const authorized = token?.suspended !== true && (
    FULL_ADMIN_ROLES.has(role) || token?.admin === true || token?.isAdmin === true ||
    token?.super_admin === true || token?.superAdmin === true || token?.ceo === true
  );
  if (!authorized) throw new HttpsError("permission-denied", "Only Founder/Admin can manage staff lifecycle records.");
  const actor = await admin.auth().getUser(request.auth.uid);
  if (actor.disabled) throw new HttpsError("permission-denied", "Disabled administrators cannot manage staff.");
  return { actorId: request.auth.uid, actorRole: role || "admin" };
}

async function loadStaff(uid: string) {
  if (!uid) throw new HttpsError("invalid-argument", "Staff UID is required.");
  const [authUser, userSnap] = await Promise.all([
    admin.auth().getUser(uid),
    db.collection("users").doc(uid).get(),
  ]);
  if (!userSnap.exists) throw new HttpsError("not-found", "Staff profile was not found.");
  const data = userSnap.data() || {};
  const role = clean(data.role || data.userRole || data.primaryRole).toLowerCase();
  if (data.isStaff !== true || !STAFF_ROLES.has(role) || FULL_ADMIN_ROLES.has(role)) {
    throw new HttpsError("failed-precondition", "Target is not a provisioned staff identity.");
  }
  return { authUser, userSnap, data, role };
}

function invitationState(authUser: admin.auth.UserRecord, user: any, hr: any, privateHr: any) {
  if (authUser.disabled || String(user.status || "").toUpperCase() === "SUSPENDED") return "SUSPENDED";
  const docsComplete = Boolean(privateHr?.employeeId && privateHr?.emiratesId);
  const contractComplete = Boolean(privateHr?.contractEndDate || hr?.employmentType);
  if (!authUser.emailVerified) return "INVITED";
  if (!docsComplete) return "EMAIL_VERIFIED";
  if (!contractComplete) return "DOCUMENTS_COMPLETE";
  return "ACTIVE";
}

export const adminGetStaffLifecycle = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  await requireAdmin(request);
  const users = await db.collection("users").where("isStaff", "==", true).limit(500).get();
  const rows = await Promise.all(users.docs.map(async (doc) => {
    const data = doc.data();
    const role = clean(data.role || data.userRole || data.primaryRole).toLowerCase();
    if (!STAFF_ROLES.has(role)) return null;
    const [authUser, hrSnap, privateSnap, accessSnap] = await Promise.all([
      admin.auth().getUser(doc.id).catch(() => null),
      db.collection("hrProfiles").doc(doc.id).get(),
      db.collection("private_hr_profiles").doc(doc.id).get(),
      db.collection("staffAccess").doc(doc.id).get(),
    ]);
    if (!authUser) return null;
    const hr = hrSnap.data() || {};
    const privateHr = privateSnap.data() || {};
    const access = accessSnap.data() || {};
    return {
      uid: doc.id,
      displayName: data.displayName || data.fullName || authUser.displayName || "Staff",
      email: data.email || authUser.email || "",
      phoneNumber: data.phoneNumber || data.phone || "",
      role,
      department: data.department || hr.department || "",
      specialization: data.specialization || data.trade || hr.specialization || "",
      status: String(data.status || (authUser.disabled ? "SUSPENDED" : "ACTIVE")).toUpperCase(),
      emailVerified: authUser.emailVerified,
      authDisabled: authUser.disabled,
      modules: Array.isArray(access.modules) ? access.modules : (Array.isArray(data.staffModules) ? data.staffModules : []),
      joiningDate: hr.joiningDate || null,
      contractEndDate: privateHr.contractEndDate || null,
      employmentType: hr.employmentType || privateHr.employmentType || null,
      shiftName: hr.shiftName || null,
      workingHours: hr.workingHours || null,
      offDay: hr.offDay || null,
      employeeIdConfigured: Boolean(privateHr.employeeId),
      emiratesIdConfigured: Boolean(privateHr.emiratesId),
      salaryConfigured: Boolean(privateHr.salaryPackage && Number(privateHr.salaryPackage.basicSalary || 0) > 0),
      lifecycleState: invitationState(authUser, data, hr, privateHr),
      onboardingComplete: invitationState(authUser, data, hr, privateHr) === "ACTIVE",
      lastLogin: data.lastLogin || null,
    };
  }));
  return { success: true, staff: rows.filter(Boolean) };
});

export const adminUpdateStaffProfile = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const { actorId, actorRole } = await requireAdmin(request);
  const payload = request.data || {};
  const uid = clean(payload.uid);
  const { authUser, data, role } = await loadStaff(uid);
  if (payload.role && clean(payload.role).toLowerCase() !== role) {
    throw new HttpsError("failed-precondition", "Role changes must use Staff Access so module ceilings and claims stay synchronized.");
  }

  const displayName = clean(payload.displayName, data.displayName || authUser.displayName || "Staff");
  const phoneNumber = clean(payload.phoneNumber, data.phoneNumber || data.phone || "");
  const department = clean(payload.department, data.department || (role === "technician" ? "Technical" : "Operations"));
  const specialization = clean(payload.specialization, data.specialization || data.trade || "General");
  const now = FieldValue.serverTimestamp();

  await admin.auth().updateUser(uid, { displayName });
  const batch = db.batch();
  batch.set(db.collection("users").doc(uid), {
    displayName, fullName: displayName, phoneNumber, phone: phoneNumber,
    department, specialization, trade: specialization, updatedAt: now,
  }, { merge: true });
  batch.set(db.collection("hrProfiles").doc(uid), {
    uid, displayName, role, department, specialization,
    joiningDate: clean(payload.joiningDate) || null,
    contractEndDate: clean(payload.contractEndDate) || null,
    employmentType: clean(payload.employmentType, "full_time"),
    shiftName: clean(payload.shiftName, "Day Shift"),
    workingHours: clean(payload.workingHours, "9 AM - 4 PM"),
    offDay: clean(payload.offDay, "Sunday"),
    updatedAt: now,
  }, { merge: true });
  batch.set(db.collection("private_hr_profiles").doc(uid), {
    employeeId: clean(payload.employeeId) || null,
    emiratesId: clean(payload.emiratesId) || null,
    joiningDate: clean(payload.joiningDate) || null,
    contractEndDate: clean(payload.contractEndDate) || null,
    employmentType: clean(payload.employmentType, "full_time"),
    salaryPackage: {
      basicSalary: numberOrZero(payload.basicSalary),
      housingAllowance: numberOrZero(payload.housingAllowance),
      transportAllowance: numberOrZero(payload.transportAllowance),
      foodAllowance: numberOrZero(payload.foodAllowance),
      otherAllowance: numberOrZero(payload.otherAllowance),
      salaryPaymentDay: boundedInt(payload.salaryPaymentDay, 1, 1, 31),
      salaryGrade: clean(payload.salaryGrade) || null,
      overtimeEligible: payload.overtimeEligible !== false,
      companyAccommodationProvided: Boolean(payload.companyAccommodationProvided),
      companyTransportProvided: Boolean(payload.companyTransportProvided),
      companyMedicalInsuranceProvided: payload.companyMedicalInsuranceProvided !== false,
    },
    accessClassification: "PRIVATE_HR_SERVER_ONLY",
    updatedAt: now,
    updatedBy: actorId,
  }, { merge: true });
  if (role === "technician") {
    batch.set(db.collection("technicians").doc(uid), {
      displayName, phoneNumber, specialization, department,
      emiratesCovered: Array.isArray(payload.emiratesCovered) ? payload.emiratesCovered.map(clean).filter(Boolean) : [],
      primaryEmirate: clean(payload.primaryEmirate) || null,
      maxConcurrentJobs: boundedInt(payload.maxConcurrentJobs, 3, 1, 10),
      emergencyEligible: Boolean(payload.emergencyEligible),
      updatedAt: now,
    }, { merge: true });
  }
  batch.set(db.collection("audit_logs").doc(), {
    actorId, actorRole, action: "ADMIN_UPDATE_STAFF_PROFILE", targetType: "users", targetId: uid,
    metadata: { role, privateHrSeparated: true }, createdAt: now,
  });
  await batch.commit();
  return { success: true, uid, role };
});

export const adminOffboardStaff = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const { actorId, actorRole } = await requireAdmin(request);
  const uid = clean(request.data?.uid);
  const reason = clean(request.data?.reason, "Administrative offboarding");
  const { authUser, role } = await loadStaff(uid);
  const previousClaims = authUser.customClaims || {};
  const now = FieldValue.serverTimestamp();

  await admin.auth().setCustomUserClaims(uid, { ...previousClaims, suspended: true });
  await admin.auth().updateUser(uid, { disabled: true });
  await admin.auth().revokeRefreshTokens(uid);

  const batch = db.batch();
  batch.set(db.collection("users").doc(uid), { status: "SUSPENDED", offboardedAt: now, offboardedBy: actorId, offboardingReason: reason, updatedAt: now }, { merge: true });
  batch.set(db.collection("staffAccess").doc(uid), { active: false, status: "SUSPENDED", updatedAt: now, updatedBy: actorId }, { merge: true });
  batch.set(db.collection("hrProfiles").doc(uid), { status: "SUSPENDED", offboardedAt: now, offboardingReason: reason, updatedAt: now }, { merge: true });
  if (role === "technician") batch.set(db.collection("technicians").doc(uid), { status: "SUSPENDED", available: false, onDuty: false, updatedAt: now }, { merge: true });
  batch.set(db.collection("audit_logs").doc(), {
    actorId, actorRole, action: "ADMIN_OFFBOARD_STAFF", targetType: "users", targetId: uid,
    metadata: { role, reason, authDisabled: true, refreshTokensRevoked: true, recordsPreserved: true }, createdAt: now,
  });
  await batch.commit();
  return { success: true, uid, status: "SUSPENDED", recordsPreserved: true };
});

export const adminResendStaffInvitation = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const { actorId, actorRole } = await requireAdmin(request);
  const uid = clean(request.data?.uid);
  const { authUser, data, role } = await loadStaff(uid);
  const email = clean(authUser.email || data.email).toLowerCase();
  if (!email) throw new HttpsError("failed-precondition", "Staff email is missing.");
  if (authUser.disabled) throw new HttpsError("failed-precondition", "Suspended staff cannot receive an invitation.");

  const mainAppUrl = clean(process.env.MAIN_APP_URL, "https://bin-group-57c60.web.app").replace(/\/$/, "");
  const adminAppUrl = clean(process.env.ADMIN_APP_URL, "https://bin-group-admin-panel.web.app").replace(/\/$/, "");
  const loginUrl = role === "technician" ? `${mainAppUrl}/login?role=technician` : `${adminAppUrl}/login`;
  const actionCodeSettings = { url: loginUrl, handleCodeInApp: false };
  const [verificationLink, passwordResetLink] = await Promise.all([
    admin.auth().generateEmailVerificationLink(email, actionCodeSettings),
    admin.auth().generatePasswordResetLink(email, actionCodeSettings),
  ]);
  const displayName = clean(data.displayName || data.fullName || authUser.displayName, "Staff");
  const now = FieldValue.serverTimestamp();
  const mailRef = db.collection("mail").doc();
  await mailRef.set({
    to: [email],
    message: {
      subject: `BIN GROUP ${role.replace(/_/g, " ")} account invitation`,
      text: `Hello ${displayName},\n\nVerify your email: ${verificationLink}\nSet your private password: ${passwordResetLink}\nOpen your portal: ${loginUrl}\n\nNever share passwords, OTP codes, or verification links.`,
      from: "BIN GROUP <ceo@bin-groups.com>",
      replyTo: "BIN GROUP Admin <ceo@bin-groups.com>",
    },
    type: "staff_account_invitation_resend",
    targetUid: uid,
    targetRole: role,
    status: "QUEUED",
    delivery: { state: "QUEUED" },
    createdAt: now,
    updatedAt: now,
    createdBy: actorId,
  });
  await db.collection("audit_logs").add({
    actorId, actorRole, action: "ADMIN_RESEND_STAFF_INVITATION", targetType: "users", targetId: uid,
    metadata: { role, mailId: mailRef.id }, createdAt: now,
  });
  return { success: true, uid, invitationQueued: true };
});
