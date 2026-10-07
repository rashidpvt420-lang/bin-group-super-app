import { FieldValue } from "firebase-admin/firestore";
import { settleSection, unavailableSections } from "./hrReadHealth";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { requirePrivilegedMfaSession } from "./adminMfaSession";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const FULL_ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "hr_admin", "hr_manager"]);
// Credential document types that technician dispatch readiness depends on. Registering one never
// marks a credential valid: it starts UNVERIFIED until an MFA Admin/HR Manager records a decision
// with adminRecordTechnicianCredentials (which links the document and sets the readiness status).
const CREDENTIAL_DOCUMENT_TYPES = new Set(["MEDICAL_CARD", "DRIVING_LICENCE", "DRIVING_LICENSE", "CERTIFICATE"]);

function clean(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}
function roleFromToken(token: any) {
  return clean(token?.role || token?.userRole || token?.primaryRole).toLowerCase();
}
async function requireHrAdmin(request: any) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Admin/HR session required.");
  const token = request.auth.token || {};
  const role = roleFromToken(token);
  const authorized = token?.suspended !== true && (
    FULL_ADMIN_ROLES.has(role) || token?.admin === true || token?.isAdmin === true ||
    token?.super_admin === true || token?.superAdmin === true || token?.ceo === true
  );
  if (!authorized) throw new HttpsError("permission-denied", "HR Manager or Founder/Admin access is required.");
  return { actorId: request.auth.uid, actorRole: role || "admin" };
}
async function assertStaff(uid: string) {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists || snap.data()?.isStaff !== true) throw new HttpsError("failed-precondition", "Target must be an active staff identity.");
  return snap.data() || {};
}

export const adminGetHrOperations = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  await requireHrAdmin(request);
  await requirePrivilegedMfaSession(request.auth);
  const [attendanceSnap, leaveSnap, documentSnap, uploadSnap] = await Promise.all([
    settleSection("attendance", db.collection("staffAttendance").orderBy("workDate", "desc").limit(100).get()),
    settleSection("leaveRequests", db.collection("staffLeaveRequests").orderBy("createdAt", "desc").limit(100).get()),
    settleSection("documents", db.collection("staffHrDocuments").orderBy("createdAt", "desc").limit(100).get()),
    settleSection("staffUploads", db.collection("staffDocuments").orderBy("createdAt", "desc").limit(100).get()),
  ]);
  const unavailable = unavailableSections([attendanceSnap, leaveSnap, documentSnap, uploadSnap]);
  // Staff uploads are supplementary: if all three core HR sections fail, the read is unavailable.
  if (["attendance", "leaveRequests", "documents"].every((section) => unavailable.includes(section))) {
    throw new HttpsError("unavailable", "HR operations data could not be loaded. Nothing is shown as empty; retry shortly.");
  }
  const mapDocs = (settled: any) => settled.value ? settled.value.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) : [];
  return {
    success: unavailable.length === 0,
    complete: unavailable.length === 0,
    unavailableSections: unavailable,
    attendance: mapDocs(attendanceSnap),
    leaveRequests: mapDocs(leaveSnap),
    documents: mapDocs(documentSnap),
    // Documents staff uploaded themselves (staff vault). Metadata only; file bytes stay behind
    // Storage rules. HR can verify credential uploads from here instead of re-registering them.
    staffUploads: mapDocs(uploadSnap).map((entry: any) => ({
      id: entry.id,
      uid: entry.uid || entry.technicianId || entry.userId || null,
      documentType: entry.documentType || null,
      documentLabel: entry.documentLabel || null,
      fileName: entry.fileName || entry.documentFileName || null,
      status: entry.status || null,
      verificationStatus: entry.verificationStatus || null,
      credentialVerification: entry.credentialVerification || null,
      createdAt: typeof entry.createdAt?.toDate === "function" ? entry.createdAt.toDate().toISOString() : null,
    })),
  };
});

export const adminRecordStaffAttendance = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const { actorId, actorRole } = await requireHrAdmin(request);
  await requirePrivilegedMfaSession(request.auth);
  const uid = clean(request.data?.uid);
  const workDate = clean(request.data?.workDate);
  const status = clean(request.data?.status).toUpperCase();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) throw new HttpsError("invalid-argument", "workDate must use YYYY-MM-DD.");
  if (!["PRESENT", "ABSENT", "ON_LEAVE", "SICK_LEAVE", "REMOTE", "OFF_DAY"].includes(status)) {
    throw new HttpsError("invalid-argument", "Unsupported attendance status.");
  }
  await assertStaff(uid);
  const now = FieldValue.serverTimestamp();
  const recordId = `${uid}_${workDate}`;
  await db.collection("staffAttendance").doc(recordId).set({
    uid, workDate, status,
    checkIn: clean(request.data?.checkIn) || null,
    checkOut: clean(request.data?.checkOut) || null,
    note: clean(request.data?.note) || null,
    source: "ADMIN_HR_COMMAND",
    recordedBy: actorId,
    updatedAt: now,
    createdAt: now,
  }, { merge: true });
  await db.collection("audit_logs").add({
    actorId, actorRole, action: "ADMIN_RECORD_STAFF_ATTENDANCE", targetType: "staffAttendance", targetId: recordId,
    metadata: { uid, workDate, status }, createdAt: now,
  });
  return { success: true, recordId };
});

export const adminCreateStaffLeaveRequest = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const { actorId, actorRole } = await requireHrAdmin(request);
  await requirePrivilegedMfaSession(request.auth);
  const uid = clean(request.data?.uid);
  await assertStaff(uid);
  const leaveType = clean(request.data?.leaveType, "ANNUAL").toUpperCase();
  const startDate = clean(request.data?.startDate);
  const endDate = clean(request.data?.endDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw new HttpsError("invalid-argument", "Leave dates must use YYYY-MM-DD.");
  }
  const now = FieldValue.serverTimestamp();
  const ref = db.collection("staffLeaveRequests").doc();
  await ref.set({
    uid, leaveType, startDate, endDate,
    reason: clean(request.data?.reason) || null,
    status: "PENDING",
    source: "ADMIN_HR_COMMAND",
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  });
  await db.collection("audit_logs").add({
    actorId, actorRole, action: "ADMIN_CREATE_STAFF_LEAVE", targetType: "staffLeaveRequests", targetId: ref.id,
    metadata: { uid, leaveType, startDate, endDate }, createdAt: now,
  });
  return { success: true, requestId: ref.id };
});

export const adminReviewStaffLeaveRequest = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const { actorId, actorRole } = await requireHrAdmin(request);
  await requirePrivilegedMfaSession(request.auth);
  const requestId = clean(request.data?.requestId);
  const decision = clean(request.data?.decision).toUpperCase();
  if (!["APPROVED", "REJECTED", "CANCELLED"].includes(decision)) throw new HttpsError("invalid-argument", "Invalid leave decision.");
  const ref = db.collection("staffLeaveRequests").doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Leave request not found.");
  const now = FieldValue.serverTimestamp();
  await ref.set({
    status: decision,
    reviewNote: clean(request.data?.reviewNote) || null,
    reviewedBy: actorId,
    reviewedAt: now,
    updatedAt: now,
  }, { merge: true });
  await db.collection("audit_logs").add({
    actorId, actorRole, action: "ADMIN_REVIEW_STAFF_LEAVE", targetType: "staffLeaveRequests", targetId: requestId,
    metadata: { decision }, createdAt: now,
  });
  return { success: true, requestId, decision };
});

export const adminRegisterHrDocumentMetadata = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const { actorId, actorRole } = await requireHrAdmin(request);
  await requirePrivilegedMfaSession(request.auth);
  const uid = clean(request.data?.uid);
  await assertStaff(uid);
  const documentType = clean(request.data?.documentType).toUpperCase();
  const storagePath = clean(request.data?.storagePath);
  if (!documentType) throw new HttpsError("invalid-argument", "documentType is required.");
  if (!storagePath.startsWith(`privateHrDocuments/${uid}/`)) {
    throw new HttpsError("invalid-argument", "HR documents must use the canonical privateHrDocuments staff path.");
  }
  const now = FieldValue.serverTimestamp();
  const ref = db.collection("staffHrDocuments").doc();
  await ref.set({
    uid, documentType, storagePath,
    fileName: clean(request.data?.fileName) || null,
    expiryDate: clean(request.data?.expiryDate) || null,
    status: "ACTIVE",
    ...(CREDENTIAL_DOCUMENT_TYPES.has(documentType) ? { verificationStatus: "UNVERIFIED" } : {}),
    createdBy: actorId,
    createdAt: now,
    updatedAt: now,
  });
  await db.collection("audit_logs").add({
    actorId, actorRole, action: "ADMIN_REGISTER_HR_DOCUMENT", targetType: "staffHrDocuments", targetId: ref.id,
    metadata: { uid, documentType, storagePath }, createdAt: now,
  });
  return { success: true, documentId: ref.id };
});
