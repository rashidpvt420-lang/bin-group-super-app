import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const FULL_ADMIN_ROLES = new Set(["admin", "super_admin", "ceo"]);
const HR_MANAGER_ROLES = new Set(["hr_admin", "hr_manager"]);
const HR_READER_ROLES = new Set(["hr_admin", "hr_manager", "hr_staff"]);
const TECHNICIAN_DIRECTORY_ROLES = new Set([
  "operations_admin",
  "operations_manager",
  "dispatcher",
  "hr_admin",
  "hr_manager",
  "hr_staff",
]);
const STAFF_ROLES = new Set([
  "technician", "manager", "operations_admin", "hr_admin", "support_admin",
  "hr_staff", "hr_manager", "finance_staff", "dispatcher", "admin_assistant",
  "account_manager", "operations_manager", "finance_admin",
]);
const ONBOARDING_STAGES = new Set([
  "INVITED",
  "EMAIL_VERIFIED",
  "PROFILE_COMPLETE",
  "DOCUMENTS_COMPLETE",
  "CONTRACT_COMPLETE",
  "DEVICE_READY",
  "ACTIVE",
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

function normalizeStringArray(value: unknown, max = 12) {
  return Array.isArray(value)
    ? [...new Set(value.map((entry) => clean(entry)).filter(Boolean))].slice(0, max)
    : [];
}

function serializeDate(value: any) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  return null;
}

function roleFromToken(token: any) {
  return clean(token?.role || token?.userRole || token?.primaryRole).toLowerCase();
}

function isFullAdminToken(token: any) {
  const role = roleFromToken(token);
  return token?.suspended !== true && (
    FULL_ADMIN_ROLES.has(role) || token?.admin === true || token?.isAdmin === true ||
    token?.super_admin === true || token?.superAdmin === true || token?.ceo === true
  );
}

async function requireActiveActor(request: any) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authenticated staff session required.");
  const token = request.auth.token || {};
  if (token?.suspended === true) throw new HttpsError("permission-denied", "Suspended accounts cannot use staff operations.");
  const actor = await admin.auth().getUser(request.auth.uid);
  if (actor.disabled) throw new HttpsError("permission-denied", "Disabled accounts cannot use staff operations.");
  return {
    actorId: request.auth.uid,
    actorRole: roleFromToken(token) || (isFullAdminToken(token) ? "admin" : ""),
    token,
  };
}

async function requireHrReader(request: any) {
  const actor = await requireActiveActor(request);
  if (!isFullAdminToken(actor.token) && !HR_READER_ROLES.has(actor.actorRole)) {
    throw new HttpsError("permission-denied", "HR access is required.");
  }
  return { ...actor, canManageLifecycle: isFullAdminToken(actor.token) || HR_MANAGER_ROLES.has(actor.actorRole) };
}

async function requireHrManager(request: any) {
  const actor = await requireActiveActor(request);
  if (!isFullAdminToken(actor.token) && !HR_MANAGER_ROLES.has(actor.actorRole)) {
    throw new HttpsError("permission-denied", "Founder/Admin or HR Manager authority is required.");
  }
  return actor;
}

async function requireTechnicianDirectoryReader(request: any) {
  const actor = await requireActiveActor(request);
  if (!isFullAdminToken(actor.token) && !TECHNICIAN_DIRECTORY_ROLES.has(actor.actorRole)) {
    throw new HttpsError("permission-denied", "Operations or HR technician-directory access is required.");
  }
  return {
    ...actor,
    canManageLifecycle: isFullAdminToken(actor.token) || HR_MANAGER_ROLES.has(actor.actorRole),
  };
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
  if (!userSnap.exists) throw new HttpsError("not-found", "Staff profile was not found.");
  const data = userSnap.data() || {};
  const role = clean(data.role || data.userRole || data.primaryRole).toLowerCase();
  if (data.isStaff !== true || !STAFF_ROLES.has(role) || FULL_ADMIN_ROLES.has(role)) {
    throw new HttpsError("failed-precondition", "Target is not a provisioned staff identity.");
  }
  return {
    authUser,
    userSnap,
    data,
    role,
    hr: hrSnap.data() || {},
    privateHr: privateSnap.data() || {},
    access: accessSnap.data() || {},
    technician: technicianSnap.data() || {},
  };
}

function legacyInvitationState(authUser: admin.auth.UserRecord, user: any, hr: any, privateHr: any) {
  const status = clean(user.status).toUpperCase();
  if (authUser.disabled || status === "OFFBOARDED") return status === "OFFBOARDED" ? "OFFBOARDED" : "SUSPENDED";
  if (status === "SUSPENDED") return "SUSPENDED";
  const docsComplete = Boolean(privateHr?.employeeId && privateHr?.emiratesId);
  const contractComplete = Boolean(privateHr?.contractEndDate || hr?.employmentType);
  if (!authUser.emailVerified) return "INVITED";
  if (!docsComplete) return "EMAIL_VERIFIED";
  if (!contractComplete) return "DOCUMENTS_COMPLETE";
  return "ACTIVE";
}

function lifecycleState(staff: Awaited<ReturnType<typeof loadStaff>>) {
  const status = clean(staff.data.status).toUpperCase();
  if (staff.authUser.disabled || status === "SUSPENDED" || status === "OFFBOARDED") {
    return status === "OFFBOARDED" ? "OFFBOARDED" : "SUSPENDED";
  }
  const explicitStage = clean(staff.data.onboardingStage).toUpperCase();
  if (ONBOARDING_STAGES.has(explicitStage)) return explicitStage;
  return legacyInvitationState(staff.authUser, staff.data, staff.hr, staff.privateHr);
}

function onboardingState(role: string, emailVerified: boolean, current: any, incoming: any) {
  const checklist = {
    profileComplete: incoming.profileComplete === undefined ? current.profileComplete === true : Boolean(incoming.profileComplete),
    documentsComplete: incoming.documentsComplete === undefined ? current.documentsComplete === true : Boolean(incoming.documentsComplete),
    contractComplete: incoming.contractComplete === undefined ? current.contractComplete === true : Boolean(incoming.contractComplete),
    deviceReady: role === "technician"
      ? (incoming.deviceReady === undefined ? current.deviceReady === true : Boolean(incoming.deviceReady))
      : true,
    activationApproved: incoming.activationApproved === undefined ? current.activationApproved === true : Boolean(incoming.activationApproved),
  };
  let stage = "INVITED";
  if (emailVerified) stage = "EMAIL_VERIFIED";
  if (emailVerified && checklist.profileComplete) stage = "PROFILE_COMPLETE";
  if (emailVerified && checklist.profileComplete && checklist.documentsComplete) stage = "DOCUMENTS_COMPLETE";
  if (emailVerified && checklist.profileComplete && checklist.documentsComplete && checklist.contractComplete) stage = "CONTRACT_COMPLETE";
  if (role === "technician" && stage === "CONTRACT_COMPLETE" && checklist.deviceReady) stage = "DEVICE_READY";
  const prerequisitesComplete = emailVerified && checklist.profileComplete && checklist.documentsComplete && checklist.contractComplete && checklist.deviceReady;
  if (prerequisitesComplete && checklist.activationApproved) stage = "ACTIVE";
  return { checklist, stage, active: stage === "ACTIVE" };
}

function staffLifecycleRow(staff: Awaited<ReturnType<typeof loadStaff>>) {
  const state = lifecycleState(staff);
  return {
    uid: staff.userSnap.id,
    displayName: staff.data.displayName || staff.data.fullName || staff.authUser.displayName || "Staff",
    email: staff.data.email || staff.authUser.email || "",
    phoneNumber: staff.data.phoneNumber || staff.data.phone || "",
    role: staff.role,
    department: staff.data.department || staff.hr.department || "",
    specialization: staff.data.specialization || staff.data.trade || staff.hr.specialization || "",
    status: clean(staff.data.status, staff.authUser.disabled ? "SUSPENDED" : "ACTIVE").toUpperCase(),
    emailVerified: staff.authUser.emailVerified,
    authDisabled: staff.authUser.disabled,
    modules: Array.isArray(staff.access.modules) ? staff.access.modules : (Array.isArray(staff.data.staffModules) ? staff.data.staffModules : []),
    joiningDate: staff.hr.joiningDate || null,
    contractEndDate: staff.privateHr.contractEndDate || staff.hr.contractEndDate || null,
    employmentType: staff.hr.employmentType || staff.privateHr.employmentType || null,
    shiftName: staff.hr.shiftName || null,
    workingHours: staff.hr.workingHours || null,
    offDay: staff.hr.offDay || null,
    employeeIdConfigured: Boolean(staff.privateHr.employeeId),
    emiratesIdConfigured: Boolean(staff.privateHr.emiratesId),
    salaryConfigured: Boolean(staff.privateHr.salaryPackage && Number(staff.privateHr.salaryPackage.basicSalary || 0) > 0),
    lifecycleState: state,
    onboardingStage: clean(staff.data.onboardingStage, state),
    onboardingChecklist: staff.data.onboardingChecklist || {},
    onboardingComplete: staff.data.onboardingComplete === true || state === "ACTIVE",
    invitationStatus: staff.data.invitationStatus || null,
    lastLogin: serializeDate(staff.data.lastLogin),
  };
}

export const adminGetStaffLifecycle = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const actor = await requireHrReader(request);
  const users = await db.collection("users").where("isStaff", "==", true).limit(500).get();
  const rows = await Promise.all(users.docs.map(async (doc) => {
    try {
      const staff = await loadStaff(doc.id);
      return staffLifecycleRow(staff);
    } catch {
      return null;
    }
  }));
  return { success: true, staff: rows.filter(Boolean), canManageLifecycle: actor.canManageLifecycle };
});

export const adminGetStaffDetails = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const actor = await requireHrReader(request);
  const uid = clean(request.data?.uid);
  const staff = await loadStaff(uid);
  const includePrivate = actor.canManageLifecycle;

  const [attendanceSnap, leaveSnap, documentSnap, payrollSnap] = await Promise.all([
    db.collection("staffAttendance").where("uid", "==", uid).limit(120).get().catch(() => null),
    db.collection("staffLeaveRequests").where("uid", "==", uid).limit(120).get().catch(() => null),
    db.collection("staffHrDocuments").where("uid", "==", uid).limit(120).get().catch(() => null),
    includePrivate ? db.collection("payroll").limit(500).get().catch(() => null) : Promise.resolve(null),
  ]);

  const mapDocs = (snapshot: any) => snapshot ? snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) : [];
  const attendance = mapDocs(attendanceSnap)
    .sort((a: any, b: any) => clean(b.workDate).localeCompare(clean(a.workDate)))
    .slice(0, 60)
    .map((entry: any) => ({
      id: entry.id,
      workDate: entry.workDate || null,
      status: entry.status || null,
      checkIn: entry.checkIn || null,
      checkOut: entry.checkOut || null,
      note: entry.note || null,
    }));
  const leaveRequests = mapDocs(leaveSnap)
    .sort((a: any, b: any) => String(serializeDate(b.createdAt) || "").localeCompare(String(serializeDate(a.createdAt) || "")))
    .slice(0, 60)
    .map((entry: any) => ({
      id: entry.id,
      leaveType: entry.leaveType || null,
      startDate: entry.startDate || null,
      endDate: entry.endDate || null,
      reason: entry.reason || null,
      status: entry.status || null,
      createdAt: serializeDate(entry.createdAt),
      reviewedAt: serializeDate(entry.reviewedAt),
    }));
  const documents = mapDocs(documentSnap)
    .slice(0, 100)
    .map((entry: any) => ({
      id: entry.id,
      documentType: entry.documentType || null,
      fileName: entry.fileName || null,
      expiryDate: entry.expiryDate || null,
      status: entry.status || null,
      createdAt: serializeDate(entry.createdAt),
    }));
  const payroll = includePrivate
    ? mapDocs(payrollSnap)
      .filter((entry: any) => [entry.uid, entry.staffId, entry.employeeId, entry.techId, entry.technicianId].map(clean).includes(uid))
      .slice(0, 100)
      .map((entry: any) => ({
        id: entry.id,
        month: entry.month || entry.period || null,
        amount: numberOrZero(entry.amount || entry.netPay || entry.netSalary),
        status: entry.status || null,
        createdAt: serializeDate(entry.createdAt),
      }))
    : [];

  return {
    success: true,
    canManageLifecycle: actor.canManageLifecycle,
    privateFieldsIncluded: includePrivate,
    staff: {
      ...staffLifecycleRow(staff),
      jobTitle: staff.hr.jobTitle || null,
      probationEndDate: staff.hr.probationEndDate || null,
      employeeId: includePrivate ? staff.privateHr.employeeId || null : null,
      emiratesId: includePrivate ? staff.privateHr.emiratesId || null : null,
      passportNumber: includePrivate ? staff.privateHr.passportNumber || null : null,
      visaExpiryDate: includePrivate ? staff.privateHr.visaExpiryDate || null : null,
      emergencyContact: includePrivate ? staff.privateHr.emergencyContact || null : null,
      salaryPackage: includePrivate ? staff.privateHr.salaryPackage || null : null,
      primaryEmirate: staff.role === "technician" ? staff.technician.primaryEmirate || staff.technician.emirate || null : null,
      emiratesCovered: staff.role === "technician" ? normalizeStringArray(staff.technician.emiratesCovered) : [],
      maxConcurrentJobs: staff.role === "technician" ? boundedInt(staff.technician.maxConcurrentJobs, 3, 1, 10) : null,
      emergencyEligible: staff.role === "technician" ? Boolean(staff.technician.emergencyEligible) : false,
      onDuty: staff.role === "technician" ? Boolean(staff.technician.onDuty) : false,
      available: staff.role === "technician" ? Boolean(staff.technician.available) : false,
      currentJobCount: staff.role === "technician" ? Number(staff.technician.currentJobCount || 0) : 0,
      performanceScore: staff.data.performanceScore ?? null,
    },
    attendance,
    leaveRequests,
    documents,
    payroll,
  };
});

export const adminGetTechnicianOperationsDirectory = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const actor = await requireTechnicianDirectoryReader(request);
  const [usersSnap, techniciansSnap] = await Promise.all([
    db.collection("users").where("isStaff", "==", true).limit(500).get(),
    db.collection("technicians").limit(500).get(),
  ]);
  const techniciansById = new Map(techniciansSnap.docs.map((doc) => [doc.id, doc.data()]));
  const technicians = usersSnap.docs.flatMap((doc) => {
    const user = doc.data();
    const role = clean(user.role || user.userRole || user.primaryRole).toLowerCase();
    if (role !== "technician") return [];
    const technician: any = techniciansById.get(doc.id) || {};
    return [{
      uid: doc.id,
      displayName: user.displayName || user.fullName || technician.displayName || "Technician",
      email: actor.canManageLifecycle ? user.email || null : null,
      phoneNumber: user.phoneNumber || user.phone || technician.phoneNumber || null,
      role: "technician",
      status: clean(user.status || technician.status, "ACTIVE").toUpperCase(),
      lifecycleState: clean(user.onboardingStage, user.onboardingComplete === true ? "ACTIVE" : "ONBOARDING"),
      onboardingComplete: user.onboardingComplete === true,
      specialization: user.specialization || user.trade || technician.specialization || technician.trade || "General Maintenance",
      department: user.department || technician.department || "Technical",
      primaryEmirate: technician.primaryEmirate || technician.emirate || null,
      emiratesCovered: normalizeStringArray(technician.emiratesCovered),
      maxConcurrentJobs: boundedInt(technician.maxConcurrentJobs, 3, 1, 10),
      emergencyEligible: Boolean(technician.emergencyEligible),
      onDuty: Boolean(technician.onDuty),
      available: Boolean(technician.available),
      currentJobCount: Number(technician.currentJobCount || 0),
    }];
  });
  return { success: true, technicians, canManageLifecycle: actor.canManageLifecycle };
});

function preservedText(incoming: unknown, existing: unknown, fallback = "") {
  return incoming === undefined ? clean(existing, fallback) : clean(incoming, fallback);
}

function preservedNullableText(incoming: unknown, existing: unknown) {
  return incoming === undefined ? (clean(existing) || null) : (clean(incoming) || null);
}

function preservedNumber(incoming: unknown, existing: unknown) {
  return incoming === undefined ? numberOrZero(existing) : numberOrZero(incoming);
}

export const adminUpdateStaffProfile = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const { actorId, actorRole } = await requireHrManager(request);
  const payload = request.data || {};
  const uid = clean(payload.uid);
  const staff = await loadStaff(uid);
  if (payload.role && clean(payload.role).toLowerCase() !== staff.role) {
    throw new HttpsError("failed-precondition", "Role changes must use Staff Access so module ceilings and claims stay synchronized.");
  }

  const displayName = preservedText(payload.displayName, staff.data.displayName || staff.authUser.displayName, "Staff");
  const phoneNumber = preservedText(payload.phoneNumber, staff.data.phoneNumber || staff.data.phone);
  const department = preservedText(payload.department, staff.data.department || staff.hr.department, staff.role === "technician" ? "Technical" : "Operations");
  const specialization = preservedText(payload.specialization, staff.data.specialization || staff.data.trade || staff.hr.specialization, "General");
  const now = FieldValue.serverTimestamp();
  const previousSalary = staff.privateHr.salaryPackage || {};

  if (displayName !== staff.authUser.displayName) await admin.auth().updateUser(uid, { displayName });

  const batch = db.batch();
  batch.set(db.collection("users").doc(uid), {
    displayName,
    fullName: displayName,
    phoneNumber,
    phone: phoneNumber,
    department,
    specialization,
    trade: specialization,
    updatedAt: now,
  }, { merge: true });
  batch.set(db.collection("hrProfiles").doc(uid), {
    uid,
    displayName,
    role: staff.role,
    department,
    specialization,
    jobTitle: preservedNullableText(payload.jobTitle, staff.hr.jobTitle),
    joiningDate: preservedNullableText(payload.joiningDate, staff.hr.joiningDate),
    probationEndDate: preservedNullableText(payload.probationEndDate, staff.hr.probationEndDate),
    contractEndDate: preservedNullableText(payload.contractEndDate, staff.hr.contractEndDate || staff.privateHr.contractEndDate),
    employmentType: preservedText(payload.employmentType, staff.hr.employmentType || staff.privateHr.employmentType, "full_time"),
    shiftName: preservedText(payload.shiftName, staff.hr.shiftName, "Day Shift"),
    workingHours: preservedText(payload.workingHours, staff.hr.workingHours, "9 AM - 4 PM"),
    offDay: preservedText(payload.offDay, staff.hr.offDay, "Sunday"),
    updatedAt: now,
  }, { merge: true });
  batch.set(db.collection("private_hr_profiles").doc(uid), {
    employeeId: preservedNullableText(payload.employeeId, staff.privateHr.employeeId),
    emiratesId: preservedNullableText(payload.emiratesId, staff.privateHr.emiratesId),
    passportNumber: preservedNullableText(payload.passportNumber, staff.privateHr.passportNumber),
    visaExpiryDate: preservedNullableText(payload.visaExpiryDate, staff.privateHr.visaExpiryDate),
    contractEndDate: preservedNullableText(payload.contractEndDate, staff.privateHr.contractEndDate || staff.hr.contractEndDate),
    emergencyContact: {
      name: preservedNullableText(payload.emergencyContactName, staff.privateHr.emergencyContact?.name),
      relationship: preservedNullableText(payload.emergencyContactRelationship, staff.privateHr.emergencyContact?.relationship),
      phone: preservedNullableText(payload.emergencyContactPhone, staff.privateHr.emergencyContact?.phone),
    },
    salaryPackage: {
      basicSalary: preservedNumber(payload.basicSalary, previousSalary.basicSalary),
      housingAllowance: preservedNumber(payload.housingAllowance, previousSalary.housingAllowance),
      transportAllowance: preservedNumber(payload.transportAllowance, previousSalary.transportAllowance),
      foodAllowance: preservedNumber(payload.foodAllowance, previousSalary.foodAllowance),
      otherAllowance: preservedNumber(payload.otherAllowance, previousSalary.otherAllowance),
      salaryPaymentDay: payload.salaryPaymentDay === undefined
        ? boundedInt(previousSalary.salaryPaymentDay, 1, 1, 31)
        : boundedInt(payload.salaryPaymentDay, 1, 1, 31),
      salaryGrade: preservedNullableText(payload.salaryGrade, previousSalary.salaryGrade),
      overtimeEligible: payload.overtimeEligible === undefined ? previousSalary.overtimeEligible !== false : payload.overtimeEligible !== false,
      companyAccommodationProvided: payload.companyAccommodationProvided === undefined ? Boolean(previousSalary.companyAccommodationProvided) : Boolean(payload.companyAccommodationProvided),
      companyTransportProvided: payload.companyTransportProvided === undefined ? Boolean(previousSalary.companyTransportProvided) : Boolean(payload.companyTransportProvided),
      companyMedicalInsuranceProvided: payload.companyMedicalInsuranceProvided === undefined ? previousSalary.companyMedicalInsuranceProvided !== false : payload.companyMedicalInsuranceProvided !== false,
    },
    accessClassification: "PRIVATE_HR_SERVER_ONLY",
    updatedAt: now,
    updatedBy: actorId,
  }, { merge: true });
  if (staff.role === "technician") {
    batch.set(db.collection("technicians").doc(uid), {
      displayName,
      phoneNumber,
      specialization,
      department,
      emiratesCovered: payload.emiratesCovered === undefined ? normalizeStringArray(staff.technician.emiratesCovered) : normalizeStringArray(payload.emiratesCovered),
      primaryEmirate: preservedNullableText(payload.primaryEmirate, staff.technician.primaryEmirate || staff.technician.emirate),
      maxConcurrentJobs: payload.maxConcurrentJobs === undefined
        ? boundedInt(staff.technician.maxConcurrentJobs, 3, 1, 10)
        : boundedInt(payload.maxConcurrentJobs, 3, 1, 10),
      emergencyEligible: payload.emergencyEligible === undefined ? Boolean(staff.technician.emergencyEligible) : Boolean(payload.emergencyEligible),
      updatedAt: now,
    }, { merge: true });
  }
  batch.set(db.collection("audit_logs").doc(), {
    actorId,
    actorRole,
    action: "ADMIN_UPDATE_STAFF_PROFILE",
    targetType: "users",
    targetId: uid,
    metadata: { role: staff.role, privateHrSeparated: true, omittedFieldsPreserved: true },
    createdAt: now,
  });
  await batch.commit();
  return { success: true, uid, role: staff.role };
});

export const adminUpdateStaffOnboarding = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const { actorId, actorRole } = await requireHrManager(request);
  const uid = clean(request.data?.uid);
  const staff = await loadStaff(uid);
  if (staff.authUser.disabled || ["SUSPENDED", "OFFBOARDED"].includes(clean(staff.data.status).toUpperCase())) {
    throw new HttpsError("failed-precondition", "Suspended or offboarded staff cannot be activated through onboarding.");
  }
  const state = onboardingState(staff.role, staff.authUser.emailVerified, staff.data.onboardingChecklist || {}, request.data || {});
  const now = FieldValue.serverTimestamp();
  const status = state.active ? "ACTIVE" : state.stage;
  const previousClaims = staff.authUser.customClaims || {};
  const nextClaims = { ...previousClaims, suspended: !state.active };
  const batch = db.batch();
  batch.set(db.collection("users").doc(uid), {
    onboardingChecklist: state.checklist,
    onboardingStage: state.stage,
    onboardingComplete: state.active,
    emailVerified: staff.authUser.emailVerified,
    status,
    suspended: !state.active,
    updatedAt: now,
    updatedBy: actorId,
  }, { merge: true });
  batch.set(db.collection("hrProfiles").doc(uid), {
    onboardingStage: state.stage,
    onboardingComplete: state.active,
    status,
    suspended: !state.active,
    updatedAt: now,
  }, { merge: true });
  batch.set(db.collection("staffAccess").doc(uid), {
    onboardingStage: state.stage,
    status,
    active: state.active,
    suspended: !state.active,
    updatedAt: now,
    updatedBy: actorId,
  }, { merge: true });
  if (staff.role === "technician") {
    batch.set(db.collection("technicians").doc(uid), {
      onboardingStage: state.stage,
      onboardingComplete: state.active,
      status,
      suspended: !state.active,
      approvalStatus: state.active ? "APPROVED" : "PENDING",
      available: state.active ? Boolean(staff.technician.available ?? true) : false,
      onDuty: state.active ? Boolean(staff.technician.onDuty) : false,
      updatedAt: now,
    }, { merge: true });
  }
  batch.set(db.collection("audit_logs").doc(), {
    actorId,
    actorRole,
    action: "ADMIN_UPDATE_STAFF_ONBOARDING",
    targetType: "users",
    targetId: uid,
    metadata: {
      role: staff.role,
      stage: state.stage,
      checklist: state.checklist,
      emailVerified: staff.authUser.emailVerified,
      portalAccessActive: state.active,
      refreshTokensRevoked: true,
    },
    createdAt: now,
  });

  if (state.active) {
    await batch.commit();
    await admin.auth().setCustomUserClaims(uid, nextClaims);
    await admin.auth().revokeRefreshTokens(uid);
  } else {
    await admin.auth().setCustomUserClaims(uid, nextClaims);
    await admin.auth().revokeRefreshTokens(uid);
    await batch.commit();
  }

  return {
    success: true,
    uid,
    stage: state.stage,
    active: state.active,
    emailVerified: staff.authUser.emailVerified,
    checklist: state.checklist,
    refreshTokensRevoked: true,
  };
});

export const adminOffboardStaff = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const { actorId, actorRole } = await requireHrManager(request);
  const uid = clean(request.data?.uid);
  const reason = clean(request.data?.reason, "Administrative offboarding");
  if (uid === actorId) throw new HttpsError("failed-precondition", "You cannot offboard your own account.");
  const staff = await loadStaff(uid);
  const previousClaims = staff.authUser.customClaims || {};
  const now = FieldValue.serverTimestamp();

  await admin.auth().setCustomUserClaims(uid, { ...previousClaims, suspended: true, offboarded: true });
  await admin.auth().updateUser(uid, { disabled: true });
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
  batch.set(db.collection("hrProfiles").doc(uid), { status: "OFFBOARDED", archived: true, offboardedAt: now, offboardingReason: reason, updatedAt: now }, { merge: true });
  if (staff.role === "technician") batch.set(db.collection("technicians").doc(uid), { status: "OFFBOARDED", suspended: true, available: false, onDuty: false, archived: true, updatedAt: now }, { merge: true });
  batch.set(db.collection("audit_logs").doc(), {
    actorId,
    actorRole,
    action: "ADMIN_OFFBOARD_STAFF",
    targetType: "users",
    targetId: uid,
    metadata: { role: staff.role, reason, authDisabled: true, refreshTokensRevoked: true, recordsPreserved: true },
    createdAt: now,
  });
  await batch.commit();
  return { success: true, uid, status: "OFFBOARDED", recordsPreserved: true };
});

export const adminResendStaffInvitation = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const { actorId, actorRole } = await requireHrManager(request);
  const uid = clean(request.data?.uid);
  const staff = await loadStaff(uid);
  const email = clean(staff.authUser.email || staff.data.email).toLowerCase();
  if (!email) throw new HttpsError("failed-precondition", "Staff email is missing.");
  if (staff.authUser.disabled || clean(staff.data.status).toUpperCase() === "OFFBOARDED") {
    throw new HttpsError("failed-precondition", "Suspended or offboarded staff cannot receive an invitation.");
  }

  const mainAppUrl = clean(process.env.MAIN_APP_URL, "https://bin-group-57c60.web.app").replace(/\/$/, "");
  const adminAppUrl = clean(process.env.ADMIN_APP_URL, "https://bin-group-admin-panel.web.app").replace(/\/$/, "");
  const loginUrl = staff.role === "technician" ? `${mainAppUrl}/login?role=technician` : `${adminAppUrl}/login`;
  const actionCodeSettings = { url: loginUrl, handleCodeInApp: false };
  const [verificationLink, passwordResetLink] = await Promise.all([
    admin.auth().generateEmailVerificationLink(email, actionCodeSettings),
    admin.auth().generatePasswordResetLink(email, actionCodeSettings),
  ]);
  const displayName = clean(staff.data.displayName || staff.data.fullName || staff.authUser.displayName, "Staff");
  const now = FieldValue.serverTimestamp();
  const mailRef = db.collection("mail").doc();
  const batch = db.batch();
  batch.set(mailRef, {
    to: [email],
    message: {
      subject: `BIN GROUP ${staff.role.replace(/_/g, " ")} account invitation`,
      text: `Hello ${displayName},\n\nVerify your email: ${verificationLink}\nSet your private password: ${passwordResetLink}\nOpen your portal: ${loginUrl}\n\nNever share passwords, OTP codes, or verification links.`,
      from: "BIN GROUP <ceo@bin-groups.com>",
      replyTo: "BIN GROUP Admin <ceo@bin-groups.com>",
    },
    type: "staff_account_invitation_resend",
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
  batch.set(db.collection("audit_logs").doc(), {
    actorId,
    actorRole,
    action: "ADMIN_RESEND_STAFF_INVITATION",
    targetType: "users",
    targetId: uid,
    metadata: { role: staff.role, mailId: mailRef.id },
    createdAt: now,
  });
  await batch.commit();
  return { success: true, uid, invitationQueued: true };
});
