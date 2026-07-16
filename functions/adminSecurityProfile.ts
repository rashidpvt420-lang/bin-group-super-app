import { createHash, randomUUID } from "node:crypto";
import * as admin from "firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "ceo",
  "manager",
  "operations_admin",
  "finance_admin",
  "hr_admin",
  "support_admin",
  "hr_manager",
  "hr_staff",
  "finance_staff",
  "account_manager",
  "dispatcher",
  "operations_manager",
]);

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_ACTIVE_SESSIONS = 20;

const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const roleOf = (token: any) => text(token?.role || token?.userRole || token?.primaryRole, 80).toLowerCase();
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

async function requireAdmin(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const token = auth.token || {};
  const role = roleOf(token);
  const hasAdminAuthority =
    token.admin === true ||
    token.isAdmin === true ||
    token.super_admin === true ||
    token.superAdmin === true ||
    token.ceo === true ||
    ADMIN_ROLES.has(role);
  if (!hasAdminAuthority || token.suspended === true) {
    throw new HttpsError("permission-denied", "Approved Admin authority is required.");
  }

  const [userRecord, profileSnap] = await Promise.all([
    admin.auth().getUser(auth.uid),
    db.collection("users").doc(auth.uid).get(),
  ]);
  const profile = profileSnap.data() || {};
  if (
    userRecord.disabled ||
    profile.suspended === true ||
    ["suspended", "disabled", "rejected", "inactive"].includes(text(profile.status, 80).toLowerCase())
  ) {
    throw new HttpsError("permission-denied", "This Admin account is not active.");
  }
  return { uid: auth.uid, role, userRecord, profile };
}

function requestFingerprint(request: any) {
  const userAgent = text(request.rawRequest?.headers?.["user-agent"], 600);
  const forwardedFor = text(request.rawRequest?.headers?.["x-forwarded-for"], 300).split(",")[0]?.trim();
  const ip = forwardedFor || text(request.rawRequest?.ip, 120) || "unknown";
  return {
    userAgent,
    ipHash: sha256(ip),
    deviceHash: sha256(`${userAgent}|${ip}`),
  };
}

function safeClaims(claims: Record<string, unknown>) {
  const keys = [
    "role",
    "userRole",
    "primaryRole",
    "admin",
    "isAdmin",
    "super_admin",
    "superAdmin",
    "ceo",
    "manager",
    "permissions",
    "modules",
    "suspended",
  ];
  return Object.fromEntries(keys.filter((key) => claims[key] !== undefined).map((key) => [key, claims[key]]));
}

export const registerAdminSecuritySession = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const adminActor = await requireAdmin(request.auth);
    const now = Date.now();
    const sessionId = `as_${adminActor.uid}_${randomUUID().replace(/-/g, "")}`;
    const fingerprint = requestFingerprint(request);
    const sessionRef = db.collection("admin_security_sessions").doc(sessionId);

    await sessionRef.create({
      sessionId,
      adminUid: adminActor.uid,
      adminRole: adminActor.role,
      status: "ACTIVE",
      userAgent: fingerprint.userAgent,
      ipHash: fingerprint.ipHash,
      deviceHash: fingerprint.deviceHash,
      language: text(request.data?.language, 12) || null,
      createdAtMs: now,
      expiresAtMs: now + SESSION_TTL_MS,
      lastSeenAtMs: now,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(now + SESSION_TTL_MS),
    });

    await db.collection("audit_logs").add({
      action: "ADMIN_SECURITY_SESSION_REGISTERED",
      actorId: adminActor.uid,
      actorRole: adminActor.role,
      targetType: "admin_security_sessions",
      targetId: sessionId,
      deviceHash: fingerprint.deviceHash,
      createdAt: FieldValue.serverTimestamp(),
    });

    return { sessionId, expiresAtMs: now + SESSION_TTL_MS };
  },
);

export const getAdminSecurityProfile = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const adminActor = await requireAdmin(request.auth);
    const currentSessionId = text(request.data?.sessionId, 180);
    const [sessionSnap, auditSnap] = await Promise.all([
      db.collection("admin_security_sessions")
        .where("adminUid", "==", adminActor.uid)
        .limit(MAX_ACTIVE_SESSIONS)
        .get(),
      db.collection("audit_logs")
        .where("actorId", "==", adminActor.uid)
        .limit(20)
        .get(),
    ]);

    const sessions = sessionSnap.docs
      .map((document) => ({ id: document.id, ...document.data() } as any))
      .filter((session) => session.status === "ACTIVE" && Number(session.expiresAtMs || 0) > Date.now())
      .map((session) => ({
        sessionId: session.sessionId || session.id,
        current: Boolean(currentSessionId && (session.sessionId || session.id) === currentSessionId),
        userAgent: text(session.userAgent, 600),
        deviceHash: text(session.deviceHash, 80),
        createdAtMs: Number(session.createdAtMs || 0),
        lastSeenAtMs: Number(session.lastSeenAtMs || session.createdAtMs || 0),
        expiresAtMs: Number(session.expiresAtMs || 0),
        status: text(session.status, 40),
      }));

    const securityEvents = auditSnap.docs
      .map((document) => ({ id: document.id, ...document.data() } as any))
      .filter((event) => text(event.action, 120).includes("ADMIN") || text(event.targetType, 120).includes("admin"))
      .slice(0, 20)
      .map((event) => ({
        id: event.id,
        action: text(event.action, 120),
        targetType: text(event.targetType, 120),
        targetId: text(event.targetId, 180),
        createdAtMs: typeof event.createdAt?.toMillis === "function" ? event.createdAt.toMillis() : Number(event.createdAtMs || 0),
      }));

    const factors = adminActor.userRecord.multiFactor?.enrolledFactors || [];
    return {
      uid: adminActor.uid,
      displayName: adminActor.userRecord.displayName || text(adminActor.profile.displayName || adminActor.profile.fullName),
      email: adminActor.userRecord.email || text(adminActor.profile.email),
      emailVerified: adminActor.userRecord.emailVerified,
      phoneNumber: adminActor.userRecord.phoneNumber || text(adminActor.profile.phoneNumber || adminActor.profile.phone),
      photoURL: adminActor.userRecord.photoURL || text(adminActor.profile.photoURL || adminActor.profile.avatarUrl),
      role: adminActor.role,
      claims: safeClaims(adminActor.userRecord.customClaims || {}),
      disabled: adminActor.userRecord.disabled,
      mfa: {
        enrolled: factors.length > 0,
        factorCount: factors.length,
        factors: factors.map((factor) => ({
          uid: factor.uid,
          displayName: factor.displayName || null,
          factorId: factor.factorId,
          enrollmentTime: factor.enrollmentTime || null,
        })),
      },
      metadata: {
        creationTime: adminActor.userRecord.metadata.creationTime,
        lastSignInTime: adminActor.userRecord.metadata.lastSignInTime,
        lastRefreshTime: adminActor.userRecord.metadata.lastRefreshTime,
        tokensValidAfterTime: adminActor.userRecord.tokensValidAfterTime,
      },
      assignedRegion: text(adminActor.profile.assignedRegion || adminActor.profile.operatingRegion),
      permissions: adminActor.profile.permissions || adminActor.userRecord.customClaims?.permissions || {},
      modules: adminActor.profile.staffModules || adminActor.userRecord.customClaims?.modules || [],
      sessions,
      securityEvents,
    };
  },
);

export const revokeAdminSessions = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const adminActor = await requireAdmin(request.auth);
    if (text(request.data?.confirmation, 80) !== "REVOKE_ALL_ADMIN_SESSIONS") {
      throw new HttpsError("failed-precondition", "Type the exact session-revocation confirmation phrase.");
    }

    await admin.auth().revokeRefreshTokens(adminActor.uid);
    const sessions = await db.collection("admin_security_sessions").where("adminUid", "==", adminActor.uid).limit(100).get();
    const batch = db.batch();
    sessions.docs.forEach((document) => batch.set(document.ref, {
      status: "REVOKED",
      revokedAt: FieldValue.serverTimestamp(),
      revokedAtMs: Date.now(),
      revokedBy: adminActor.uid,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }));
    batch.set(db.collection("audit_logs").doc(), {
      action: "ADMIN_REVOKE_ALL_SESSIONS",
      actorId: adminActor.uid,
      actorRole: adminActor.role,
      targetType: "users",
      targetId: adminActor.uid,
      sessionCount: sessions.size,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    return { revoked: true, sessionCount: sessions.size, requiresReauthentication: true };
  },
);

export const lockOwnAdminAccount = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const adminActor = await requireAdmin(request.auth);
    if (text(request.data?.confirmation, 80) !== "LOCK_MY_ADMIN_ACCOUNT") {
      throw new HttpsError("failed-precondition", "Type the exact emergency-lock confirmation phrase.");
    }
    const reason = text(request.data?.reason, 500);
    if (reason.length < 8) throw new HttpsError("invalid-argument", "An emergency-lock reason is required.");

    await db.collection("audit_logs").add({
      action: "ADMIN_EMERGENCY_SELF_LOCK",
      actorId: adminActor.uid,
      actorRole: adminActor.role,
      targetType: "users",
      targetId: adminActor.uid,
      reason,
      createdAt: FieldValue.serverTimestamp(),
    });
    await Promise.all([
      admin.auth().revokeRefreshTokens(adminActor.uid),
      admin.auth().updateUser(adminActor.uid, { disabled: true }),
      db.collection("users").doc(adminActor.uid).set({
        status: "suspended",
        suspended: true,
        emergencyLocked: true,
        emergencyLockReason: reason,
        emergencyLockedAt: FieldValue.serverTimestamp(),
        emergencyLockedBy: adminActor.uid,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }),
    ]);
    return { locked: true };
  },
);
