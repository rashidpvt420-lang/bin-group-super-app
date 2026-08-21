import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import type * as FirebaseFirestore from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const REGION = 'europe-west3';

const STAFF_ROLES = new Set([
  'technician', 'manager', 'operations_admin', 'hr_admin', 'support_admin', 'hr_staff',
  'hr_manager', 'finance_staff', 'dispatcher', 'admin_assistant', 'account_manager',
  'operations_manager', 'finance_admin',
]);
const HR_MANAGER_ROLES = new Set(['admin', 'super_admin', 'ceo', 'hr_admin', 'hr_manager']);
const ATTENDANCE_STATUSES = new Set(['PRESENT', 'ABSENT', 'LEAVE', 'SICK', 'REMOTE', 'OFF']);
const LEAVE_TYPES = new Set(['ANNUAL', 'SICK', 'EMERGENCY', 'UNPAID', 'COMPASSIONATE', 'OTHER']);
const DOCUMENT_TYPES = new Set(['CONTRACT', 'EMIRATES_ID', 'PASSPORT', 'VISA', 'MEDICAL', 'CERTIFICATION', 'WARNING', 'LICENSE', 'PAYROLL', 'OTHER']);

const text = (value: unknown) => String(value ?? '').trim();
const lower = (value: unknown) => text(value).toLowerCase();
const upper = (value: unknown) => text(value).toUpperCase();
const finite = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

function actorRole(token: any) {
  return lower(token?.role || token?.userRole || token?.primaryRole || (token?.ceo ? 'ceo' : ''));
}

function hasHrManagerAccess(request: any) {
  const token = request.auth?.token || {};
  const role = actorRole(token);
  return Boolean(
    request.auth?.uid && token.suspended !== true && (
      HR_MANAGER_ROLES.has(role) || token.admin === true || token.isAdmin === true ||
      token.super_admin === true || token.superAdmin === true || token.ceo === true
    )
  );
}

async function requireHrManager(request: any) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Admin or HR manager session required.');
  if (!hasHrManagerAccess(request)) throw new HttpsError('permission-denied', 'HR manager access required.');
  const actor = await admin.auth().getUser(request.auth.uid);
  if (actor.disabled) throw new HttpsError('permission-denied', 'Disabled administrators cannot manage staff.');
  return { actorId: request.auth.uid, actorRole: actorRole(request.auth.token) || 'admin' };
}

async function requireStaff(uid: string) {
  if (!uid) throw new HttpsError('invalid-argument', 'Staff UID is required.');
  const [authUser, userSnap, accessSnap] = await Promise.all([
    admin.auth().getUser(uid),
    db.collection('users').doc(uid).get(),
    db.collection('staffAccess').doc(uid).get(),
  ]);
  const user = userSnap.data() || {};
  const role = lower(user.role || user.userRole || user.primaryRole);
  if (!userSnap.exists || user.isStaff !== true || !STAFF_ROLES.has(role) || !accessSnap.exists) {
    throw new HttpsError('failed-precondition', 'Target identity is not a provisioned BIN GROUP staff account.');
  }
  const claims = authUser.customClaims || {};
  if (claims.admin === true || claims.super_admin === true || claims.superAdmin === true || claims.ceo === true) {
    throw new HttpsError('permission-denied', 'Privileged Founder/Admin identities are not managed through the staff lifecycle.');
  }
  return { authUser, user, role };
}

function timestampMillis(value: any) {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function serialize(value: any): any {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serialize(child)]));
  }
  return value;
}

function recentDocs(snapshot: FirebaseFirestore.QuerySnapshot, limitCount = 50) {
  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...serialize(doc.data()) }))
    .sort((a: any, b: any) => timestampMillis(b.updatedAt || b.createdAt || b.date) - timestampMillis(a.updatedAt || a.createdAt || a.date))
    .slice(0, limitCount);
}

function daysBetween(start: string, end: string) {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    throw new HttpsError('invalid-argument', 'Leave dates are invalid.');
  }
  return Math.floor((endMs - startMs) / 86_400_000) + 1;
}

async function writeAudit(actor: { actorId: string; actorRole: string }, action: string, uid: string, metadata: Record<string, any> = {}) {
  await db.collection('audit_logs').add({
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    action,
    targetType: 'staff',
    targetId: uid,
    metadata,
    createdAt: FieldValue.serverTimestamp(),
  });
}

function safeProfile(user: any, hr: any, privateHr: any) {
  return {
    displayName: text(user.displayName || user.fullName),
    email: lower(user.email),
    phoneNumber: text(user.phoneNumber || user.phone),
    role: lower(user.role),
    status: upper(user.status || 'ACTIVE'),
    department: text(user.department || hr.department),
    specialization: text(user.specialization || hr.specialization),
    emirate: text(user.emirate || hr.emirate),
    employmentType: text(hr.employmentType || privateHr.employmentType || 'full_time'),
    employeeId: text(privateHr.employeeId),
    joiningDate: text(hr.joiningDate || privateHr.joiningDate),
    contractEndDate: text(privateHr.contractEndDate),
    shiftName: text(hr.shiftName || 'Day Shift'),
    workingHours: text(hr.workingHours || '9 AM - 4 PM'),
    offDay: text(hr.offDay || 'Sunday'),
    salaryPackage: {
      basicSalary: finite(privateHr.salaryPackage?.basicSalary),
      housingAllowance: finite(privateHr.salaryPackage?.housingAllowance),
      transportAllowance: finite(privateHr.salaryPackage?.transportAllowance),
      foodAllowance: finite(privateHr.salaryPackage?.foodAllowance),
      otherAllowance: finite(privateHr.salaryPackage?.otherAllowance),
      salaryPaymentDay: Math.max(1, Math.min(31, Number(privateHr.salaryPackage?.salaryPaymentDay || 1))),
      salaryGrade: text(privateHr.salaryPackage?.salaryGrade),
      overtimeEligible: privateHr.salaryPackage?.overtimeEligible !== false,
    },
  };
}

function onboardingState(authUser: admin.auth.UserRecord, user: any, latestInvitation: any) {
  const status = upper(user.status);
  if (status === 'EXITED') return 'EXITED';
  if (authUser.disabled || status === 'SUSPENDED') return 'SUSPENDED';
  if (!authUser.emailVerified) return latestInvitation ? 'INVITED' : 'ACCOUNT_CREATED';
  if (user.lastLogin || user.lastLoginAt) return 'ACTIVE';
  return 'EMAIL_VERIFIED';
}

function computeKpi(attendance: any[], jobs: any[]) {
  const eligibleAttendance = attendance.filter((item) => !['LEAVE', 'OFF'].includes(upper(item.status)));
  const attended = eligibleAttendance.filter((item) => ['PRESENT', 'REMOTE'].includes(upper(item.status))).length;
  const attendanceRate = eligibleAttendance.length ? Math.round((attended / eligibleAttendance.length) * 100) : null;
  const completedJobs = jobs.filter((job) => ['COMPLETED', 'CLOSED', 'RESOLVED'].includes(upper(job.status))).length;
  const jobCompletionRate = jobs.length ? Math.round((completedJobs / jobs.length) * 100) : null;
  const ratings = jobs
    .map((job) => Number(job.tenantRating ?? job.rating ?? job.customerRating))
    .filter((rating) => Number.isFinite(rating) && rating > 0 && rating <= 5);
  const averageRating = ratings.length ? Number((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(2)) : null;
  const scores = [attendanceRate, jobCompletionRate].filter((value): value is number => typeof value === 'number');
  return {
    overall: scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null,
    attendanceRate,
    jobCompletionRate,
    averageRating,
    attendanceEvidenceCount: eligibleAttendance.length,
    jobEvidenceCount: jobs.length,
  };
}

export const adminGetStaffOperations = onCall({ cors: true, region: REGION, enforceAppCheck: true }, async (request) => {
  await requireHrManager(request);
  const uid = text(request.data?.uid);
  const { authUser, user, role } = await requireStaff(uid);
  const jobsPromise = role === 'technician'
    ? db.collection('maintenanceTickets').where('assignedTechnicianId', '==', uid).limit(100).get()
    : Promise.resolve(null);
  const [hrSnap, privateSnap, invitationSnap, attendanceSnap, leaveSnap, documentSnap, payrollByStaff, payrollByTech, auditSnap, jobsSnap] = await Promise.all([
    db.collection('hrProfiles').doc(uid).get(),
    db.collection('private_hr_profiles').doc(uid).get(),
    db.collection('mail').where('targetUid', '==', uid).limit(50).get(),
    db.collection('staff_attendance').where('staffId', '==', uid).limit(120).get(),
    db.collection('staff_leave_requests').where('staffId', '==', uid).limit(100).get(),
    db.collection('hr_staff_documents').where('staffId', '==', uid).limit(100).get(),
    db.collection('payroll').where('staffId', '==', uid).limit(50).get(),
    db.collection('payroll').where('technicianId', '==', uid).limit(50).get(),
    db.collection('audit_logs').where('targetId', '==', uid).limit(100).get(),
    jobsPromise,
  ]);
  const invitations = recentDocs(invitationSnap, 20);
  const attendance = recentDocs(attendanceSnap, 60);
  const payroll = [...recentDocs(payrollByStaff, 30), ...recentDocs(payrollByTech, 30)]
    .filter((item, index, array) => array.findIndex((candidate) => candidate.id === item.id) === index)
    .slice(0, 30);
  const jobs = jobsSnap ? recentDocs(jobsSnap, 100) : [];
  const latestInvitation = invitations[0] || null;
  return {
    uid,
    role,
    profile: safeProfile(user, hrSnap.data() || {}, privateSnap.data() || {}),
    onboarding: {
      state: onboardingState(authUser, user, latestInvitation),
      emailVerified: authUser.emailVerified,
      authDisabled: authUser.disabled,
      invitationStatus: upper(latestInvitation?.delivery?.state || latestInvitation?.status || 'NOT_SENT'),
      invitationUpdatedAt: latestInvitation?.updatedAt || latestInvitation?.createdAt || null,
      lastLogin: serialize(user.lastLogin || user.lastLoginAt || null),
    },
    attendance,
    leaveRequests: recentDocs(leaveSnap, 50),
    documents: recentDocs(documentSnap, 50),
    payroll,
    audit: recentDocs(auditSnap, 50),
    kpi: computeKpi(attendance, jobs),
    generatedAt: new Date().toISOString(),
  };
});

export const adminUpdateStaffProfile = onCall({ cors: true, region: REGION, enforceAppCheck: true }, async (request) => {
  const actor = await requireHrManager(request);
  const uid = text(request.data?.uid);
  const payload = request.data?.profile || {};
  await requireStaff(uid);
  const displayName = text(payload.displayName);
  if (!displayName) throw new HttpsError('invalid-argument', 'Display name is required.');
  const now = FieldValue.serverTimestamp();
  const salary = payload.salaryPackage || {};
  await admin.auth().updateUser(uid, { displayName });
  const batch = db.batch();
  batch.set(db.collection('users').doc(uid), {
    displayName,
    fullName: displayName,
    phoneNumber: text(payload.phoneNumber),
    phone: text(payload.phoneNumber),
    department: text(payload.department),
    specialization: text(payload.specialization),
    emirate: text(payload.emirate),
    updatedAt: now,
    updatedBy: actor.actorId,
  }, { merge: true });
  batch.set(db.collection('hrProfiles').doc(uid), {
    displayName,
    department: text(payload.department),
    specialization: text(payload.specialization),
    emirate: text(payload.emirate),
    employmentType: text(payload.employmentType || 'full_time'),
    joiningDate: text(payload.joiningDate) || null,
    shiftName: text(payload.shiftName || 'Day Shift'),
    workingHours: text(payload.workingHours || '9 AM - 4 PM'),
    offDay: text(payload.offDay || 'Sunday'),
    updatedAt: now,
    updatedBy: actor.actorId,
  }, { merge: true });
  batch.set(db.collection('private_hr_profiles').doc(uid), {
    employeeId: text(payload.employeeId) || null,
    joiningDate: text(payload.joiningDate) || null,
    contractEndDate: text(payload.contractEndDate) || null,
    employmentType: text(payload.employmentType || 'full_time'),
    salaryPackage: {
      basicSalary: finite(salary.basicSalary),
      housingAllowance: finite(salary.housingAllowance),
      transportAllowance: finite(salary.transportAllowance),
      foodAllowance: finite(salary.foodAllowance),
      otherAllowance: finite(salary.otherAllowance),
      salaryPaymentDay: Math.max(1, Math.min(31, Math.round(Number(salary.salaryPaymentDay || 1)))),
      salaryGrade: text(salary.salaryGrade) || null,
      overtimeEligible: salary.overtimeEligible !== false,
    },
    updatedAt: now,
    updatedBy: actor.actorId,
  }, { merge: true });
  await batch.commit();
  await writeAudit(actor, 'ADMIN_UPDATE_STAFF_PROFILE', uid, { profileUpdated: true, privateHrSeparated: true });
  return { success: true, uid, displayName };
});

export const adminRecordStaffAttendance = onCall({ cors: true, region: REGION, enforceAppCheck: true }, async (request) => {
  const actor = await requireHrManager(request);
  const uid = text(request.data?.uid);
  await requireStaff(uid);
  const date = text(request.data?.date);
  const status = upper(request.data?.status);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpsError('invalid-argument', 'Attendance date must be YYYY-MM-DD.');
  if (!ATTENDANCE_STATUSES.has(status)) throw new HttpsError('invalid-argument', 'Unsupported attendance status.');
  const id = `${uid}_${date}`;
  await db.collection('staff_attendance').doc(id).set({
    staffId: uid,
    date,
    status,
    clockIn: text(request.data?.clockIn) || null,
    clockOut: text(request.data?.clockOut) || null,
    notes: text(request.data?.notes) || null,
    source: 'ADMIN_HR',
    recordedBy: actor.actorId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await writeAudit(actor, 'ADMIN_RECORD_STAFF_ATTENDANCE', uid, { date, status });
  return { success: true, id };
});

export const adminManageStaffLeave = onCall({ cors: true, region: REGION, enforceAppCheck: true }, async (request) => {
  const actor = await requireHrManager(request);
  const uid = text(request.data?.uid);
  await requireStaff(uid);
  const action = upper(request.data?.action || 'CREATE');
  const now = FieldValue.serverTimestamp();
  if (action === 'CREATE') {
    const leaveType = upper(request.data?.leaveType || 'ANNUAL');
    const startDate = text(request.data?.startDate);
    const endDate = text(request.data?.endDate);
    if (!LEAVE_TYPES.has(leaveType)) throw new HttpsError('invalid-argument', 'Unsupported leave type.');
    const totalDays = daysBetween(startDate, endDate);
    if (totalDays > 365) throw new HttpsError('invalid-argument', 'Leave request cannot exceed 365 days.');
    const ref = db.collection('staff_leave_requests').doc();
    await ref.set({
      staffId: uid,
      leaveType,
      startDate,
      endDate,
      totalDays,
      reason: text(request.data?.reason) || null,
      status: 'PENDING',
      requestedBy: actor.actorId,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(actor, 'ADMIN_CREATE_STAFF_LEAVE', uid, { leaveRequestId: ref.id, leaveType, startDate, endDate, totalDays });
    return { success: true, id: ref.id, status: 'PENDING' };
  }
  const leaveRequestId = text(request.data?.leaveRequestId);
  if (!leaveRequestId) throw new HttpsError('invalid-argument', 'leaveRequestId is required.');
  const ref = db.collection('staff_leave_requests').doc(leaveRequestId);
  const snap = await ref.get();
  if (!snap.exists || text(snap.data()?.staffId) !== uid) throw new HttpsError('not-found', 'Leave request not found for this staff member.');
  const nextStatus = action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : action === 'CANCEL' ? 'CANCELLED' : '';
  if (!nextStatus) throw new HttpsError('invalid-argument', 'Leave action must be CREATE, APPROVE, REJECT, or CANCEL.');
  await ref.set({
    status: nextStatus,
    decisionReason: text(request.data?.reason) || null,
    decidedBy: actor.actorId,
    decidedAt: now,
    updatedAt: now,
  }, { merge: true });
  await writeAudit(actor, `ADMIN_${nextStatus}_STAFF_LEAVE`, uid, { leaveRequestId });
  return { success: true, id: leaveRequestId, status: nextStatus };
});

export const adminRegisterStaffDocument = onCall({ cors: true, region: REGION, enforceAppCheck: true }, async (request) => {
  const actor = await requireHrManager(request);
  const uid = text(request.data?.uid);
  await requireStaff(uid);
  const documentType = upper(request.data?.documentType || 'OTHER');
  const storagePath = text(request.data?.storagePath);
  const downloadURL = text(request.data?.downloadURL);
  const fileName = text(request.data?.fileName);
  const contentType = lower(request.data?.contentType);
  if (!DOCUMENT_TYPES.has(documentType)) throw new HttpsError('invalid-argument', 'Unsupported HR document type.');
  if (!storagePath.startsWith(`hrDocuments/${uid}/`)) throw new HttpsError('permission-denied', 'HR document storage path is invalid.');
  if (!downloadURL.startsWith('https://')) throw new HttpsError('invalid-argument', 'A secure document URL is required.');
  if (!(contentType === 'application/pdf' || contentType.startsWith('image/'))) throw new HttpsError('invalid-argument', 'Only PDF or image HR documents are allowed.');
  const ref = db.collection('hr_staff_documents').doc();
  await ref.set({
    staffId: uid,
    documentType,
    title: text(request.data?.title || fileName || documentType),
    fileName,
    storagePath,
    downloadURL,
    contentType,
    expiresAt: text(request.data?.expiresAt) || null,
    status: 'ACTIVE',
    uploadedBy: actor.actorId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await writeAudit(actor, 'ADMIN_REGISTER_HR_DOCUMENT', uid, { documentId: ref.id, documentType, storagePath });
  return { success: true, id: ref.id };
});

export const adminDeleteStaffDocument = onCall({ cors: true, region: REGION, enforceAppCheck: true }, async (request) => {
  const actor = await requireHrManager(request);
  const uid = text(request.data?.uid);
  await requireStaff(uid);
  const documentId = text(request.data?.documentId);
  const ref = db.collection('hr_staff_documents').doc(documentId);
  const snap = await ref.get();
  if (!snap.exists || text(snap.data()?.staffId) !== uid) throw new HttpsError('not-found', 'HR document not found.');
  const storagePath = text(snap.data()?.storagePath);
  if (!storagePath.startsWith(`hrDocuments/${uid}/`)) throw new HttpsError('permission-denied', 'Stored HR document path is invalid.');
  await admin.storage().bucket().file(storagePath).delete({ ignoreNotFound: true });
  await ref.delete();
  await writeAudit(actor, 'ADMIN_DELETE_HR_DOCUMENT', uid, { documentId, storagePath });
  return { success: true, id: documentId };
});

export const adminResendStaffInvitation = onCall({ cors: true, region: REGION, enforceAppCheck: true }, async (request) => {
  const actor = await requireHrManager(request);
  const uid = text(request.data?.uid);
  const { authUser, role } = await requireStaff(uid);
  const email = lower(authUser.email);
  if (!email) throw new HttpsError('failed-precondition', 'Staff Auth identity has no email address.');
  const adminUrl = text(process.env.ADMIN_APP_URL || 'https://bin-group-admin-panel.web.app').replace(/\/$/, '');
  const mainUrl = text(process.env.MAIN_APP_URL || 'https://bin-group-57c60.web.app').replace(/\/$/, '');
  const loginUrl = role === 'technician' ? `${mainUrl}/login?role=technician` : `${adminUrl}/login`;
  const actionSettings = { url: loginUrl, handleCodeInApp: false };
  const verificationLink = authUser.emailVerified ? '' : await admin.auth().generateEmailVerificationLink(email, actionSettings);
  const passwordResetLink = await admin.auth().generatePasswordResetLink(email, actionSettings);
  const invitationRef = db.collection('mail').doc();
  await invitationRef.set({
    to: [email],
    message: {
      subject: `BIN GROUP ${role.replace(/_/g, ' ')} account access`,
      text: `Hello ${authUser.displayName || 'BIN GROUP team member'},\n\nYour secure BIN GROUP staff access instructions were re-issued.\n${verificationLink ? `Verify email: ${verificationLink}\n` : 'Email already verified.\n'}Set or reset private password: ${passwordResetLink}\nSign in: ${loginUrl}\n\nNever share passwords, verification links, MFA codes, or device access.`,
      from: 'BIN GROUP <ceo@bin-groups.com>',
      replyTo: 'BIN GROUP Admin <ceo@bin-groups.com>',
    },
    type: 'staff_account_invitation',
    template: 'staff-account-invitation-v3',
    targetUid: uid,
    targetRole: role,
    status: 'QUEUED',
    delivery: { state: 'QUEUED' },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdBy: actor.actorId,
  });
  await writeAudit(actor, 'ADMIN_RESEND_STAFF_INVITATION', uid, { invitationMailId: invitationRef.id, emailVerified: authUser.emailVerified });
  return { success: true, invitationQueued: true };
});

export const adminOffboardStaff = onCall({ cors: true, region: REGION, enforceAppCheck: true }, async (request) => {
  const actor = await requireHrManager(request);
  const uid = text(request.data?.uid);
  const reason = text(request.data?.reason);
  if (reason.length < 5) throw new HttpsError('invalid-argument', 'Offboarding reason must contain at least 5 characters.');
  const { authUser, role } = await requireStaff(uid);
  const previousClaims = authUser.customClaims || {};
  await admin.auth().updateUser(uid, { disabled: true });
  await admin.auth().setCustomUserClaims(uid, { ...previousClaims, suspended: true, offboarded: true });
  await admin.auth().revokeRefreshTokens(uid);
  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(db.collection('users').doc(uid), {
    status: 'EXITED',
    suspended: true,
    offboarded: true,
    offboardedAt: now,
    offboardedBy: actor.actorId,
    offboardingReason: reason,
    updatedAt: now,
  }, { merge: true });
  batch.set(db.collection('staffAccess').doc(uid), {
    active: false,
    suspended: true,
    offboarded: true,
    updatedAt: now,
    updatedBy: actor.actorId,
  }, { merge: true });
  batch.set(db.collection('hrProfiles').doc(uid), {
    status: 'EXITED',
    employmentStatus: 'EXITED',
    employmentEndDate: now,
    offboardingReason: reason,
    updatedAt: now,
  }, { merge: true });
  if (role === 'technician') {
    batch.set(db.collection('technicians').doc(uid), {
      status: 'EXITED',
      suspended: true,
      available: false,
      isAvailable: false,
      onDuty: false,
      updatedAt: now,
    }, { merge: true });
  }
  await batch.commit();
  await writeAudit(actor, 'ADMIN_OFFBOARD_STAFF', uid, {
    reason,
    role,
    authDisabled: true,
    refreshTokensRevoked: true,
    historyPreserved: true,
  });
  return { success: true, uid, status: 'EXITED', historyPreserved: true };
});
