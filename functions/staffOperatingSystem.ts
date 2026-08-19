import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

const FUNCTION_REGION = "europe-west3";
const CALLABLE_OPTIONS = {
  region: FUNCTION_REGION,
  cors: true,
  enforceAppCheck: true,
} as const;

const ACTIVE_JOB_STATUSES = [
  "assigned",
  "on_the_way",
  "arrived",
  "in_progress",
  "EN_ROUTE",
  "ARRIVED",
  "IN_PROGRESS",
];

const ensureDb = () => {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
};

const text = (value: unknown) => String(value ?? "").trim();
const upper = (value: unknown) => text(value).toUpperCase();

function getCallerRole(token: Record<string, unknown>): string {
  return text(token.role || token.userRole || token.primaryRole).toLowerCase();
}

function isCeoOrAdmin(token: Record<string, unknown>, role = getCallerRole(token)): boolean {
  return token.admin === true || token.super_admin === true || token.superAdmin === true ||
    ["ceo", "super_admin", "admin"].includes(role);
}

async function assertActiveAccount(uid: string, token: Record<string, unknown>) {
  const user = await admin.auth().getUser(uid);
  if (user.disabled || token.suspended === true || user.customClaims?.suspended === true) {
    throw new HttpsError("permission-denied", "This staff account is disabled or suspended.");
  }
}

function dubaiDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new HttpsError("internal", "Unable to resolve company-local date.");
  }
  return `${year}-${month}-${day}`;
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "object" && value !== null) {
    const maybe = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof maybe.toDate === "function") {
      const date = maybe.toDate();
      return Number.isFinite(date.getTime()) ? date : null;
    }
    const seconds = maybe.seconds ?? maybe._seconds;
    if (Number.isFinite(Number(seconds))) {
      const date = new Date(Number(seconds) * 1000);
      return Number.isFinite(date.getTime()) ? date : null;
    }
  }
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

function assignedTechnicianUid(data: Record<string, unknown>): string {
  return text(
    data.assignedTechnicianId ||
    data.technicianId ||
    data.assignedTechId ||
    data.technicianUid ||
    data.techId,
  );
}

function assignedVehicleUid(data: Record<string, unknown>): string {
  return text(
    data.assignedStaffUid ||
    data.assignedDriverUid ||
    data.currentDriverUid ||
    data.driverUid ||
    data.custodianUid,
  );
}

function hasCompletionPhotoEvidence(data: Record<string, unknown>): boolean {
  const single = text(
    data.technicianAfterPhotoUrl ||
    data.afterPhotoUrl ||
    data.completionPhotoUrl,
  );
  const arrays = [
    data.technicianAfterPhotos,
    data.afterPhotos,
    data.completionPhotos,
    data.proofPhotos,
  ];
  return Boolean(single) || arrays.some((value) => Array.isArray(value) && value.length > 0);
}

async function loadActiveTicket(db: FirebaseFirestore.Firestore, uid: string) {
  const snap = await db.collection("maintenanceTickets")
    .where("assignedTechnicianId", "==", uid)
    .where("status", "in", ACTIVE_JOB_STATUSES)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0];
}

async function loadAssignedVehicle(db: FirebaseFirestore.Firestore, uid: string) {
  const snap = await db.collection("vehicles")
    .where("assignedStaffUid", "==", uid)
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0];
}

type ExceptionDomain = "HR_CONFIDENTIAL" | "HR" | "FLEET" | "FINANCE" | "OPERATIONS" | "GENERAL";

function exceptionDomain(exceptionType: unknown): ExceptionDomain {
  const type = upper(exceptionType);
  if (type.includes("CONFIDENTIAL_HR") || type.includes("GRIEVANCE") || type.includes("ETHICS")) {
    return "HR_CONFIDENTIAL";
  }
  if (type.includes("HR") || type.includes("CLOCK") || type.includes("ATTENDANCE") || type.includes("DOCUMENT")) {
    return "HR";
  }
  if (type.includes("FLEET") || type.includes("VEHICLE") || type.includes("BREAKDOWN") || type.includes("ACCIDENT")) {
    return "FLEET";
  }
  if (type.includes("PAYROLL") || type.includes("FINANCE") || type.includes("EXPENSE")) {
    return "FINANCE";
  }
  if (type.includes("OPERATIONS") || type.includes("OVERTIME") || type.includes("SLA") || type.includes("JOB")) {
    return "OPERATIONS";
  }
  return "GENERAL";
}

function canAccessExceptionDomain(token: Record<string, unknown>, role: string, domain: ExceptionDomain): boolean {
  if (isCeoOrAdmin(token, role)) return true;
  if (domain === "HR_CONFIDENTIAL") return role === "hr_confidential";
  if (domain === "HR") return ["hr_admin", "hr_manager", "hr_staff"].includes(role);
  if (domain === "FLEET") return ["fleet_manager", "operations_manager"].includes(role);
  if (domain === "FINANCE") return ["finance_manager", "payroll_admin"].includes(role);
  if (domain === "OPERATIONS") return ["operations_manager", "supervisor"].includes(role);
  return false;
}

function allowedExceptionActions(domain: ExceptionDomain): Set<string> {
  if (domain === "HR_CONFIDENTIAL") {
    return new Set(["RESOLVE", "REJECT", "REQUEST_INFORMATION"]);
  }
  if (domain === "HR") {
    return new Set(["APPROVE_CORRECTION", "MARK_VERIFIED", "RESOLVE", "REJECT", "REQUEST_INFORMATION"]);
  }
  if (domain === "FLEET") {
    return new Set(["ACKNOWLEDGE", "ASSIGN_REPLACEMENT", "SEND_TO_WORKSHOP", "CLOSE_INCIDENT", "RESOLVE", "REQUEST_INFORMATION"]);
  }
  if (domain === "FINANCE") {
    return new Set(["APPROVE", "REJECT", "RESOLVE", "REQUEST_INFORMATION"]);
  }
  if (domain === "OPERATIONS") {
    return new Set(["APPROVE", "PARTIAL_APPROVE", "REJECT", "RESOLVE", "REQUEST_EVIDENCE", "REQUEST_INFORMATION"]);
  }
  return new Set(["RESOLVE", "REJECT", "REQUEST_INFORMATION"]);
}

function nextExceptionStatus(action: string): string {
  if (action === "REJECT") return "REJECTED";
  if (["RESOLVE", "APPROVE", "APPROVE_CORRECTION", "PARTIAL_APPROVE", "CLOSE_INCIDENT", "MARK_VERIFIED"].includes(action)) {
    return "RESOLVED";
  }
  return "IN_REVIEW";
}

/**
 * Context-aware staff quick actions.
 * Only authoritative transitions implemented here are accepted; unsupported actions fail closed.
 */
export const submitStaffQuickAction = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const token = request.auth.token || {};
  const db = ensureDb();
  const data = request.data || {};
  const actionType = upper(data.actionType);

  await assertActiveAccount(uid, token);

  const supportedActions = new Set(["CLOCK_IN", "ARRIVE", "START_JOB", "BREAKDOWN_REPORT"]);
  if (!supportedActions.has(actionType)) {
    throw new HttpsError("unimplemented", `Quick action ${actionType || "(missing)"} is not wired to an authoritative workflow.`);
  }

  const todayStr = dubaiDateKey();
  const shiftRef = db.collection("staff_shifts").doc(`SHIFT_${uid}_${todayStr}`);
  const shiftSnap = await shiftRef.get();
  const shiftStatus = upper(shiftSnap.data()?.status || "OFF_DUTY");

  const vehicleDoc = await loadAssignedVehicle(db, uid);
  const serverVehicleId = vehicleDoc?.id || null;
  const ticketDoc = await loadActiveTicket(db, uid);
  const serverJobId = ticketDoc?.id || null;

  const requestedVehicleId = text(data.vehicleId);
  const requestedJobId = text(data.jobId);

  if (requestedVehicleId && requestedVehicleId !== serverVehicleId) {
    throw new HttpsError("permission-denied", "Requested vehicle does not match current server-side custody.");
  }
  if (requestedJobId && requestedJobId !== serverJobId) {
    throw new HttpsError("permission-denied", "Requested job does not match the current server-side assignment.");
  }

  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  let resultMessage = "";

  if (actionType === "CLOCK_IN") {
    if (["ACTIVE", "ON_BREAK"].includes(shiftStatus)) {
      throw new HttpsError("already-exists", "Shift is already active.");
    }
    if (shiftStatus === "COMPLETED") {
      throw new HttpsError("failed-precondition", "Today's shift has already been completed.");
    }
    await shiftRef.set({
      staffId: uid,
      status: "ACTIVE",
      clockInTime: timestamp,
      shiftDate: todayStr,
      updatedAt: timestamp,
    }, { merge: true });
    resultMessage = "Clock-in recorded.";
  }

  if (actionType === "ARRIVE") {
    if (!ticketDoc) {
      throw new HttpsError("failed-precondition", "No active assigned work order is available.");
    }
    const currentStatus = upper(ticketDoc.data()?.status);
    if (!["ASSIGNED", "EN_ROUTE", "ON_THE_WAY"].includes(currentStatus)) {
      throw new HttpsError("failed-precondition", `Cannot mark arrival from status ${currentStatus || "UNKNOWN"}.`);
    }
    await ticketDoc.ref.set({
      status: "ARRIVED",
      arrivedAt: timestamp,
      updatedAt: timestamp,
    }, { merge: true });
    resultMessage = "Arrival recorded for the assigned work order.";
  }

  if (actionType === "START_JOB") {
    if (!ticketDoc) {
      throw new HttpsError("failed-precondition", "No active assigned work order is available.");
    }
    const currentStatus = upper(ticketDoc.data()?.status);
    if (currentStatus !== "ARRIVED") {
      throw new HttpsError("failed-precondition", `Job can start only after ARRIVED. Current status: ${currentStatus || "UNKNOWN"}.`);
    }
    await ticketDoc.ref.set({
      status: "IN_PROGRESS",
      workStartedAt: timestamp,
      updatedAt: timestamp,
    }, { merge: true });
    resultMessage = "Assigned work order started.";
  }

  if (actionType === "BREAKDOWN_REPORT") {
    if (!vehicleDoc || !serverVehicleId) {
      throw new HttpsError("failed-precondition", "No vehicle is currently assigned to this staff member.");
    }
    const note = text(data.notes);
    const exceptionRef = db.collection("staff_exceptions").doc();
    await exceptionRef.set({
      exceptionId: exceptionRef.id,
      staffId: uid,
      type: "VEHICLE_BREAKDOWN",
      domain: "FLEET",
      vehicleId: serverVehicleId,
      details: note || "Vehicle breakdown reported by assigned driver.",
      status: "OPEN",
      severity: "HIGH",
      createdAt: timestamp,
    });
    resultMessage = `Vehicle breakdown report ${exceptionRef.id} created.`;
  }

  const actionLogRef = db.collection("staff_quick_actions").doc();
  const auditRef = db.collection("audit_logs").doc();
  const batch = db.batch();
  batch.set(actionLogRef, {
    actionId: actionLogRef.id,
    staffId: uid,
    actionType,
    context: {
      vehicleId: serverVehicleId,
      jobId: serverJobId,
      reportedLocation: data.location || null,
      notes: text(data.notes),
    },
    createdAt: timestamp,
  });
  batch.set(auditRef, {
    action: "STAFF_QUICK_ACTION_EXECUTED",
    actorUid: uid,
    actorRole: getCallerRole(token),
    actionType,
    vehicleId: serverVehicleId,
    jobId: serverJobId,
    timestamp,
  });
  await batch.commit();

  return {
    success: true,
    actionId: actionLogRef.id,
    actionType,
    serverVehicleId,
    serverJobId,
    message: resultMessage,
  };
});

/**
 * Structured job-report preparation and confirmed completion.
 * Preview calls do not mutate the work order. Confirmation revalidates authorization/state in a transaction.
 */
export const completeStaffJobWithAi = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const token = request.auth.token || {};
  const db = ensureDb();
  const data = request.data || {};
  const jobId = text(data.jobId);
  const rawSpokenText = text(data.rawSpokenText);
  const confirmCompletion = data.confirmCompletion === true;

  await assertActiveAccount(uid, token);

  if (!jobId) {
    throw new HttpsError("invalid-argument", "Job ID is required.");
  }
  if (!rawSpokenText) {
    throw new HttpsError("invalid-argument", "Work summary is required.");
  }

  const ticketRef = db.collection("maintenanceTickets").doc(jobId);
  const initialSnap = await ticketRef.get();
  if (!initialSnap.exists) {
    throw new HttpsError("not-found", `Work order ${jobId} not found.`);
  }

  const initialData = initialSnap.data() || {};
  const role = getCallerRole(token);
  const assignedTechId = assignedTechnicianUid(initialData);
  const isAssignedTech = assignedTechId === uid;
  const isOperationsAuthority = isCeoOrAdmin(token, role) || role === "operations_manager";

  if (!isAssignedTech && !isOperationsAuthority) {
    throw new HttpsError("permission-denied", "You are not authorized to prepare or confirm this work order.");
  }

  const currentStatus = upper(initialData.status);
  if (!["ARRIVED", "IN_PROGRESS"].includes(currentStatus)) {
    throw new HttpsError("failed-precondition", `Cannot prepare completion from status ${currentStatus || "UNKNOWN"}.`);
  }

  const proposedMaterials = Array.isArray(data.proposedMaterials)
    ? data.proposedMaterials.map((item: unknown) => text(item)).filter(Boolean).slice(0, 20)
    : [];

  const structuredReport = {
    summary: rawSpokenText,
    proposedMaterials,
    workOrderStatus: currentStatus,
    assignmentVerified: true,
  };

  if (!confirmCompletion) {
    return {
      success: true,
      preview: true,
      jobId,
      report: structuredReport,
      message: "Structured report prepared for staff review. No authoritative records were changed.",
    };
  }

  await db.runTransaction(async (transaction) => {
    const ticketSnap = await transaction.get(ticketRef);
    if (!ticketSnap.exists) {
      throw new HttpsError("not-found", `Work order ${jobId} not found.`);
    }

    const ticketData = ticketSnap.data() || {};
    const liveStatus = upper(ticketData.status);
    const liveAssignedTechId = assignedTechnicianUid(ticketData);
    const liveAuthorized = liveAssignedTechId === uid || isOperationsAuthority;

    if (!liveAuthorized) {
      throw new HttpsError("permission-denied", "Work-order assignment changed before completion.");
    }
    if (!["ARRIVED", "IN_PROGRESS"].includes(liveStatus)) {
      throw new HttpsError("failed-precondition", `Work order is no longer completable from status ${liveStatus || "UNKNOWN"}.`);
    }
    if (ticketData.requiresCompletionPhoto !== false && !hasCompletionPhotoEvidence(ticketData)) {
      throw new HttpsError("failed-precondition", "Required after-work completion evidence is missing.");
    }

    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(ticketRef, {
      status: "COMPLETED",
      completionNotes: rawSpokenText,
      proposedMaterials,
      completedByUid: liveAssignedTechId || uid,
      completionConfirmedByUid: uid,
      completionConfirmedByRole: role,
      completedAt: timestamp,
      updatedAt: timestamp,
    }, { merge: true });

    const auditRef = db.collection("audit_logs").doc();
    transaction.set(auditRef, {
      action: "STAFF_JOB_COMPLETED",
      actorUid: uid,
      actorRole: role,
      jobId,
      assignedTechnicianUid: liveAssignedTechId || null,
      previousStatus: liveStatus,
      newStatus: "COMPLETED",
      proposedMaterials,
      timestamp,
    });
  });

  return {
    success: true,
    preview: false,
    jobId,
    report: structuredReport,
    message: "Work order completion confirmed. Material proposals remain non-authoritative until inventory confirmation.",
  };
});

/**
 * Overtime request bound to the caller's active shift and, when supplied, assigned job.
 */
export const requestStaffOvertime = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const token = request.auth.token || {};
  const db = ensureDb();
  const data = request.data || {};
  const estimatedMinutes = Math.round(Number(data.estimatedMinutes));
  const reason = text(data.reason);
  const jobId = text(data.jobId);

  await assertActiveAccount(uid, token);

  if (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 360) {
    throw new HttpsError("invalid-argument", "Estimated overtime minutes must be an integer from 1 to 360.");
  }
  if (reason.length < 5) {
    throw new HttpsError("invalid-argument", "A meaningful overtime reason is required.");
  }

  const todayStr = dubaiDateKey();
  const shiftRef = db.collection("staff_shifts").doc(`SHIFT_${uid}_${todayStr}`);
  const shiftSnap = await shiftRef.get();
  if (!shiftSnap.exists || !["ACTIVE", "ON_BREAK"].includes(upper(shiftSnap.data()?.status))) {
    throw new HttpsError("failed-precondition", "Overtime can be requested only from an active shift.");
  }

  if (jobId) {
    const ticketSnap = await db.collection("maintenanceTickets").doc(jobId).get();
    if (!ticketSnap.exists) {
      throw new HttpsError("not-found", `Work order ${jobId} not found.`);
    }
    if (assignedTechnicianUid(ticketSnap.data() || {}) !== uid) {
      throw new HttpsError("permission-denied", "The overtime work order is not assigned to this staff member.");
    }
  }

  const existingSnap = await db.collection("staff_request_trackers")
    .where("staffId", "==", uid)
    .where("requestType", "==", "OVERTIME_CLAIM")
    .where("status", "in", ["SUBMITTED", "PENDING_REVIEW", "IN_REVIEW"])
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    throw new HttpsError("already-exists", "An active overtime request is already pending review.");
  }

  const trackerRef = db.collection("staff_request_trackers").doc();
  const auditRef = db.collection("audit_logs").doc();
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const batch = db.batch();

  batch.set(trackerRef, {
    trackerId: trackerRef.id,
    staffId: uid,
    requestType: "OVERTIME_CLAIM",
    jobId: jobId || null,
    estimatedMinutes,
    reason,
    status: "SUBMITTED",
    steps: [
      { name: "Submitted", status: "COMPLETED" },
      { name: "Supervisor Reviewing", status: "IN_PROGRESS" },
      { name: "HR Verification", status: "PENDING" },
      { name: "Payroll Eligibility", status: "PENDING" },
    ],
    shiftId: shiftRef.id,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  batch.set(auditRef, {
    action: "STAFF_OVERTIME_REQUEST_SUBMITTED",
    actorUid: uid,
    trackerId: trackerRef.id,
    jobId: jobId || null,
    estimatedMinutes,
    timestamp,
  });

  await batch.commit();

  return {
    success: true,
    trackerId: trackerRef.id,
    message: "Overtime request submitted for supervisor review.",
  };
});

/**
 * Server-authoritative end-of-shift verification.
 * The client supplies handover notes only; operational evidence is calculated from Firestore.
 */
export const triggerStaffShiftFinish = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const token = request.auth.token || {};
  const db = ensureDb();
  const handoverNotes = text(request.data?.handoverNotes);

  await assertActiveAccount(uid, token);

  const todayStr = dubaiDateKey();
  const shiftRef = db.collection("staff_shifts").doc(`SHIFT_${uid}_${todayStr}`);
  const shiftSnap = await shiftRef.get();

  if (!shiftSnap.exists) {
    throw new HttpsError("failed-precondition", "No active shift exists for today.");
  }
  const shiftStatus = upper(shiftSnap.data()?.status);
  if (!["ACTIVE", "ON_BREAK"].includes(shiftStatus)) {
    throw new HttpsError("failed-precondition", `Shift cannot be finished from status ${shiftStatus || "UNKNOWN"}.`);
  }

  const activeTicketsSnap = await db.collection("maintenanceTickets")
    .where("assignedTechnicianId", "==", uid)
    .where("status", "in", ACTIVE_JOB_STATUSES)
    .get();

  if (!activeTicketsSnap.empty) {
    throw new HttpsError(
      "failed-precondition",
      `Cannot finish shift with ${activeTicketsSnap.size} active work order(s). Complete or reassign them first.`,
    );
  }

  const vehicleDoc = await loadAssignedVehicle(db, uid);
  let vehicleReturnStatus = "NOT_ASSIGNED";
  if (vehicleDoc) {
    const vehicleData = vehicleDoc.data() || {};
    const vehicleStatus = upper(vehicleData.status);
    const returnRequired = vehicleData.returnRequiredAtShiftEnd === true;
    const returned = ["RETURNED", "AVAILABLE", "DEPOT", "PARKED"].includes(vehicleStatus);
    if (returnRequired && !returned) {
      throw new HttpsError("failed-precondition", `Assigned vehicle ${vehicleDoc.id} must be returned before finishing the shift.`);
    }
    vehicleReturnStatus = returnRequired ? "RETURN_CONFIRMED" : "REMAINS_ASSIGNED";
  }

  const ticketsSnap = await db.collection("maintenanceTickets")
    .where("assignedTechnicianId", "==", uid)
    .limit(100)
    .get();

  let jobsCompleted = 0;
  let photosUploaded = 0;
  for (const ticket of ticketsSnap.docs) {
    const ticketData = ticket.data() || {};
    if (upper(ticketData.status) !== "COMPLETED") continue;
    const completedAt = asDate(ticketData.completedAt);
    if (!completedAt || dubaiDateKey(completedAt) !== todayStr) continue;
    jobsCompleted += 1;
    if (hasCompletionPhotoEvidence(ticketData)) photosUploaded += 1;
  }

  const overtimeSnap = await db.collection("staff_request_trackers")
    .where("staffId", "==", uid)
    .limit(100)
    .get();

  let approvedOvertimeMinutes = 0;
  for (const tracker of overtimeSnap.docs) {
    const trackerData = tracker.data() || {};
    if (upper(trackerData.requestType) !== "OVERTIME_CLAIM") continue;
    const status = upper(trackerData.status);
    if (!["APPROVED", "PAYROLL_INCLUDED", "PAID"].includes(status)) continue;
    const minutes = Number(trackerData.approvedMinutes);
    if (Number.isFinite(minutes) && minutes > 0) approvedOvertimeMinutes += Math.round(minutes);
  }

  const warnings = [
    "Tool/asset handover is not asserted unless recorded by its dedicated custody workflow.",
  ];

  const summaryRef = db.collection("staff_daily_summaries").doc(`SUMMARY_${uid}_${todayStr}`);
  const auditRef = db.collection("audit_logs").doc();

  await db.runTransaction(async (transaction) => {
    const liveShift = await transaction.get(shiftRef);
    if (!liveShift.exists || !["ACTIVE", "ON_BREAK"].includes(upper(liveShift.data()?.status))) {
      throw new HttpsError("failed-precondition", "Shift state changed before completion.");
    }

    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(summaryRef, {
      staffId: uid,
      date: todayStr,
      jobsCompleted,
      completedJobsWithPhotoEvidence: photosUploaded,
      vehicleReturnStatus,
      approvedOvertimeMinutes,
      toolAssetVerificationStatus: "NOT_ASSERTED_BY_SHIFT_WORKFLOW",
      handoverNotes: handoverNotes || null,
      warnings,
      finishedAt: timestamp,
      verificationSource: "SERVER",
    }, { merge: true });

    transaction.set(shiftRef, {
      status: "COMPLETED",
      clockOutTime: timestamp,
      dailySummaryRef: summaryRef.id,
      updatedAt: timestamp,
    }, { merge: true });

    transaction.set(auditRef, {
      action: "STAFF_SHIFT_FINISHED",
      actorUid: uid,
      shiftId: shiftRef.id,
      summaryId: summaryRef.id,
      jobsCompleted,
      vehicleReturnStatus,
      approvedOvertimeMinutes,
      timestamp,
    });
  });

  return {
    success: true,
    summaryId: summaryRef.id,
    summary: {
      jobsCompleted,
      completedJobsWithPhotoEvidence: photosUploaded,
      vehicleReturnStatus,
      approvedOvertimeMinutes,
      toolAssetVerificationStatus: "NOT_ASSERTED_BY_SHIFT_WORKFLOW",
      warnings,
    },
    message: "Shift closed after server-side verification.",
  };
});

/**
 * Cross-department accident reporting and privileged management cascade.
 */
export const executeMultiDeptAutomation = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const token = request.auth.token || {};
  const db = ensureDb();
  const data = request.data || {};
  const eventType = upper(data.eventType);
  const role = getCallerRole(token);
  const managementAuthority = isCeoOrAdmin(token, role) || ["fleet_manager", "operations_manager"].includes(role);

  await assertActiveAccount(uid, token);

  if (!eventType) {
    throw new HttpsError("invalid-argument", "Event type is required.");
  }

  if (eventType === "VEHICLE_ACCIDENT_REPORT") {
    const vehicleId = text(data.vehicleId);
    if (!vehicleId) {
      throw new HttpsError("invalid-argument", "Vehicle ID is required to report an accident.");
    }

    const vehicleRef = db.collection("vehicles").doc(vehicleId);
    const vehicleSnap = await vehicleRef.get();
    if (!vehicleSnap.exists) {
      throw new HttpsError("not-found", `Vehicle ${vehicleId} not found.`);
    }

    const vehicleData = vehicleSnap.data() || {};
    if (assignedVehicleUid(vehicleData) !== uid && !managementAuthority) {
      throw new HttpsError("permission-denied", "Only the assigned driver or authorized Fleet/Operations manager may report this vehicle accident.");
    }

    const exceptionRef = db.collection("staff_exceptions").doc();
    const auditRef = db.collection("audit_logs").doc();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();

    batch.set(exceptionRef, {
      exceptionId: exceptionRef.id,
      staffId: uid,
      type: "VEHICLE_ACCIDENT",
      domain: "FLEET",
      vehicleId,
      details: text(data.notes) || null,
      status: "OPEN",
      severity: "CRITICAL",
      createdAt: timestamp,
    });

    batch.set(auditRef, {
      action: "VEHICLE_ACCIDENT_REPORTED",
      actorUid: uid,
      actorRole: role,
      vehicleId,
      exceptionId: exceptionRef.id,
      timestamp,
    });

    await batch.commit();

    return {
      success: true,
      eventType,
      exceptionId: exceptionRef.id,
      message: "Vehicle accident report submitted for Fleet/Operations review.",
    };
  }

  if (eventType === "VEHICLE_ACCIDENT_CASCADE") {
    if (!managementAuthority) {
      throw new HttpsError("permission-denied", "Fleet/Operations management permission is required.");
    }

    const vehicleId = text(data.vehicleId);
    if (!vehicleId) {
      throw new HttpsError("invalid-argument", "Vehicle ID is required for accident hold.");
    }

    const vehicleRef = db.collection("vehicles").doc(vehicleId);
    const vehicleSnap = await vehicleRef.get();
    if (!vehicleSnap.exists) {
      throw new HttpsError("not-found", `Vehicle ${vehicleId} not found.`);
    }

    const currentStatus = upper(vehicleSnap.data()?.status);
    if (currentStatus === "ACCIDENT_HOLD") {
      return {
        success: true,
        eventType,
        vehicleId,
        replayed: true,
        message: "Vehicle is already on accident hold.",
      };
    }

    const auditRef = db.collection("audit_logs").doc();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(vehicleRef, {
      status: "ACCIDENT_HOLD",
      accidentHoldByUid: uid,
      accidentHoldAt: timestamp,
      updatedAt: timestamp,
    }, { merge: true });
    batch.set(auditRef, {
      action: "VEHICLE_ACCIDENT_HOLD_APPLIED",
      actorUid: uid,
      actorRole: role,
      vehicleId,
      previousStatus: currentStatus || null,
      newStatus: "ACCIDENT_HOLD",
      timestamp,
    });
    await batch.commit();

    return {
      success: true,
      eventType,
      vehicleId,
      replayed: false,
      message: "Vehicle placed on accident hold.",
    };
  }

  throw new HttpsError("invalid-argument", `Unsupported automation event type: ${eventType}`);
});

/**
 * Domain-scoped exception resolution with state/action validation and immutable audit record.
 */
export const resolveStaffException = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const token = request.auth.token || {};
  const db = ensureDb();
  const data = request.data || {};
  const exceptionId = text(data.exceptionId);
  const resolutionAction = upper(data.resolutionAction);
  const resolutionReason = text(data.resolutionReason);
  const notes = text(data.notes);
  const role = getCallerRole(token);

  await assertActiveAccount(uid, token);

  if (!exceptionId) {
    throw new HttpsError("invalid-argument", "Exception ID is required.");
  }
  if (!resolutionAction) {
    throw new HttpsError("invalid-argument", "Resolution action is required.");
  }
  if (resolutionReason.length < 3) {
    throw new HttpsError("invalid-argument", "Human-supplied resolution reason is required.");
  }

  const exceptionRef = db.collection("staff_exceptions").doc(exceptionId);
  let resultStatus = "";

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(exceptionRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", `Staff exception ${exceptionId} not found.`);
    }

    const currentData = snap.data() || {};
    const previousStatus = upper(currentData.status || "OPEN");
    if (!["OPEN", "PENDING_REVIEW", "IN_REVIEW"].includes(previousStatus)) {
      throw new HttpsError("failed-precondition", `Exception cannot transition from terminal status ${previousStatus}.`);
    }

    if (currentData.staffId === uid && !isCeoOrAdmin(token, role)) {
      throw new HttpsError("permission-denied", "Staff members cannot resolve their own exception tickets.");
    }

    const domain = exceptionDomain(currentData.type);
    if (!canAccessExceptionDomain(token, role, domain)) {
      throw new HttpsError("permission-denied", `Caller is not authorized for ${domain} exceptions.`);
    }

    const allowedActions = allowedExceptionActions(domain);
    if (!allowedActions.has(resolutionAction)) {
      throw new HttpsError("invalid-argument", `Action ${resolutionAction} is not valid for ${domain} exceptions.`);
    }

    const newStatus = nextExceptionStatus(resolutionAction);
    resultStatus = newStatus;
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    const update: Record<string, unknown> = {
      status: newStatus,
      resolutionAction,
      resolutionReason,
      notes: notes || currentData.notes || null,
      reviewedByUid: uid,
      reviewedByRole: role,
      updatedAt: timestamp,
    };

    if (["RESOLVED", "REJECTED"].includes(newStatus)) {
      update.resolvedByUid = uid;
      update.resolvedByRole = role;
      update.resolvedAt = timestamp;
    }

    transaction.set(exceptionRef, update, { merge: true });

    const auditRef = db.collection("audit_logs").doc();
    transaction.set(auditRef, {
      action: "STAFF_EXCEPTION_DECISION",
      actorUid: uid,
      actorRole: role,
      exceptionId,
      exceptionType: upper(currentData.type),
      exceptionDomain: domain,
      previousStatus,
      newStatus,
      decision: resolutionAction,
      reason: resolutionReason,
      timestamp,
    });
  });

  return {
    success: true,
    exceptionId,
    status: resultStatus,
    message: `Exception ${exceptionId} updated to ${resultStatus}.`,
  };
});

/**
 * Authorized exception queue. Filtering happens server-side before any records are returned.
 */
export const getStaffExceptionsQueue = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const token = request.auth.token || {};
  const db = ensureDb();
  const role = getCallerRole(token);

  await assertActiveAccount(uid, token);

  const snap = await db.collection("staff_exceptions")
    .where("status", "in", ["OPEN", "PENDING_REVIEW", "IN_REVIEW"])
    .limit(100)
    .get();

  const exceptions = snap.docs
    .map((doc) => {
      const data = doc.data() || {};
      const domain = exceptionDomain(data.type);
      return { id: doc.id, domain, data };
    })
    .filter((row) => canAccessExceptionDomain(token, role, row.domain))
    .map((row) => ({
      id: row.id,
      staffId: row.data.staffId || null,
      staffName: row.data.staffName || null,
      role: row.data.role || null,
      type: row.data.type || "GENERAL",
      domain: row.domain,
      details: row.data.details || null,
      department: row.data.department || null,
      status: row.data.status || "OPEN",
      severity: row.data.severity || null,
      createdAt: row.data.createdAt || null,
    }));

  return {
    success: true,
    callerUid: uid,
    callerRole: role,
    count: exceptions.length,
    exceptions,
  };
});

/**
 * Rules-based exception review. This is deterministic policy assistance, not model inference.
 */
export const runStaffAiAudit = onCall(CALLABLE_OPTIONS, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const token = request.auth.token || {};
  const db = ensureDb();
  const role = getCallerRole(token);

  await assertActiveAccount(uid, token);

  const snap = await db.collection("staff_exceptions")
    .where("status", "in", ["OPEN", "PENDING_REVIEW", "IN_REVIEW"])
    .limit(100)
    .get();

  const permitted = snap.docs
    .map((doc) => {
      const data = doc.data() || {};
      const domain = exceptionDomain(data.type);
      return { id: doc.id, domain, data };
    })
    .filter((row) => canAccessExceptionDomain(token, role, row.domain));

  const recommendations = permitted.map((row) => {
    const type = upper(row.data.type);
    let recommendation = "Review the linked source records and record a human decision.";

    if (type.includes("MISSING_CLOCK")) {
      recommendation = "Review shift records and authorized work-order evidence before approving any attendance correction.";
    } else if (type.includes("OVERTIME")) {
      recommendation = "Compare approved shift time, work-order evidence, and requested overtime before deciding.";
    } else if (type.includes("BREAKDOWN") || type.includes("VEHICLE") || type.includes("ACCIDENT")) {
      recommendation = "Review vehicle custody, safety status, and replacement availability before operational action.";
    }

    return {
      exceptionId: row.id,
      type,
      domain: row.domain,
      recommendation,
    };
  });

  const domains = Array.from(new Set(permitted.map((row) => row.domain)));
  await db.collection("audit_logs").add({
    action: "STAFF_RULES_AUDIT_EXECUTED",
    actorUid: uid,
    actorRole: role,
    auditedCount: permitted.length,
    domains,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    success: true,
    totalAudited: permitted.length,
    domains,
    recommendations,
    message: `Rules-based exception review completed across ${permitted.length} authorized records.`,
  };
});

import type * as FirebaseFirestore from "firebase-admin/firestore";
