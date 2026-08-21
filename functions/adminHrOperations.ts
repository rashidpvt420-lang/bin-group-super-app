import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const FULL_ADMIN_ROLES = new Set(["admin", "super_admin", "ceo", "hr_admin", "hr_manager"]);

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
  const [attendanceSnap, leaveSnap, documentSnap] = await Promise.all([
    db.collection("staffAttendance").orderBy("workDate", "desc").limit(100).get().catch(() => null),
    db.collection("staffLeaveRequests").orderBy("createdAt", "desc").limit(100).get().catch(() => null),
    db.collection("staffHrDocuments").orderBy("createdAt", "desc").limit(100).get().catch(() => null),
  ]);
  const mapDocs = (snapshot: any) => snapshot ? snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) : [];
  return {
    success: true,
    attendance: mapDocs(attendanceSnap),
    leaveRequests: mapDocs(leaveSnap),
    documents: mapDocs(documentSnap),
  };
});

export const adminRecordStaffAttendance = onCall({ cors: true, region: "europe-west3", enforceAppCheck: true }, async (request) => {
  const { actorId, actorRole } = await requireHrAdmin(request);
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
