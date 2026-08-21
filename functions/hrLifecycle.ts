import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

const CALLABLE_OPTIONS = {
  region: "europe-west3",
  cors: true,
  enforceAppCheck: true,
} as const;

const FULL_ADMIN_ROLES = new Set(["admin", "super_admin", "ceo"]);
const HR_MANAGER_ROLES = new Set(["hr_admin", "hr_manager"]);
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

const ONBOARDING_STAGES = [
  "INVITED",
  "EMAIL_VERIFIED",
  "PROFILE_COMPLETE",
  "DOCUMENTS_COMPLETE",
  "CONTRACT_COMPLETE",
  "DEVICE_READY",
  "ACTIVE",
] as const;

type OnboardingStage = typeof ONBOARDING_STAGES[number];

const DOCUMENT_TYPES = new Set([
  "employment_contract",
  "emirates_id",
  "passport",
  "visa",
  "certificate",
  "driving_licence",
  "warning_letter",
  "leave_evidence",
  "insurance",
  "other",
]);

const LEAVE_TYPES = new Set(["ANNUAL", "SICK", "EMERGENCY", "UNPAID", "OTHER"]);

function clean(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function roleFromToken(token: Record<string, unknown>) {
  return clean(token.role || token.userRole || token.primaryRole).toLowerCase();
}

function isFullAdmin(token: Record<string, unknown>) {
  const role = roleFromToken(token);
  return token.suspended !== true && (
    FULL_ADMIN_ROLES.has(role) ||
    token.admin === true ||
    token.isAdmin === true ||
    token.super_admin === true ||
    token.superAdmin === true ||
    token.ceo === true
  );
}

function isHrManager(token: Record<string, unknown>) {
  return isFullAdmin(token) || HR_MANAGER_ROLES.has(roleFromToken(token));
}

function isHrReader(token: Record<string, unknown>) {
  return isHrManager(token) || roleFromToken(token) === "hr_staff";
}

async function requireActiveActor(request: any) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
  if (request.auth.token?.suspended === true) throw new HttpsError("permission-denied", "Suspended accounts cannot use HR operations.");
  const actor = await admin.auth().getUser(request.auth.uid);
  if (actor.disabled) throw new HttpsError("permission-denied", "Disabled accounts cannot use HR operations.");
  return {
    actorId: request.auth.uid,
    actorRole: roleFromToken(request.auth.token || {}),
    token: request.auth.token || {},
  };
}

async function requireHrManager(request: any) {
  const actor = await requireActiveActor(request);
  if (!isHrManager(actor.token)) {
    throw new HttpsError("permission-denied", "Founder/Admin or HR Manager authority is required.");
  }
  return actor;
}

async function requireHrReader(request: any) {
  const actor = await requireActiveActor(request);
  if (!isHrReader(actor.token)) {
    throw new HttpsError("permission-denied", "HR access is required.");
  }
  return actor;
}

async function loadStaff(uid: string) {
  if (!uid) throw new HttpsError("invalid-argument", "Staff UID is required.");
  const [authUser, userSnap, hrSnap, privateSnap, accessSnap, technicianSnap] = await Promise.all([
    admin.auth().getUser(uid),
    db.collection("users").doc(uid).get(),
    db.collection("hrProfiles").doc(uid).get(),
    db.collection("private_hr_profiles").doc(uid).get(),
    db.collection("staffAccess").doc(uid).get(),
    db.collection("technicians").doc(uid).get(),
  ]);
  const user = userSnap.data() || {};
  const role = clean(user.role).toLowerCase();
  if (!userSnap.exists || user.isStaff !== true || !STAFF_ROLES.has(role)) {
    throw new HttpsError("failed-precondition", "Target identity is not a provisioned staff account.");
  }
  return {
    authUser,
    userSnap,
    user,
    role,
    hr: hrSnap.data() || {},
    privateHr: privateSnap.data() || {},
    access: accessSnap.data() || {},
    technician: technicianSnap.data() || {},
    technicianExists: technicianSnap.exists,
  };
}

function numeric(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : 0;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number.parseInt(clean(value, String(fallback)), 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function normalizeStringArray(value: unknown, max = 12) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => clean(entry)).filter(Boolean))].slice(0, max);
}

function isoDate(value: unknown, label: string, optional = true) {
  const text = clean(value);
  if (!text && optional) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new HttpsError("invalid-argument", `${label} must use YYYY-MM-DD.`);
  const date = new Date(`${text}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) throw new HttpsError("invalid-argument", `${label} is invalid.`);
  return text;
}

function daysInclusive(start: string, end: string) {
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  return Math.floor((b - a) / 86400000) + 1;
}

function stageFromChecklist(role: string, emailVerified: boolean, checklist: Record<string, boolean>): OnboardingStage {
  if (!emailVerified) return "INVITED";
  if (!checklist.profileComplete) return "EMAIL_VERIFIED";
  if (!checklist.documentsComplete) return "PROFILE_COMPLETE";
  if (!checklist.contractComplete) return "DOCUMENTS_COMPLETE";
  if (role === "technician" && !checklist.deviceReady) return "CONTRACT_COMPLETE";
  return "ACTIVE";
}

function loginUrlForRole(role: string) {
  const mainAppUrl = clean(process.env.MAIN_APP_URL, "https://bin-group-57c60.web.app").replace(/\/$/, "");
  const adminAppUrl = clean(process.env.ADMIN_APP_URL, "https://bin-group-admin-panel.web.app").replace(/\/$/, "");
  return role === "technician" ? `${mainAppUrl}/login?role=technician` : `${adminAppUrl}/login`;
}

function invitationMessage(displayName: string, role: string, verificationLink: string, passwordLink: string, loginUrl: string) {
  const roleLabel = role.split("_").map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");
  return {
    subject: `BIN GROUP ${roleLabel} account invitation`,
    text: [
      `Hello ${displayName},`,
      "",
      "Your BIN GROUP staff account is ready for onboarding.",
      `1. Verify your email: ${verificationLink}`,
      `2. Create your private password: ${passwordLink}`,
      `3. Open your portal: ${loginUrl}`,
      "",
      "Your account remains in onboarding until the required profile, HR documents, contract and device steps are complete.",
    ].join("\n"),
  };
}

async function audit(actorId: string, actorRole: string, action: string, targetId: string, metadata: Record<string, unknown> = {}) {
  await db.collection("audit_logs").add({
    actorId,
    actorRole,
    action,
    targetType: "staff",
    targetId,
    metadata,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export const adminUpdateStaffProfile = onCall(CALLABLE_OPTIONS, async (request) => {
  const { actorId, actorRole } = await requireHrManager(request);
  const data = request.data || {};
  const uid = clean(data.uid);
  const staff = await loadStaff(uid);
  const now = FieldValue.serverTimestamp();

  const displayName = clean(data.displayName, clean(staff.user.displayName || staff.authUser.displayName, "Staff"));
  const phoneNumber = clean(data.phoneNumber || data.mobile, clean(staff.user.phoneNumber || staff.user.phone));
  const department = clean(data.department, clean(staff.user.department, staff.role === "technician" ? "Technical" : "Operations"));
  const jobTitle = clean(data.jobTitle, clean(staff.hr.jobTitle));
  const specialization = clean(data.specialization || data.trade, clean(staff.user.specialization || staff.user.trade, "General"));

  const publicUpdate: Record<string, unknown> = {
    displayName,
    fullName: displayName,
    phoneNumber,
    phone: phoneNumber,
    department,
    specialization,
    trade: specialization,
    updatedAt: now,
    updatedBy: actorId,
  };

  const hrUpdate: Record<string, unknown> = {
    displayName,
    department,
    jobTitle: jobTitle || null,
    specialization,
    joiningDate: isoDate(data.joiningDate, "joiningDate") ?? staff.hr.joiningDate ?? null,
    employmentType: clean(data.employmentType, clean(staff.hr.employmentType, "full_time")),
    probationEndDate: isoDate(data.probationEndDate, "probationEndDate") ?? staff.hr.probationEndDate ?? null,
    contractEndDate: isoDate(data.contractEndDate, "contractEndDate") ?? staff.hr.contractEndDate ?? null,
    offDay: clean(data.offDay, clean(staff.hr.offDay, "Sunday")),
    shiftName: clean(data.shiftName, clean(staff.hr.shiftName, "Day Shift")),
    workingHours: clean(data.workingHours, clean(staff.hr.workingHours, "9 AM - 6 PM")),
    updatedAt: now,
    updatedBy: actorId,
  };

  const privateUpdate: Record<string, unknown> = {
    employeeId: clean(data.employeeId, clean(staff.privateHr.employeeId)) || null,
    emiratesId: clean(data.emiratesId, clean(staff.privateHr.emiratesId)) || null,
    passportNumber: clean(data.passportNumber, clean(staff.privateHr.passportNumber)) || null,
    visaExpiryDate: isoDate(data.visaExpiryDate, "visaExpiryDate") ?? staff.privateHr.visaExpiryDate ?? null,
    contractEndDate: isoDate(data.contractEndDate, "contractEndDate") ?? staff.privateHr.contractEndDate ?? null,
    emergencyContact: {
      name: clean(data.emergencyContactName, clean(staff.privateHr.emergencyContact?.name)) || null,
      relationship: clean(data.emergencyContactRelationship, clean(staff.privateHr.emergencyContact?.relationship)) || null,
      phone: clean(data.emergencyContactPhone, clean(staff.privateHr.emergencyContact?.phone)) || null,
    },
    salaryPackage: {
      basicSalary: data.basicSalary === undefined ? numeric(staff.privateHr.salaryPackage?.basicSalary) : numeric(data.basicSalary),
      housingAllowance: data.housingAllowance === undefined ? numeric(staff.privateHr.salaryPackage?.housingAllowance) : numeric(data.housingAllowance),
      transportAllowance: data.transportAllowance === undefined ? numeric(staff.privateHr.salaryPackage?.transportAllowance) : numeric(data.transportAllowance),
      foodAllowance: data.foodAllowance === undefined ? numeric(staff.privateHr.salaryPackage?.foodAllowance) : numeric(data.foodAllowance),
      otherAllowance: data.otherAllowance === undefined ? numeric(staff.privateHr.salaryPackage?.otherAllowance) : numeric(data.otherAllowance),
      salaryPaymentDay: boundedInteger(data.salaryPaymentDay ?? staff.privateHr.salaryPackage?.salaryPaymentDay, 1, 1, 31),
      salaryGrade: clean(data.salaryGrade, clean(staff.privateHr.salaryPackage?.salaryGrade)) || null,
      overtimeEligible: data.overtimeEligible === undefined ? staff.privateHr.salaryPackage?.overtimeEligible !== false : Boolean(data.overtimeEligible),
      companyAccommodationProvided: data.companyAccommodationProvided === undefined ? Boolean(staff.privateHr.salaryPackage?.companyAccommodationProvided) : Boolean(data.companyAccommodationProvided),
      companyTransportProvided: data.companyTransportProvided === undefined ? Boolean(staff.privateHr.salaryPackage?.companyTransportProvided) : Boolean(data.companyTransportProvided),
      companyMedicalInsuranceProvided: data.companyMedicalInsuranceProvided === undefined ? staff.privateHr.salaryPackage?.companyMedicalInsuranceProvided !== false : Boolean(data.companyMedicalInsuranceProvided),
    },
    updatedAt: now,
    updatedBy: actorId,
  };

  const batch = db.batch();
  batch.set(db.collection("users").doc(uid), publicUpdate, { merge: true });
  batch.set(db.collection("hrProfiles").doc(uid), hrUpdate, { merge: true });
  batch.set(db.collection("private_hr_profiles").doc(uid), privateUpdate, { merge: true });

  if (staff.role === "technician") {
    const primaryEmirate = clean(data.primaryEmirate, clean(staff.technician.primaryEmirate));
    const technicianUpdate = {
      ...publicUpdate,
      primaryEmirate: primaryEmirate || null,
      emirate: primaryEmirate || clean(staff.technician.emirate) || null,
      emiratesCovered: data.emiratesCovered === undefined ? normalizeStringArray(staff.technician.emiratesCovered) : normalizeStringArray(data.emiratesCovered),
      maxConcurrentJobs: boundedInteger(data.maxConcurrentJobs ?? staff.technician.maxConcurrentJobs, 3, 1, 10),
      emergencyEligible: data.emergencyEligible === undefined ? Boolean(staff.technician.emergencyEligible) : Boolean(data.emergencyEligible),
    };
    batch.set(db.collection("technicians").doc(uid), technicianUpdate, { merge: true });
  }

  await batch.commit();
  if (displayName !== staff.authUser.displayName) {
    await admin.auth().updateUser(uid, { displayName });
  }
  await audit(actorId, actorRole, "ADMIN_UPDATE_STAFF_PROFILE", uid, { role: staff.role, privateHrSeparated: true });
  return { success: true, uid };
});

export const adminResendStaffInvitation = onCall(CALLABLE_OPTIONS, async (request) => {
  const { actorId, actorRole } = await requireHrManager(request);
  const uid = clean(request.data?.uid);
  const staff = await loadStaff(uid);
  const email = clean(staff.authUser.email).toLowerCase();
  if (!email) throw new HttpsError("failed-precondition", "Staff account has no email address.");

  const loginUrl = loginUrlForRole(staff.role);
  const actionCodeSettings = { url: loginUrl, handleCodeInApp: false };
  const [verificationLink, passwordLink] = await Promise.all([
    admin.auth().generateEmailVerificationLink(email, actionCodeSettings),
    admin.auth().generatePasswordResetLink(email, actionCodeSettings),
  ]);
  const message = invitationMessage(clean(staff.user.displayName, "Staff"), staff.role, verificationLink, passwordLink, loginUrl);
  const now = FieldValue.serverTimestamp();
  const mailRef = db.collection("mail").doc();
  const batch = db.batch();
  batch.set(mailRef, {
    to: [email],
    message: { subject: message.subject, text: message.text, from: "BIN GROUP <ceo@bin-groups.com>", replyTo: "BIN GROUP Admin <ceo@bin-groups.com>" },
    type: "staff_account_invitation",
    template: "staff-account-invitation-v3",
    targetUid: uid,
    targetRole: staff.role,
    status: "QUEUED",
    delivery: { state: "QUEUED" },
    createdAt: now,
    updatedAt: now,
    createdBy: actorId,
  });
  batch.set(db.collection("users").doc(uid), {
    invitationStatus: "QUEUED",
    lastInvitationAt: now,
    invitationAttempts: FieldValue.increment(1),
    updatedAt: now,
  }, { merge: true });
  await batch.commit();
  await audit(actorId, actorRole, "ADMIN_RESEND_STAFF_INVITATION", uid, { role: staff.role, mailId: mailRef.id });
  return { success: true, uid, invitationQueued: true };
});

export const adminUpdateStaffOnboarding = onCall(CALLABLE_OPTIONS, async (request) => {
  const { actorId, actorRole } = await requireHrManager(request);
  const uid = clean(request.data?.uid);
  const staff = await loadStaff(uid);
  const current = staff.user.onboardingChecklist || {};
  const checklist = {
    profileComplete: request.data?.profileComplete === undefined ? current.profileComplete === true : Boolean(request.data.profileComplete),
    documentsComplete: request.data?.documentsComplete === undefined ? current.documentsComplete === true : Boolean(request.data.documentsComplete),
    contractComplete: request.data?.contractComplete === undefined ? current.contractComplete === true : Boolean(request.data.contractComplete),
    deviceReady: staff.role === "technician"
      ? (request.data?.deviceReady === undefined ? current.deviceReady === true : Boolean(request.data.deviceReady))
      : true,
  };
  const stage = stageFromChecklist(staff.role, staff.authUser.emailVerified, checklist);
  const active = stage === "ACTIVE";
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(db.collection("users").doc(uid), {
    onboardingChecklist: checklist,
    onboardingStage: stage,
    onboardingComplete: active,
    emailVerified: staff.authUser.emailVerified,
    status: active ? "ACTIVE" : stage,
    updatedAt: now,
    updatedBy: actorId,
  }, { merge: true });
  batch.set(db.collection("hrProfiles").doc(uid), { onboardingStage: stage, onboardingComplete: active, status: active ? "ACTIVE" : stage, updatedAt: now }, { merge: true });
  batch.set(db.collection("staffAccess").doc(uid), { onboardingStage: stage, status: active ? "ACTIVE" : stage, active: true, updatedAt: now, updatedBy: actorId }, { merge: true });
  if (staff.role === "technician") {
    batch.set(db.collection("technicians").doc(uid), {
      onboardingStage: stage,
      onboardingComplete: active,
      status: active ? "ACTIVE" : stage,
      approvalStatus: active ? "APPROVED" : "PENDING",
      available: active ? Boolean(staff.technician.available ?? true) : false,
      onDuty: active ? Boolean(staff.technician.onDuty) : false,
      updatedAt: now,
    }, { merge: true });
  }
  await batch.commit();
  await audit(actorId, actorRole, "ADMIN_UPDATE_STAFF_ONBOARDING", uid, { role: staff.role, stage, checklist, emailVerified: staff.authUser.emailVerified });
  return { success: true, uid, stage, active, emailVerified: staff.authUser.emailVerified, checklist };
});

export const submitStaffLeaveRequest = onCall(CALLABLE_OPTIONS, async (request) => {
  const { actorId, actorRole, token } = await requireActiveActor(request);
  const role = roleFromToken(token);
  if (!STAFF_ROLES.has(role)) throw new HttpsError("permission-denied", "Staff identity required.");
  const leaveType = clean(request.data?.leaveType, "ANNUAL").toUpperCase();
  if (!LEAVE_TYPES.has(leaveType)) throw new HttpsError("invalid-argument", "Unsupported leave type.");
  const startDate = isoDate(request.data?.startDate, "startDate", false)!;
  const endDate = isoDate(request.data?.endDate, "endDate", false)!;
  const totalDays = daysInclusive(startDate, endDate);
  if (totalDays < 1 || totalDays > 60) throw new HttpsError("invalid-argument", "Leave duration must be between 1 and 60 days.");
  const reason = clean(request.data?.reason);
  if (!reason) throw new HttpsError("invalid-argument", "Leave reason is required.");
  const evidencePath = clean(request.data?.evidencePath);
  if (evidencePath && !evidencePath.startsWith(`staffDocuments/${actorId}/`) && !evidencePath.startsWith(`hrDocuments/${actorId}/`)) {
    throw new HttpsError("permission-denied", "Leave evidence must belong to the requesting staff member.");
  }
  const now = FieldValue.serverTimestamp();
  const ref = db.collection("staff_leave_requests").doc();
  await ref.set({
    requestId: ref.id,
    staffId: actorId,
    staffRole: actorRole,
    leaveType,
    startDate,
    endDate,
    totalDays,
    reason,
    evidencePath: evidencePath || null,
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
  });
  await audit(actorId, actorRole, "STAFF_LEAVE_REQUEST_SUBMITTED", actorId, { requestId: ref.id, leaveType, startDate, endDate, totalDays });
  return { success: true, requestId: ref.id, status: "PENDING" };
});

export const adminResolveStaffLeaveRequest = onCall(CALLABLE_OPTIONS, async (request) => {
  const { actorId, actorRole } = await requireHrManager(request);
  const requestId = clean(request.data?.requestId);
  const decision = clean(request.data?.decision).toUpperCase();
  if (!requestId) throw new HttpsError("invalid-argument", "Leave request ID is required.");
  if (!["APPROVED", "REJECTED"].includes(decision)) throw new HttpsError("invalid-argument", "Decision must be APPROVED or REJECTED.");
  const ref = db.collection("staff_leave_requests").doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Leave request not found.");
  const record = snap.data() || {};
  if (clean(record.status).toUpperCase() !== "PENDING") throw new HttpsError("failed-precondition", "Only pending leave requests can be resolved.");
  const now = FieldValue.serverTimestamp();
  await ref.set({
    status: decision,
    decisionNote: clean(request.data?.note) || null,
    decidedAt: now,
    decidedBy: actorId,
    updatedAt: now,
  }, { merge: true });
  await audit(actorId, actorRole, "ADMIN_RESOLVE_STAFF_LEAVE", clean(record.staffId), { requestId, decision });
  return { success: true, requestId, status: decision };
});

export const adminRecordAttendanceAdjustment = onCall(CALLABLE_OPTIONS, async (request) => {
  const { actorId, actorRole } = await requireHrManager(request);
  const uid = clean(request.data?.uid);
  await loadStaff(uid);
  const date = isoDate(request.data?.date, "date", false)!;
  const action = clean(request.data?.action).toUpperCase();
  if (!["PRESENT", "ABSENT", "ON_LEAVE", "SICK_LEAVE", "EXCUSED", "SHIFT_EXCEPTION"].includes(action)) {
    throw new HttpsError("invalid-argument", "Unsupported attendance adjustment.");
  }
  const reason = clean(request.data?.reason);
  if (!reason) throw new HttpsError("invalid-argument", "Attendance adjustment reason is required.");
  const now = FieldValue.serverTimestamp();
  const adjustmentRef = db.collection("staff_attendance_adjustments").doc(`${uid}_${date}`);
  await adjustmentRef.set({
    staffId: uid,
    date,
    action,
    reason,
    approvedBy: actorId,
    approvedByRole: actorRole,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });
  await audit(actorId, actorRole, "ADMIN_RECORD_ATTENDANCE_ADJUSTMENT", uid, { date, action });
  return { success: true, uid, date, action };
});

export const adminRegisterHrDocument = onCall(CALLABLE_OPTIONS, async (request) => {
  const { actorId, actorRole } = await requireHrManager(request);
  const uid = clean(request.data?.uid);
  await loadStaff(uid);
  const storagePath = clean(request.data?.storagePath);
  const documentType = clean(request.data?.documentType, "other").toLowerCase();
  const fileName = clean(request.data?.fileName);
  const contentType = clean(request.data?.contentType);
  const expiresOn = isoDate(request.data?.expiresOn, "expiresOn");
  if (!storagePath.startsWith(`hrDocuments/${uid}/`)) throw new HttpsError("permission-denied", "HR document path must be scoped to the selected staff member.");
  if (!DOCUMENT_TYPES.has(documentType)) throw new HttpsError("invalid-argument", "Unsupported HR document type.");
  if (!fileName) throw new HttpsError("invalid-argument", "Document filename is required.");
  const now = FieldValue.serverTimestamp();
  const ref = db.collection("hr_document_records").doc();
  await ref.set({
    documentId: ref.id,
    staffId: uid,
    documentType,
    storagePath,
    fileName,
    contentType: contentType || null,
    expiresOn,
    status: "ACTIVE",
    uploadedAt: now,
    uploadedBy: actorId,
    updatedAt: now,
  });
  await audit(actorId, actorRole, "ADMIN_REGISTER_HR_DOCUMENT", uid, { documentId: ref.id, documentType, expiresOn, storagePath });
  return { success: true, documentId: ref.id };
});

export const adminOffboardStaff = onCall(CALLABLE_OPTIONS, async (request) => {
  const { actorId, actorRole } = await requireHrManager(request);
  const uid = clean(request.data?.uid);
  if (uid === actorId) throw new HttpsError("failed-precondition", "You cannot offboard your own account.");
  const staff = await loadStaff(uid);
  const reason = clean(request.data?.reason);
  if (!reason) throw new HttpsError("invalid-argument", "Offboarding reason is required.");
  const now = FieldValue.serverTimestamp();

  await admin.auth().updateUser(uid, { disabled: true });
  await admin.auth().setCustomUserClaims(uid, { ...(staff.authUser.customClaims || {}), suspended: true, offboarded: true });
  await admin.auth().revokeRefreshTokens(uid);

  const batch = db.batch();
  batch.set(db.collection("users").doc(uid), {
    status: "OFFBOARDED",
    suspended: true,
    offboarded: true,
    offboardedAt: now,
    offboardedBy: actorId,
    offboardingReason: reason,
    updatedAt: now,
  }, { merge: true });
  batch.set(db.collection("staffAccess").doc(uid), { active: false, status: "OFFBOARDED", archived: true, updatedAt: now, updatedBy: actorId }, { merge: true });
  batch.set(db.collection("hrProfiles").doc(uid), { status: "OFFBOARDED", archived: true, offboardedAt: now, updatedAt: now }, { merge: true });
  if (staff.role === "technician") {
    batch.set(db.collection("technicians").doc(uid), { status: "OFFBOARDED", suspended: true, available: false, onDuty: false, archived: true, updatedAt: now }, { merge: true });
  }
  await batch.commit();
  await audit(actorId, actorRole, "ADMIN_OFFBOARD_STAFF", uid, { role: staff.role, reason, refreshTokensRevoked: true, recordsArchived: true });
  return { success: true, uid, status: "OFFBOARDED", refreshTokensRevoked: true, recordsArchived: true };
});

function serializeDate(value: any) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  return null;
}

export const adminGetHrCommandSnapshot = onCall(CALLABLE_OPTIONS, async (request) => {
  await requireHrReader(request);
  const now = new Date();
  const cutoff = new Date(now.getTime() - 35 * 86400000);
  const [usersSnap, hrSnap, privateSnap, leaveSnap, documentSnap, shiftsSnap, adjustmentsSnap, payrollSnap] = await Promise.all([
    db.collection("users").where("isStaff", "==", true).limit(500).get(),
    db.collection("hrProfiles").limit(500).get(),
    db.collection("private_hr_profiles").limit(500).get(),
    db.collection("staff_leave_requests").orderBy("createdAt", "desc").limit(200).get(),
    db.collection("hr_document_records").orderBy("uploadedAt", "desc").limit(500).get(),
    db.collection("staff_shifts").where("clockInTime", ">=", admin.firestore.Timestamp.fromDate(cutoff)).limit(1000).get(),
    db.collection("staff_attendance_adjustments").limit(500).get(),
    db.collection("payroll").limit(1000).get(),
  ]);

  const hrById = new Map(hrSnap.docs.map((doc) => [doc.id, doc.data()]));
  const privateById = new Map(privateSnap.docs.map((doc) => [doc.id, doc.data()]));
  const staff = usersSnap.docs
    .map((doc) => {
      const user = doc.data();
      const hr = hrById.get(doc.id) || {};
      const privateHr = privateById.get(doc.id) || {};
      return {
        id: doc.id,
        displayName: user.displayName || user.fullName || "Staff",
        email: user.email || null,
        phoneNumber: user.phoneNumber || user.phone || null,
        role: user.role || null,
        department: user.department || hr.department || null,
        jobTitle: hr.jobTitle || null,
        specialization: user.specialization || user.trade || hr.specialization || null,
        status: user.status || "UNKNOWN",
        onboardingStage: user.onboardingStage || (user.onboardingComplete ? "ACTIVE" : "INVITED"),
        onboardingComplete: user.onboardingComplete === true,
        onboardingChecklist: user.onboardingChecklist || {},
        employeeId: privateHr.employeeId || null,
        joiningDate: hr.joiningDate || privateHr.joiningDate || null,
        contractEndDate: hr.contractEndDate || privateHr.contractEndDate || null,
        visaExpiryDate: privateHr.visaExpiryDate || null,
        salaryGrade: privateHr.salaryPackage?.salaryGrade || null,
        performanceScore: user.performanceScore ?? null,
        invitationStatus: user.invitationStatus || null,
        lastInvitationAt: serializeDate(user.lastInvitationAt),
      };
    })
    .filter((entry) => STAFF_ROLES.has(clean(entry.role).toLowerCase()))
    .sort((a, b) => clean(a.displayName).localeCompare(clean(b.displayName)));

  const leaves = leaveSnap.docs.map((doc) => ({ id: doc.id, ...doc.data(), createdAt: serializeDate(doc.data().createdAt), decidedAt: serializeDate(doc.data().decidedAt) }));
  const documents = documentSnap.docs.map((doc) => ({ id: doc.id, ...doc.data(), uploadedAt: serializeDate(doc.data().uploadedAt) }));
  const shifts = shiftsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data(), clockInTime: serializeDate(doc.data().clockInTime), clockOutTime: serializeDate(doc.data().clockOutTime) }));
  const adjustments = adjustmentsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const payroll = payrollSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const activeStaff = staff.filter((member) => member.status === "ACTIVE").length;
  const pendingInvitations = staff.filter((member) => member.onboardingStage === "INVITED" || member.invitationStatus === "QUEUED").length;
  const documentsExpiring = staff.filter((member) => {
    const date = member.contractEndDate || member.visaExpiryDate;
    if (!date) return false;
    const delta = new Date(`${date}T00:00:00Z`).getTime() - now.getTime();
    return delta >= 0 && delta <= 45 * 86400000;
  }).length;
  const pendingLeave = leaves.filter((record: any) => clean(record.status).toUpperCase() === "PENDING").length;
  const todayAdjustmentMap = new Map(adjustments.filter((record: any) => record.date === todayKey).map((record: any) => [record.staffId, record.action]));
  const todayShiftStaff = new Set(shifts.filter((record: any) => clean(record.shiftDate) === todayKey).map((record: any) => record.staffId));
  const absentToday = staff.filter((member) => member.status === "ACTIVE" && !todayShiftStaff.has(member.id) && !["ON_LEAVE", "SICK_LEAVE", "EXCUSED"].includes(clean(todayAdjustmentMap.get(member.id)).toUpperCase())).length;
  const payrollPending = payroll.filter((record: any) => !["paid", "PAID", "settled", "SETTLED"].includes(clean(record.status))).length;

  return {
    success: true,
    generatedAt: now.toISOString(),
    staff,
    leaves,
    documents,
    shifts,
    adjustments,
    payroll,
    summary: {
      totalStaff: staff.length,
      activeStaff,
      pendingInvitations,
      documentsExpiring,
      pendingLeave,
      absentToday,
      payrollPending,
    },
  };
});
