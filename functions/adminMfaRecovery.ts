import { createHash, randomUUID } from "node:crypto";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const RECOVERY_TTL_MS = 30 * 60 * 1000;
const RECOVERY_APPROVER_ROLES = new Set(["ceo", "super_admin"]);
const ADMIN_TARGET_ROLES = new Set([
  "admin",
  "super_admin",
  "ceo",
  "manager",
  "operations_admin",
  "finance_admin",
  "account_manager",
  "operations_manager",
  "hr_manager",
  "hr_staff",
]);
const PENDING_STATES = new Set(["PENDING_SECOND_APPROVAL", "EXECUTING"]);

const text = (value: unknown, max = 1000) => String(value ?? "").trim().slice(0, max);
const lower = (value: unknown) => text(value, 200).toLowerCase();
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const secondFactorOf = (token: any) => text(token?.firebase?.sign_in_second_factor || token?.sign_in_second_factor, 120);
const roleOf = (token: any, profile: FirebaseFirestore.DocumentData = {}) => lower(
  token?.role || token?.userRole || token?.primaryRole || profile.role || profile.userRole || profile.primaryRole,
);
const toMillis = (value: unknown) => {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value === "object" && typeof (value as any).toMillis === "function") return Number((value as any).toMillis());
  if (value instanceof Date) return value.getTime();
  return Number(value || 0);
};

function factorState(user: admin.auth.UserRecord) {
  const factors = [...(user.multiFactor?.enrolledFactors || [])]
    .map((factor) => ({
      uid: text(factor.uid, 180),
      factorId: text(factor.factorId, 80),
      enrollmentTime: text(factor.enrollmentTime, 120),
    }))
    .sort((a, b) => a.uid.localeCompare(b.uid));
  return {
    count: factors.length,
    hash: sha256(JSON.stringify(factors)),
  };
}

function maskedEmail(value: unknown) {
  const email = lower(value);
  const [local = "", domain = ""] = email.split("@");
  if (!local || !domain) return "";
  return `${local.slice(0, 2)}${"•".repeat(Math.max(2, Math.min(8, local.length - 2)))}@${domain}`;
}

async function requireRecoveryApprover(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const [userRecord, profileSnap] = await Promise.all([
    admin.auth().getUser(auth.uid),
    db.collection("users").doc(auth.uid).get(),
  ]);
  const profile = profileSnap.data() || {};
  const role = roleOf(auth.token || {}, profile);
  if (!RECOVERY_APPROVER_ROLES.has(role)) {
    throw new HttpsError("permission-denied", "CEO or Super Admin recovery authority is required.");
  }
  if (
    userRecord.disabled ||
    auth.token?.suspended === true ||
    profile.suspended === true ||
    ["suspended", "disabled", "rejected", "inactive"].includes(lower(profile.status))
  ) {
    throw new HttpsError("permission-denied", "This recovery approver is not active.");
  }
  if (!userRecord.emailVerified) {
    throw new HttpsError("failed-precondition", "The recovery approver email must be verified.");
  }
  if ((userRecord.multiFactor?.enrolledFactors || []).length <= 0) {
    throw new HttpsError("failed-precondition", "The recovery approver must have enrolled MFA.");
  }
  if (!secondFactorOf(auth.token || {})) {
    throw new HttpsError("permission-denied", "A verified second-factor Admin sign-in is required.");
  }
  return {
    uid: auth.uid,
    role,
    email: userRecord.email || null,
    displayName: userRecord.displayName || text(profile.displayName, 160) || role,
  };
}

async function resolveTarget(data: any, actorUid: string) {
  const targetUidInput = text(data?.targetUid, 180);
  const targetEmailInput = lower(data?.targetEmail);
  if (!targetUidInput && !targetEmailInput) {
    throw new HttpsError("invalid-argument", "Target Admin UID or email is required.");
  }
  const target = targetUidInput
    ? await admin.auth().getUser(targetUidInput)
    : await admin.auth().getUserByEmail(targetEmailInput);
  if (target.uid === actorUid) {
    throw new HttpsError("failed-precondition", "An Admin cannot initiate MFA recovery for their own account.");
  }
  const profileSnap = await db.collection("users").doc(target.uid).get();
  if (!profileSnap.exists) throw new HttpsError("not-found", "Target Admin profile not found.");
  const profile = profileSnap.data() || {};
  const role = roleOf(target.customClaims || {}, profile);
  if (!ADMIN_TARGET_ROLES.has(role)) {
    throw new HttpsError("failed-precondition", "The target account is not an approved Admin or staff account.");
  }
  if (
    target.disabled ||
    profile.suspended === true ||
    ["suspended", "disabled", "rejected", "inactive"].includes(lower(profile.status))
  ) {
    throw new HttpsError("failed-precondition", "The target Admin account is not active.");
  }
  const state = factorState(target);
  if (state.count <= 0) {
    throw new HttpsError("failed-precondition", "The target Admin has no enrolled MFA factor to recover.");
  }
  return { target, profile, role, state };
}

async function markExecutionFailure(requestId: string, executionId: string, message: string) {
  const requestRef = db.collection("admin_mfa_recovery_requests").doc(requestId);
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(requestRef);
    if (!snap.exists) return;
    const data = snap.data() || {};
    if (text(data.executionId, 180) !== executionId || text(data.status, 80) !== "EXECUTING") return;
    const now = FieldValue.serverTimestamp();
    transaction.update(requestRef, {
      status: "FAILED",
      failureCode: "AUTH_STATE_VALIDATION_FAILED",
      failureMessageHash: sha256(message),
      failedAt: now,
      updatedAt: now,
    });
    transaction.set(db.collection("audit_logs").doc(), {
      action: "ADMIN_MFA_RECOVERY_FAILED",
      actorId: text(data.secondApproverUid, 180) || null,
      actorRole: text(data.secondApproverRole, 80) || null,
      targetType: "admin_mfa_recovery_requests",
      targetId: requestId,
      targetUid: text(data.targetUid, 180),
      executionId,
      failureMessageHash: sha256(message),
      sensitiveValuesExcluded: true,
      createdAt: now,
    });
  });
}

export const createAdminMfaRecoveryRequest = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actor = await requireRecoveryApprover(request.auth);
    const incidentReference = text(request.data?.incidentReference, 120).toUpperCase();
    const reason = text(request.data?.reason, 1200);
    if (!/^[A-Z0-9][A-Z0-9._/-]{5,119}$/.test(incidentReference)) {
      throw new HttpsError("invalid-argument", "A valid incident or support reference is required.");
    }
    if (reason.length < 20) {
      throw new HttpsError("invalid-argument", "A recovery reason of at least 20 characters is required.");
    }

    const { target, profile, role, state } = await resolveTarget(request.data, actor.uid);
    const targetRef = db.collection("users").doc(target.uid);
    const requestRef = db.collection("admin_mfa_recovery_requests").doc();
    const auditRef = db.collection("audit_logs").doc();
    const nowMs = Date.now();
    const expiresAt = Timestamp.fromMillis(nowMs + RECOVERY_TTL_MS);

    await db.runTransaction(async (transaction) => {
      const freshTargetSnap = await transaction.get(targetRef);
      if (!freshTargetSnap.exists) throw new HttpsError("not-found", "Target Admin profile not found.");
      const freshProfile = freshTargetSnap.data() || {};
      const activeRequestId = text(freshProfile.activeAdminMfaRecoveryRequestId, 180);
      if (activeRequestId) {
        const activeRef = db.collection("admin_mfa_recovery_requests").doc(activeRequestId);
        const activeSnap = await transaction.get(activeRef);
        const active = activeSnap.data() || {};
        const activeStatus = text(active.status, 80);
        if (activeSnap.exists && PENDING_STATES.has(activeStatus) && toMillis(active.expiresAt) > nowMs) {
          throw new HttpsError("already-exists", "A live MFA recovery request already exists for this Admin.");
        }
      }

      const now = FieldValue.serverTimestamp();
      transaction.create(requestRef, {
        requestId: requestRef.id,
        status: "PENDING_SECOND_APPROVAL",
        targetUid: target.uid,
        targetEmail: target.email || profile.email || null,
        targetEmailMasked: maskedEmail(target.email || profile.email),
        targetDisplayName: target.displayName || text(profile.displayName, 160) || role,
        targetRole: role,
        factorCountBefore: state.count,
        factorStateHash: state.hash,
        incidentReference,
        reason,
        reasonHash: sha256(reason),
        reasonLength: reason.length,
        firstApproverUid: actor.uid,
        firstApproverRole: actor.role,
        firstApproverDisplayName: actor.displayName,
        firstApprovedAt: now,
        expiresAt,
        createdAt: now,
        updatedAt: now,
        sensitiveFactorValuesExcluded: true,
      });
      transaction.set(targetRef, {
        activeAdminMfaRecoveryRequestId: requestRef.id,
        adminMfaRecoveryState: "PENDING_SECOND_APPROVAL",
        adminMfaRecoveryRequestedAt: now,
        updatedAt: now,
      }, { merge: true });
      transaction.create(auditRef, {
        action: "ADMIN_MFA_RECOVERY_REQUESTED",
        actorId: actor.uid,
        actorRole: actor.role,
        targetType: "admin_mfa_recovery_requests",
        targetId: requestRef.id,
        targetUid: target.uid,
        incidentReference,
        reasonHash: sha256(reason),
        factorCountBefore: state.count,
        secondApprovalRequired: true,
        sensitiveValuesExcluded: true,
        createdAt: now,
      });
    });

    return {
      status: "SUCCESS",
      requestId: requestRef.id,
      recoveryStatus: "PENDING_SECOND_APPROVAL",
      targetEmailMasked: maskedEmail(target.email || profile.email),
      expiresAtMs: expiresAt.toMillis(),
    };
  },
);

export const listAdminMfaRecoveryRequests = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    await requireRecoveryApprover(request.auth);
    const snapshot = await db.collection("admin_mfa_recovery_requests")
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    const nowMs = Date.now();
    return {
      status: "SUCCESS",
      requests: snapshot.docs.map((doc) => {
        const data = doc.data() || {};
        const storedStatus = text(data.status, 80);
        const expired = PENDING_STATES.has(storedStatus) && toMillis(data.expiresAt) <= nowMs;
        return {
          requestId: doc.id,
          status: expired ? "EXPIRED" : storedStatus,
          targetUid: text(data.targetUid, 180),
          targetEmailMasked: text(data.targetEmailMasked, 240),
          targetDisplayName: text(data.targetDisplayName, 180),
          targetRole: text(data.targetRole, 80),
          incidentReference: text(data.incidentReference, 120),
          reason: text(data.reason, 1200),
          factorCountBefore: Number(data.factorCountBefore || 0),
          firstApproverUid: text(data.firstApproverUid, 180),
          firstApproverDisplayName: text(data.firstApproverDisplayName, 180),
          secondApproverUid: text(data.secondApproverUid, 180),
          createdAtMs: toMillis(data.createdAt),
          expiresAtMs: toMillis(data.expiresAt),
          completedAtMs: toMillis(data.completedAt),
        };
      }),
    };
  },
);

export const approveAdminMfaRecoveryRequest = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true, timeoutSeconds: 120 },
  async (request) => {
    const actor = await requireRecoveryApprover(request.auth);
    const requestId = text(request.data?.requestId, 180);
    if (!requestId || !/^[A-Za-z0-9_-]{1,180}$/.test(requestId)) {
      throw new HttpsError("invalid-argument", "A valid recovery requestId is required.");
    }
    const requestRef = db.collection("admin_mfa_recovery_requests").doc(requestId);
    const executionId = `mfa_recovery_${randomUUID().replace(/-/g, "")}`;
    const nowMs = Date.now();

    const claimed = await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(requestRef);
      if (!snap.exists) throw new HttpsError("not-found", "MFA recovery request not found.");
      const data = snap.data() || {};
      const status = text(data.status, 80);
      const targetUid = text(data.targetUid, 180);
      if (!targetUid || targetUid === actor.uid) {
        throw new HttpsError("failed-precondition", "The second approver cannot be the target Admin.");
      }
      if (text(data.firstApproverUid, 180) === actor.uid) {
        throw new HttpsError("failed-precondition", "The first approver cannot provide the second approval.");
      }
      if (toMillis(data.expiresAt) <= nowMs) {
        transaction.update(requestRef, { status: "EXPIRED", expiredAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        throw new HttpsError("deadline-exceeded", "The MFA recovery request has expired.");
      }
      if (status === "COMPLETED") {
        return { data, executionId: text(data.executionId, 180), resuming: true, completed: true };
      }
      if (status === "EXECUTING") {
        if (text(data.secondApproverUid, 180) !== actor.uid) {
          throw new HttpsError("aborted", "Another second approver is already executing this recovery.");
        }
        return { data, executionId: text(data.executionId, 180), resuming: true, completed: false };
      }
      if (status !== "PENDING_SECOND_APPROVAL") {
        throw new HttpsError("failed-precondition", `Recovery request is not approvable from status ${status || "UNKNOWN"}.`);
      }
      const now = FieldValue.serverTimestamp();
      transaction.update(requestRef, {
        status: "EXECUTING",
        secondApproverUid: actor.uid,
        secondApproverRole: actor.role,
        secondApproverDisplayName: actor.displayName,
        secondApprovedAt: now,
        executionId,
        executionStartedAt: now,
        updatedAt: now,
      });
      transaction.set(db.collection("audit_logs").doc(), {
        action: "ADMIN_MFA_RECOVERY_SECOND_APPROVED",
        actorId: actor.uid,
        actorRole: actor.role,
        targetType: "admin_mfa_recovery_requests",
        targetId: requestId,
        targetUid,
        firstApproverUid: text(data.firstApproverUid, 180),
        executionId,
        twoDistinctApprovers: true,
        sensitiveValuesExcluded: true,
        createdAt: now,
      });
      return { data, executionId, resuming: false, completed: false };
    });

    if (claimed.completed) {
      return { status: "SUCCESS", requestId, recoveryStatus: "COMPLETED", idempotent: true };
    }

    const targetUid = text(claimed.data.targetUid, 180);
    const expectedHash = text(claimed.data.factorStateHash, 128);
    let factorsCleared = false;
    try {
      const target = await admin.auth().getUser(targetUid);
      const currentState = factorState(target);
      if (!claimed.resuming && currentState.count <= 0) {
        throw new Error("Target MFA factors were removed outside the approved recovery workflow.");
      }
      if (currentState.count > 0 && currentState.hash !== expectedHash) {
        throw new Error("Target MFA factor state changed after the first approval.");
      }
      if (currentState.count > 0) {
        await admin.auth().updateUser(targetUid, { multiFactor: { enrolledFactors: null } });
      }
      factorsCleared = true;
      await admin.auth().revokeRefreshTokens(targetUid);

      await db.runTransaction(async (transaction) => {
        const [freshRequestSnap, targetProfileSnap] = await Promise.all([
          transaction.get(requestRef),
          transaction.get(db.collection("users").doc(targetUid)),
        ]);
        if (!freshRequestSnap.exists) throw new HttpsError("not-found", "Recovery request disappeared during execution.");
        const freshRequest = freshRequestSnap.data() || {};
        if (
          text(freshRequest.status, 80) !== "EXECUTING" ||
          text(freshRequest.executionId, 180) !== claimed.executionId ||
          text(freshRequest.secondApproverUid, 180) !== actor.uid
        ) {
          throw new HttpsError("aborted", "Recovery execution ownership changed.");
        }
        if (!targetProfileSnap.exists) throw new HttpsError("not-found", "Target Admin profile not found.");
        const now = FieldValue.serverTimestamp();
        transaction.update(requestRef, {
          status: "COMPLETED",
          completedAt: now,
          completedBy: actor.uid,
          factorCountAfter: 0,
          refreshTokensRevoked: true,
          updatedAt: now,
        });
        transaction.set(targetProfileSnap.ref, {
          activeAdminMfaRecoveryRequestId: FieldValue.delete(),
          adminMfaRecoveryRequired: true,
          adminMfaRecoveryState: "RESET_COMPLETED_REENROLL_REQUIRED",
          adminMfaRecoveryCompletedAt: now,
          adminMfaRecoveryRequestId: requestId,
          updatedAt: now,
        }, { merge: true });
        transaction.set(db.collection("notifications").doc(), {
          userId: targetUid,
          role: "admin",
          type: "ADMIN_MFA_RECOVERY_COMPLETED",
          title: "Admin MFA recovery completed",
          body: "Your previous second factors were removed by two approved administrators. Sign in and enroll a new protected factor before operational access is restored.",
          link: "/profile",
          read: false,
          status: "PENDING",
          createdAt: now,
          updatedAt: now,
        });
        transaction.set(db.collection("audit_logs").doc(), {
          action: "ADMIN_MFA_RECOVERY_EXECUTED",
          actorId: actor.uid,
          actorRole: actor.role,
          targetType: "users",
          targetId: targetUid,
          requestId,
          executionId: claimed.executionId,
          firstApproverUid: text(freshRequest.firstApproverUid, 180),
          secondApproverUid: actor.uid,
          factorCountBefore: Number(freshRequest.factorCountBefore || 0),
          factorCountAfter: 0,
          refreshTokensRevoked: true,
          reEnrollmentRequired: true,
          sensitiveValuesExcluded: true,
          createdAt: now,
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "MFA recovery execution failed.";
      if (!factorsCleared) await markExecutionFailure(requestId, claimed.executionId, message);
      throw new HttpsError(
        "internal",
        factorsCleared
          ? "MFA factors were cleared but finalization did not complete. The same second approver must retry this request."
          : message,
      );
    }

    return { status: "SUCCESS", requestId, recoveryStatus: "COMPLETED", idempotent: false };
  },
);

export const finalizeOwnAdminMfaRecovery = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
    const uid = request.auth.uid;
    const [userRecord, profileSnap] = await Promise.all([
      admin.auth().getUser(uid),
      db.collection("users").doc(uid).get(),
    ]);
    if (!profileSnap.exists) throw new HttpsError("not-found", "Admin profile not found.");
    const profile = profileSnap.data() || {};
    const role = roleOf(request.auth.token || {}, profile);
    if (!ADMIN_TARGET_ROLES.has(role) || userRecord.disabled) {
      throw new HttpsError("permission-denied", "Approved active Admin authority is required.");
    }
    if ((userRecord.multiFactor?.enrolledFactors || []).length <= 0) {
      throw new HttpsError("failed-precondition", "Enroll a new Firebase MFA factor before finalizing recovery.");
    }
    if (profile.adminMfaRecoveryRequired !== true) {
      return { status: "SUCCESS", recoveryStatus: text(profile.adminMfaRecoveryState, 80) || "NOT_REQUIRED", idempotent: true };
    }
    const userRef = db.collection("users").doc(uid);
    const now = FieldValue.serverTimestamp();
    await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(userRef);
      if (!fresh.exists) throw new HttpsError("not-found", "Admin profile not found.");
      transaction.set(userRef, {
        adminMfaRecoveryRequired: false,
        adminMfaRecoveryState: "REENROLLED",
        adminMfaRecoveryReenrolledAt: now,
        updatedAt: now,
      }, { merge: true });
      transaction.set(db.collection("audit_logs").doc(), {
        action: "ADMIN_MFA_RECOVERY_REENROLLED",
        actorId: uid,
        actorRole: role,
        targetType: "users",
        targetId: uid,
        factorCount: (userRecord.multiFactor?.enrolledFactors || []).length,
        sensitiveValuesExcluded: true,
        createdAt: now,
      });
    });
    return { status: "SUCCESS", recoveryStatus: "REENROLLED", idempotent: false };
  },
);
