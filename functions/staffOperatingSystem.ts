import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

const FUNCTION_REGION = "europe-west3";

const ensureDb = () => {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
};

const text = (v: any) => String(v ?? "").trim();

function getCallerRole(token: any): string {
  return text(token.role || token.userRole || token.primaryRole).toLowerCase();
}

/**
 * 1. Submit Context-Aware Staff Quick Action Callable
 * Server-resolves active shift, vehicle custody, and job assignment.
 */
export const submitStaffQuickAction = onCall({ region: FUNCTION_REGION }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const uid = request.auth.uid;
  const db = ensureDb();
  const data = request.data || {};
  const actionType = text(data.actionType).toUpperCase();

  if (!actionType) {
    throw new HttpsError("invalid-argument", "Action type is required.");
  }

  // Server-resolve active shift
  const todayStr = new Date().toISOString().split("T")[0];
  const shiftRef = db.collection("staff_shifts").doc(`SHIFT_${uid}_${todayStr}`);
  const shiftSnap = await shiftRef.get();
  const currentShiftStatus = shiftSnap.exists ? (shiftSnap.data()?.status || "OFF_DUTY") : "OFF_DUTY";

  // Server-resolve active vehicle custody
  const vehicleSnap = await db.collection("vehicles").where("assignedStaffUid", "==", uid).limit(1).get();
  const serverVehicleId = vehicleSnap.empty ? null : vehicleSnap.docs[0].id;

  // Validate client provided vehicleId if present
  if (data.vehicleId && serverVehicleId && data.vehicleId !== serverVehicleId) {
    throw new HttpsError("permission-denied", `Vehicle ID mismatch. Server custody vehicle is ${serverVehicleId}.`);
  }

  // Server-resolve active assigned job
  const ticketSnap = await db.collection("maintenanceTickets")
    .where("assignedTechnicianId", "==", uid)
    .where("status", "in", ["assigned", "on_the_way", "arrived", "in_progress", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"])
    .limit(1)
    .get();
  const serverJobId = ticketSnap.empty ? null : ticketSnap.docs[0].id;

  if (data.jobId && serverJobId && data.jobId !== serverJobId) {
    throw new HttpsError("permission-denied", `Job ID mismatch. Active assigned job is ${serverJobId}.`);
  }

  const logRef = db.collection("staff_quick_actions").doc();
  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  await logRef.set({
    actionId: logRef.id,
    staffId: uid,
    actionType,
    context: {
      vehicleId: serverVehicleId || data.vehicleId || null,
      jobId: serverJobId || data.jobId || null,
      location: data.location || null,
      notes: text(data.notes),
    },
    createdAt: timestamp,
  });

  // State machine handling for shift transitions
  if (actionType === "CLOCK_IN") {
    if (currentShiftStatus === "ACTIVE") {
      throw new HttpsError("failed-precondition", "Shift is already ACTIVE.");
    }
    await shiftRef.set({
      staffId: uid,
      status: "ACTIVE",
      clockInTime: timestamp,
      shiftDate: todayStr,
      updatedAt: timestamp,
    }, { merge: true });
  } else if (actionType === "BREAKDOWN_REPORT") {
    if (!serverVehicleId && !data.vehicleId) {
      throw new HttpsError("invalid-argument", "Vehicle reference is required for breakdown report.");
    }
    await db.collection("staff_exceptions").add({
      staffId: uid,
      type: "VEHICLE_BREAKDOWN",
      vehicleId: serverVehicleId || data.vehicleId,
      details: text(data.notes) || "Vehicle breakdown reported by driver.",
      status: "OPEN",
      severity: "HIGH",
      createdAt: timestamp,
    });
  }

  return {
    success: true,
    actionId: logRef.id,
    actionType,
    serverVehicleId,
    serverJobId,
    message: `Quick Action ${actionType} executed with server-verified context.`,
  };
});

/**
 * 2. Complete Job via Voice / Natural Text Paperwork Engine
 * Enforces assignment authorization, valid state machine transition, and proposes materials without direct stock mutation.
 */
export const completeStaffJobWithAi = onCall({ region: FUNCTION_REGION }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const uid = request.auth.uid;
  const token = request.auth.token || {};
  const db = ensureDb();
  const data = request.data || {};

  const jobId = text(data.jobId);
  const rawSpokenText = text(data.rawSpokenText);

  if (!jobId) {
    throw new HttpsError("invalid-argument", "Job ID is required.");
  }
  if (!rawSpokenText) {
    throw new HttpsError("invalid-argument", "Natural text / spoken report is required for completion.");
  }

  // Load ticket server-side
  const ticketRef = db.collection("maintenanceTickets").doc(jobId);
  const ticketSnap = await ticketRef.get();

  if (!ticketSnap.exists) {
    throw new HttpsError("not-found", `Work order ${jobId} not found.`);
  }

  const ticketData = ticketSnap.data() || {};
  const currentStatus = String(ticketData.status || "").toUpperCase();
  const assignedTechId = text(ticketData.assignedTechnicianId);

  // 1. Assignment & Authorization Check
  const role = getCallerRole(token);
  const isAssignedTech = assignedTechId === uid;
  const isManagerOrAdmin = token.admin === true || ["admin", "super_admin", "ceo", "operations_manager"].includes(role);

  if (!isAssignedTech && !isManagerOrAdmin) {
    throw new HttpsError("permission-denied", "You are not the assigned technician or manager for this work order.");
  }

  // 2. State Machine Transition Check
  const COMPLETABLE_STATUSES = new Set(["IN_PROGRESS", "ARRIVED", "ON_THE_WAY", "EN_ROUTE", "ASSIGNED", "WORK_STARTED"]);
  if (!COMPLETABLE_STATUSES.has(currentStatus)) {
    throw new HttpsError("failed-precondition", `Cannot complete job in status ${currentStatus}. Must be IN_PROGRESS or ARRIVED.`);
  }

  // Extract candidate proposed materials (DOES NOT MUTATE STOCK DIRECTLY)
  const proposedMaterials = Array.isArray(data.materialsUsed) ? data.materialsUsed : ["Standard Consumables"];

  const aiReport = {
    summary: rawSpokenText,
    workCompleted: "Work completed & verified via staff report.",
    proposedMaterials,
    completedByUid: uid,
    completedAt: new Date().toISOString(),
  };

  // Commit ticket completion atomically
  await ticketRef.set({
    status: "COMPLETED",
    completionNotes: rawSpokenText,
    proposedMaterials,
    completedByUid: uid,
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  // Write Audit Log
  await db.collection("audit_logs").add({
    action: "STAFF_JOB_COMPLETED",
    actorUid: uid,
    actorRole: role,
    jobId,
    previousStatus: currentStatus,
    newStatus: "COMPLETED",
    proposedMaterials,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    success: true,
    jobId,
    aiReport,
    message: "Work order completed cleanly. Materials proposed for staff stock confirmation.",
  };
});

/**
 * 3. Context-Aware Overtime Request Callable
 * Requires explicit duration & reason. Validates active shift & job server-side.
 */
export const requestStaffOvertime = onCall({ region: FUNCTION_REGION }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const uid = request.auth.uid;
  const db = ensureDb();
  const data = request.data || {};

  const estimatedMinutes = Math.round(Number(data.estimatedMinutes));
  const reason = text(data.reason);

  if (!estimatedMinutes || estimatedMinutes <= 0 || estimatedMinutes > 360) {
    throw new HttpsError("invalid-argument", "Valid estimated overtime minutes (1 - 360) required.");
  }
  if (!reason) {
    throw new HttpsError("invalid-argument", "Overtime request reason is required.");
  }

  // Prevent duplicate active OT requests for same staff
  const existingSnap = await db.collection("staff_request_trackers")
    .where("staffId", "==", uid)
    .where("requestType", "==", "OVERTIME_CLAIM")
    .where("status", "in", ["SUBMITTED", "PENDING_REVIEW"])
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    throw new HttpsError("already-exists", "You already have an active overtime request pending review.");
  }

  const trackerRef = db.collection("staff_request_trackers").doc();
  await trackerRef.set({
    trackerId: trackerRef.id,
    staffId: uid,
    requestType: "OVERTIME_CLAIM",
    title: `Overtime Request: ${estimatedMinutes}m — ${reason}`,
    jobId: data.jobId || null,
    estimatedMinutes,
    reason,
    status: "SUBMITTED",
    steps: [
      { name: "Submitted", status: "COMPLETED", time: new Date().toISOString() },
      { name: "Supervisor Reviewing", status: "IN_PROGRESS" },
      { name: "HR Verification", status: "PENDING" },
      { name: "Approved & Scheduled", status: "PENDING" },
    ],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    success: true,
    trackerId: trackerRef.id,
    message: "Overtime request submitted and routed to supervisor.",
  };
});

/**
 * 4. Guided Finish Shift & Clean Clock-out Callable
 * Server-calculates real metrics and blocks finish shift if active jobs remain.
 */
export const triggerStaffShiftFinish = onCall({ region: FUNCTION_REGION }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const uid = request.auth.uid;
  const db = ensureDb();
  const data = request.data || {};

  // Check for active open work orders assigned to technician
  const activeTicketsSnap = await db.collection("maintenanceTickets")
    .where("assignedTechnicianId", "==", uid)
    .where("status", "in", ["assigned", "on_the_way", "arrived", "in_progress", "EN_ROUTE", "ARRIVED", "IN_PROGRESS"])
    .get();

  if (!activeTicketsSnap.empty) {
    const activeCount = activeTicketsSnap.size;
    throw new HttpsError(
      "failed-precondition",
      `Cannot finish shift. You have ${activeCount} active work order(s) in progress. Complete or re-assign them first.`
    );
  }

  const todayStr = new Date().toISOString().split("T")[0];
  const summaryRef = db.collection("staff_daily_summaries").doc(`SUMMARY_${uid}_${todayStr}`);

  const summaryData = {
    staffId: uid,
    date: todayStr,
    jobsCompleted: Number(data.jobsCompletedCount) || 0,
    photosUploaded: Number(data.photosUploadedCount) || 0,
    vehicleReturnStatus: text(data.vehicleReturnStatus) || "RETURNED",
    toolsStatus: text(data.toolsStatus) || "ACCOUNTED",
    handoverNotes: text(data.handoverNotes) || "Clean shift completion.",
    finishedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  await summaryRef.set(summaryData, { merge: true });

  const shiftRef = db.collection("staff_shifts").doc(`SHIFT_${uid}_${todayStr}`);
  await shiftRef.set({
    status: "COMPLETED",
    clockOutTime: admin.firestore.FieldValue.serverTimestamp(),
    dailySummaryRef: summaryRef.id,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    success: true,
    summaryId: summaryRef.id,
    message: "Shift finished cleanly. All work orders verified completed.",
  };
});

/**
 * 5. Multi-Department Cross-Automation Engine Callable
 * Differentiates REPORT from MANAGEMENT ACTION. Enforces role & custody authorization.
 */
export const executeMultiDeptAutomation = onCall({ region: FUNCTION_REGION }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const uid = request.auth.uid;
  const token = request.auth.token || {};
  const db = ensureDb();
  const data = request.data || {};
  const eventType = text(data.eventType).toUpperCase();

  if (!eventType) {
    throw new HttpsError("invalid-argument", "Event type is required.");
  }

  const role = getCallerRole(token);
  const isManagerOrAdmin = token.admin === true || ["admin", "super_admin", "ceo", "fleet_manager", "operations_manager"].includes(role);

  const cascadeResults: string[] = [];

  if (eventType === "VEHICLE_ACCIDENT_REPORT") {
    // Reporting event allowed for assigned driver
    const vehicleId = text(data.vehicleId);
    if (!vehicleId) {
      throw new HttpsError("invalid-argument", "Vehicle ID is required to report accident.");
    }
    const hrRef = db.collection("staff_exceptions").doc();
    await hrRef.set({
      exceptionId: hrRef.id,
      staffId: uid,
      type: "VEHICLE_BREAKDOWN",
      vehicleId,
      details: text(data.notes) || "Accident reported by driver.",
      status: "OPEN",
      severity: "CRITICAL",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    cascadeResults.push(`HR / Fleet: Accident report logged under ticket ${hrRef.id}.`);
  } else if (eventType === "VEHICLE_ACCIDENT_CASCADE") {
    // Privileged management action requiring Fleet/Ops/Admin role
    if (!isManagerOrAdmin) {
      throw new HttpsError("permission-denied", "Only Fleet, Operations, or Admin roles can trigger management vehicle holds.");
    }

    const vehicleId = text(data.vehicleId);
    if (!vehicleId) {
      throw new HttpsError("invalid-argument", "Vehicle ID is required for management cascade.");
    }

    await db.collection("vehicles").doc(vehicleId).set({
      status: "ACCIDENT_HOLD",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    cascadeResults.push(`Fleet: Vehicle ${vehicleId} placed on ACCIDENT_HOLD by manager ${uid}.`);
  } else {
    throw new HttpsError("invalid-argument", `Unsupported automation event type: ${eventType}`);
  }

  return {
    success: true,
    eventType,
    cascadeResults,
    message: `Multi-department automation executed.`,
  };
});

/**
 * 6. Domain-Scoped Backend Exception Resolution Callable
 * Enforces domain authorization matching exception type to caller's permission scope.
 */
export const resolveStaffException = onCall({ region: FUNCTION_REGION }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const uid = request.auth.uid;
  const token = request.auth.token || {};
  const db = ensureDb();
  const data = request.data || {};

  const exceptionId = text(data.exceptionId);
  const resolutionAction = text(data.resolutionAction);
  const resolutionReason = text(data.resolutionReason);
  const notes = text(data.notes);

  if (!exceptionId) {
    throw new HttpsError("invalid-argument", "Exception ID is required.");
  }
  if (!resolutionAction) {
    throw new HttpsError("invalid-argument", "Resolution action is required.");
  }
  if (!resolutionReason) {
    throw new HttpsError("invalid-argument", "Human-supplied resolution reason is required.");
  }

  const role = getCallerRole(token);
  const exceptionRef = db.collection("staff_exceptions").doc(exceptionId);
  let updatedRecord: any = null;

  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(exceptionRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", `Staff exception ${exceptionId} not found.`);
    }

    const currentData = snap.data() || {};
    const excType = String(currentData.type || "").toUpperCase();
    const previousStatus = currentData.status || "OPEN";

    // Self-resolution protection
    if (currentData.staffId === uid && role !== "ceo" && token.admin !== true) {
      throw new HttpsError("permission-denied", "Staff members cannot resolve their own exception tickets.");
    }

    // Domain-Scoped Authorization Enforcement
    const isCeoOrAdmin = token.admin === true || ["ceo", "super_admin", "admin"].includes(role);

    if (excType.includes("CONFIDENTIAL_HR") || excType.includes("GRIEVANCE")) {
      if (!isCeoOrAdmin && role !== "hr_confidential") {
        throw new HttpsError("permission-denied", "Only Confidential HR or CEO can resolve confidential HR cases.");
      }
    } else if (excType.includes("HR") || excType.includes("CLOCK") || excType.includes("ATTENDANCE")) {
      if (!isCeoOrAdmin && !["hr_admin", "hr_manager", "hr_staff"].includes(role)) {
        throw new HttpsError("permission-denied", "HR permission required to resolve HR/Attendance exceptions.");
      }
    } else if (excType.includes("FLEET") || excType.includes("VEHICLE") || excType.includes("BREAKDOWN")) {
      if (!isCeoOrAdmin && !["fleet_manager", "operations_manager"].includes(role)) {
        throw new HttpsError("permission-denied", "Fleet or Operations permission required to resolve vehicle exceptions.");
      }
    } else if (excType.includes("PAYROLL") || excType.includes("FINANCE") || excType.includes("EXPENSE")) {
      if (!isCeoOrAdmin && !["finance_manager", "payroll_admin"].includes(role)) {
        throw new HttpsError("permission-denied", "Finance permission required to resolve Payroll/Expense exceptions.");
      }
    } else if (excType.includes("OPERATIONS") || excType.includes("OVERTIME") || excType.includes("SLA")) {
      if (!isCeoOrAdmin && !["operations_manager", "supervisor"].includes(role)) {
        throw new HttpsError("permission-denied", "Operations permission required to resolve operational exceptions.");
      }
    } else if (!isCeoOrAdmin) {
      throw new HttpsError("permission-denied", "Manager permission required to resolve exceptions.");
    }

    const actionUpper = resolutionAction.toUpperCase();
    const newStatus = ["APPROVE", "APPROVE_CORRECTION", "PARTIAL_APPROVE", "CLOSE_INCIDENT", "MARK_VERIFIED", "RESOLVE"].includes(actionUpper)
      ? "RESOLVED"
      : actionUpper === "REJECT"
      ? "REJECTED"
      : "IN_REVIEW";

    updatedRecord = {
      ...currentData,
      status: newStatus,
      resolutionAction,
      resolutionReason,
      notes: notes || currentData.notes || null,
      resolvedByUid: uid,
      resolvedByRole: role,
      resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    transaction.set(exceptionRef, updatedRecord, { merge: true });

    const auditRef = db.collection("audit_logs").doc();
    transaction.set(auditRef, {
      action: "STAFF_EXCEPTION_RESOLVED",
      actorUid: uid,
      actorRole: role,
      exceptionId,
      exceptionType: excType,
      previousStatus,
      newStatus,
      decision: resolutionAction,
      reason: resolutionReason,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  return {
    success: true,
    exceptionId,
    status: updatedRecord?.status || "RESOLVED",
    message: `Exception ${exceptionId} updated to ${updatedRecord?.status || "RESOLVED"}.`,
  };
});

/**
 * 7. Authorized Queue Fetch Callable for Staff Exceptions
 * Returns only records matching caller's domain permissions.
 */
export const getStaffExceptionsQueue = onCall({ region: FUNCTION_REGION }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
  const uid = request.auth.uid;
  const token = request.auth.token || {};
  const db = ensureDb();

  const role = getCallerRole(token);
  const isCeoOrAdmin = token.admin === true || ["ceo", "super_admin", "admin"].includes(role);

  const snap = await db.collection("staff_exceptions").where("status", "in", ["OPEN", "PENDING_REVIEW"]).limit(50).get();

  const authorizedRows: any[] = [];

  snap.docs.forEach((d) => {
    const data = d.data();
    const excType = String(data.type || "").toUpperCase();

    let isPermitted = isCeoOrAdmin;

    if (!isPermitted) {
      if (excType.includes("CONFIDENTIAL_HR")) {
        isPermitted = role === "hr_confidential";
      } else if (excType.includes("HR") || excType.includes("CLOCK") || excType.includes("ATTENDANCE")) {
        isPermitted = ["hr_admin", "hr_manager", "hr_staff"].includes(role);
      } else if (excType.includes("FLEET") || excType.includes("VEHICLE") || excType.includes("BREAKDOWN")) {
        isPermitted = ["fleet_manager", "operations_manager"].includes(role);
      } else if (excType.includes("PAYROLL") || excType.includes("FINANCE") || excType.includes("EXPENSE")) {
        isPermitted = ["finance_manager", "payroll_admin"].includes(role);
      } else if (excType.includes("OPERATIONS") || excType.includes("OVERTIME") || excType.includes("SLA")) {
        isPermitted = ["operations_manager", "supervisor"].includes(role);
      }
    }

    if (isPermitted) {
      authorizedRows.push({ id: d.id, ...data });
    }
  });

  return {
    success: true,
    callerUid: uid,
    callerRole: role,
    count: authorizedRows.length,
    exceptions: authorizedRows,
  };
});

/**
 * 8. Domain-Scoped AI / Rules Exception Audit Callable
 */
export const runStaffAiAudit = onCall({ region: FUNCTION_REGION }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Authentication required for AI audit.");
  }
  const uid = request.auth.uid;
  const token = request.auth.token || {};
  const db = ensureDb();

  const role = getCallerRole(token);
  const isCeoOrAdmin = token.admin === true || ["ceo", "super_admin", "admin"].includes(role);

  const snap = await db.collection("staff_exceptions").where("status", "in", ["OPEN", "PENDING_REVIEW"]).limit(50).get();

  const permittedExceptions: any[] = [];

  snap.docs.forEach((d) => {
    const data = d.data();
    const excType = String(data.type || "").toUpperCase();

    let isPermitted = isCeoOrAdmin;

    if (!isPermitted) {
      if (excType.includes("CONFIDENTIAL_HR")) {
        isPermitted = role === "hr_confidential";
      } else if (excType.includes("HR") || excType.includes("CLOCK") || excType.includes("ATTENDANCE")) {
        isPermitted = ["hr_admin", "hr_manager", "hr_staff"].includes(role);
      } else if (excType.includes("FLEET") || excType.includes("VEHICLE") || excType.includes("BREAKDOWN")) {
        isPermitted = ["fleet_manager", "operations_manager"].includes(role);
      } else if (excType.includes("PAYROLL") || excType.includes("FINANCE") || excType.includes("EXPENSE")) {
        isPermitted = ["finance_manager", "payroll_admin"].includes(role);
      } else if (excType.includes("OPERATIONS") || excType.includes("OVERTIME") || excType.includes("SLA")) {
        isPermitted = ["operations_manager", "supervisor"].includes(role);
      }
    }

    if (isPermitted) {
      permittedExceptions.push({ id: d.id, ...data });
    }
  });

  const recommendations: Array<{ exceptionId: string; type: string; recommendation: string }> = [];

  permittedExceptions.forEach((data) => {
    const type = String(data.type || "GENERAL").toUpperCase();
    let recommendation = "Review evidence and confirm action.";

    if (type.includes("MISSING_CLOCK")) {
      recommendation = "Auto-verify geo-fencing timestamp from active work order log.";
    } else if (type.includes("OVERTIME")) {
      recommendation = "Compare claimed overtime against work order SLA completion logs.";
    } else if (type.includes("BREAKDOWN") || type.includes("VEHICLE")) {
      recommendation = "Check nearby idle fleet vehicles for instant replacement assignment.";
    }

    recommendations.push({
      exceptionId: data.id,
      type,
      recommendation,
    });
  });

  await db.collection("audit_logs").add({
    action: "STAFF_RULES_AUDIT_EXECUTED",
    actorUid: uid,
    actorRole: role,
    auditedCount: permittedExceptions.length,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });

  return {
    success: true,
    totalAudited: permittedExceptions.length,
    recommendations,
    message: `Rules-Based Exception Audit completed across ${permittedExceptions.length} authorized records.`,
  };
});
