import * as admin from "firebase-admin";
import type * as FirebaseFirestore from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  classifyInstallationRegistration,
  isVerifiedAndroidAppCheckAppId,
  normalizeInstallationHash,
  protectedBrowserFixtureId,
  TECHNICIAN_ANDROID_FIREBASE_APP_ID,
} from "./technicianInstallationContract";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const CONFIGURED_ANDROID_APP_ID = String(
  process.env.TECHNICIAN_ANDROID_FIREBASE_APP_ID || TECHNICIAN_ANDROID_FIREBASE_APP_ID,
).trim();

const text = (value: unknown) => String(value || "").trim();
const role = (value: unknown) => text(value).toLowerCase();
const DEVICE_RESET_ADMIN_ROLES = new Set(["admin", "super_admin", "ceo"]);

async function requireDeviceResetAdmin(auth: any) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Admin login required.");
  const token = auth.token || {};
  const tokenRole = role(token.role || token.userRole || token.primaryRole);
  const tokenAuthorized =
    token.suspended !== true &&
    (token.admin === true ||
      token.isAdmin === true ||
      token.superAdmin === true ||
      token.super_admin === true ||
      token.ceo === true ||
      DEVICE_RESET_ADMIN_ROLES.has(tokenRole));
  if (!tokenAuthorized || token.email_verified !== true || !token.firebase?.sign_in_second_factor) {
    throw new HttpsError("permission-denied", "A verified Founder/Admin MFA session is required for Technician device re-registration.");
  }

  const record = await admin.auth().getUser(auth.uid);
  const claims = record.customClaims || {};
  const currentRole = role(claims.role || claims.userRole || claims.primaryRole);
  const currentAuthorized =
    claims.suspended !== true &&
    (claims.admin === true ||
      claims.isAdmin === true ||
      claims.superAdmin === true ||
      claims.super_admin === true ||
      claims.ceo === true ||
      DEVICE_RESET_ADMIN_ROLES.has(currentRole));
  if (record.disabled || !record.emailVerified || !currentAuthorized) {
    throw new HttpsError("permission-denied", "Current Founder/Admin authority is inactive or no longer valid.");
  }
  return { uid: auth.uid, role: tokenRole || "admin", email: text(token.email || record.email).toLowerCase() };
}

function claimedRole(auth: any): string {
  const token = auth?.token || {};
  return role(token.role || token.userRole || token.primaryRole);
}

function isTechnicianIdentity(auth: any, user: Record<string, any>, technician: Record<string, any>) {
  const token = auth?.token || {};
  return token.technician === true || [
    claimedRole(auth),
    role(user.role || user.userRole || user.primaryRole),
    role(technician.role || technician.userRole || technician.primaryRole),
  ].includes("technician");
}

function isSuspended(user: Record<string, any>, technician: Record<string, any>) {
  return user.suspended === true || technician.suspended === true ||
    [role(user.status), role(technician.status)].includes("suspended");
}

function isFirestoreTimestamp(value: unknown): value is FirebaseFirestore.Timestamp {
  return value instanceof admin.firestore.Timestamp;
}

export function assertVerifiedNativeAndroidAppCheck(request: any): string {
  const appId = text(request?.app?.appId);
  if (
    CONFIGURED_ANDROID_APP_ID !== TECHNICIAN_ANDROID_FIREBASE_APP_ID ||
    !isVerifiedAndroidAppCheckAppId(appId, TECHNICIAN_ANDROID_FIREBASE_APP_ID)
  ) {
    throw new HttpsError(
      "permission-denied",
      "A verified production Android Play Integrity App Check identity is required.",
    );
  }
  return appId;
}

async function recordRejectedRotation(uid: string, reason: string, appId: string) {
  try {
    await db.collection("audit_logs").add({
      actorId: uid,
      actorRole: "technician",
      action: "TECHNICIAN_DEVICE_ROTATION_REJECTED",
      targetType: "technicians",
      targetId: uid,
      metadata: {
        reason,
        requestedPlatform: "android",
        appCheckAppId: appId,
      },
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error: any) {
    console.error("Technician device-rotation rejection audit write failed.", {
      code: text(error?.code) || "unknown",
    });
  }
}

export const registerTechnicianDevice = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Technician login required.");
    }

    const uid = request.auth.uid;
    const appId = assertVerifiedNativeAndroidAppCheck(request);
    const installationHash = normalizeInstallationHash(request.data?.installationHash);
    if (!installationHash) {
      throw new HttpsError(
        "invalid-argument",
        "A SHA-256 Technician installation identifier is required.",
      );
    }

    const liveUser = await admin.auth().getUser(uid);
    if (liveUser.disabled || liveUser.customClaims?.suspended === true) {
      throw new HttpsError("permission-denied", "This Technician account is disabled or suspended.");
    }

    const userRef = db.collection("users").doc(uid);
    const technicianRef = db.collection("technicians").doc(uid);
    const auditRef = db.collection("audit_logs").doc();

    try {
      return await db.runTransaction(async (transaction) => {
        const userSnap = await transaction.get(userRef);
        const technicianSnap = await transaction.get(technicianRef);
        const user = userSnap.data() || {};
        const technician = technicianSnap.data() || {};

        if (!userSnap.exists && !technicianSnap.exists) {
          throw new HttpsError("not-found", "Technician profile not found.");
        }
        if (!isTechnicianIdentity(request.auth, user, technician)) {
          throw new HttpsError("permission-denied", "Technician role required.");
        }
        if (isSuspended(user, technician)) {
          throw new HttpsError("permission-denied", "This Technician profile is suspended.");
        }

        const decision = classifyInstallationRegistration(
          user.registeredInstallationHash,
          technician.registeredInstallationHash,
          installationHash,
        );
        if (decision === "INCONSISTENT_REGISTRATION") {
          throw new HttpsError(
            "failed-precondition",
            "Technician installation records conflict. Controlled administrative repair is required.",
            { reason: decision },
          );
        }
        if (decision === "REJECTED_ROTATION") {
          throw new HttpsError(
            "failed-precondition",
            "A different Technician installation is already registered. Controlled device re-registration is required.",
            { reason: decision },
          );
        }

        const canonical = (profile: Record<string, any>) =>
          profile.deviceRegistered === true &&
          text(profile.registeredInstallationHash) === installationHash &&
          role(profile.registeredDevicePlatform) === "android" &&
          isFirestoreTimestamp(profile.deviceRegisteredAt);

        if (
          decision === "IDEMPOTENT_REGISTRATION" &&
          canonical(user) &&
          canonical(technician)
        ) {
          return { status: "SUCCESS", registration: "IDEMPOTENT" };
        }

        const registeredAt = decision === "IDEMPOTENT_REGISTRATION"
          ? [user.deviceRegisteredAt, technician.deviceRegisteredAt]
            .find(isFirestoreTimestamp) || FieldValue.serverTimestamp()
          : FieldValue.serverTimestamp();
        const registration = {
          deviceRegistered: true,
          deviceVerified: true,
          registeredInstallationHash: installationHash,
          registeredDevicePlatform: "android",
          deviceRegisteredAt: registeredAt,
          deviceReRegistrationRequired: false,
          deviceRegistrationResetReason: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        };

        transaction.set(userRef, registration, { merge: true });
        transaction.set(technicianRef, registration, { merge: true });

        if (decision === "INITIAL_REGISTRATION") {
          transaction.create(auditRef, {
            actorId: uid,
            actorRole: "technician",
            action: "TECHNICIAN_DEVICE_REGISTERED",
            targetType: "technicians",
            targetId: uid,
            metadata: {
              platform: "android",
              appCheckAppId: appId,
              registrationMode: "INITIAL",
            },
            createdAt: FieldValue.serverTimestamp(),
          });
        }

        return {
          status: "SUCCESS",
          registration: decision === "INITIAL_REGISTRATION" ? "INITIAL" : "IDEMPOTENT",
        };
      });
    } catch (error: any) {
      const reason = text(error?.details?.reason);
      if (["REJECTED_ROTATION", "INCONSISTENT_REGISTRATION"].includes(reason)) {
        await recordRejectedRotation(uid, reason, appId);
      }
      throw error;
    }
  },
);

export const adminResetTechnicianDeviceRegistration = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    const actor = await requireDeviceResetAdmin(request.auth);
    const technicianId = text(request.data?.technicianId);
    const reason = text(request.data?.reason);
    if (!technicianId) throw new HttpsError("invalid-argument", "technicianId is required.");
    if (reason.length < 8 || reason.length > 500) {
      throw new HttpsError("invalid-argument", "A device reset reason of 8 to 500 characters is required.");
    }
    if (technicianId === actor.uid) {
      throw new HttpsError("permission-denied", "Admin self-targeting is not permitted for Technician device reset.");
    }

    const authUser = await admin.auth().getUser(technicianId);
    const authRole = role(
      authUser.customClaims?.role ||
      authUser.customClaims?.userRole ||
      authUser.customClaims?.primaryRole,
    );
    if (authRole !== "technician") {
      throw new HttpsError("failed-precondition", "Target Firebase Auth identity is not a Technician.");
    }

    // Revoke existing sessions before the audit records a successful reset.
    // If the transactional reset fails afterwards, the Technician must simply sign in again.
    await admin.auth().revokeRefreshTokens(technicianId);

    const userRef = db.collection("users").doc(technicianId);
    const technicianRef = db.collection("technicians").doc(technicianId);
    const liveRef = db.collection("technician_live_locations").doc(technicianId);
    const auditRef = db.collection("audit_logs").doc();
    const now = FieldValue.serverTimestamp();

    await db.runTransaction(async (transaction) => {
      const [userSnap, technicianSnap, liveSnap] = await Promise.all([
        transaction.get(userRef),
        transaction.get(technicianRef),
        transaction.get(liveRef),
      ]);
      if (!userSnap.exists || !technicianSnap.exists) {
        throw new HttpsError("failed-precondition", "Both Technician identity registries are required before device reset.");
      }
      const user = userSnap.data() || {};
      const technician = technicianSnap.data() || {};
      const live = liveSnap.data() || {};
      const activeTicketId = text(live.activeTicketId || technician.activeTicketId || user.activeTicketId);
      const activeTicketRef = activeTicketId ? db.collection("maintenanceTickets").doc(activeTicketId) : null;
      const activeTicketSnap = activeTicketRef ? await transaction.get(activeTicketRef) : null;
      if (
        role(user.role || user.userRole || user.primaryRole) !== "technician" ||
        role(technician.role || technician.userRole || technician.primaryRole) !== "technician"
      ) {
        throw new HttpsError("failed-precondition", "Target profile is not consistently registered as a Technician.");
      }

      const resetPatch = {
        deviceRegistered: false,
        deviceVerified: false,
        registeredInstallationHash: FieldValue.delete(),
        registeredDeviceIdHash: FieldValue.delete(),
        registeredDeviceId: FieldValue.delete(),
        currentDeviceId: FieldValue.delete(),
        deviceId: FieldValue.delete(),
        registeredDevicePlatform: FieldValue.delete(),
        deviceRegisteredAt: FieldValue.delete(),
        deviceReRegistrationRequired: true,
        deviceRegistrationResetAt: now,
        deviceRegistrationResetBy: actor.uid,
        deviceRegistrationResetReason: reason,
        isTracking: false,
        updatedAt: now,
      };
      transaction.set(userRef, resetPatch, { merge: true });
      transaction.set(technicianRef, resetPatch, { merge: true });
      transaction.set(liveRef, {
        technicianUid: technicianId,
        activeTicketId: null,
        isTracking: false,
        stopReason: "ADMIN_DEVICE_REREGISTRATION",
        stoppedAt: now,
        serverUpdatedAt: now,
        expiresAt: now,
        updatedAt: now,
      }, { merge: true });
      if (activeTicketRef && activeTicketSnap?.exists) {
        transaction.set(activeTicketRef, {
          trackingStatus: "STOPPED_DEVICE_REREGISTRATION",
          technicianLocationExpiresAt: now,
          trackingReconciledAt: now,
          updatedAt: now,
        }, { merge: true });
      }
      transaction.set(auditRef, {
        action: "ADMIN_RESET_TECHNICIAN_DEVICE_REGISTRATION",
        actorId: actor.uid,
        actorEmail: actor.email || null,
        actorRole: actor.role,
        targetType: "technicians",
        targetId: technicianId,
        reason,
        metadata: {
          previousDeviceRegistered: user.deviceRegistered === true || technician.deviceRegistered === true,
          previousPlatform: text(technician.registeredDevicePlatform || user.registeredDevicePlatform) || null,
          rawDeviceIdentityExcluded: true,
          refreshTokensRevoked: true,
          activeTicketTrackingStopped: Boolean(activeTicketRef && activeTicketSnap?.exists),
        },
        createdAt: now,
      });
    });

    return {
      status: "RESET_REQUIRED",
      technicianId,
      reRegistrationRequired: true,
      refreshTokensRevoked: true,
    };
  },
);

export type ArrivalInstallationBinding = {
  physicalDeviceBound: boolean;
  arrivalInstallationHash?: string;
  arrivalDevicePlatform?: "android";
  arrivalEvidenceMode:
    | "PLAY_INTEGRITY_INSTALLATION_BOUND"
    | "BROWSER_FUNCTIONAL_ONLY"
    | "ADMIN_FUNCTIONAL_ONLY";
};

export async function resolveTechnicianArrivalBinding(params: {
  transaction: FirebaseFirestore.Transaction;
  request: any;
  assignedTechnicianId: string;
  isAdminActor: boolean;
}): Promise<ArrivalInstallationBinding> {
  const authUid = text(params.request?.auth?.uid);
  if (!authUid) throw new HttpsError("unauthenticated", "Technician login required.");

  const queuedTechnicianId = text(params.request?.data?.queuedTechnicianId);
  if (queuedTechnicianId && queuedTechnicianId !== authUid) {
    throw new HttpsError("permission-denied", "Queued arrival belongs to a different Technician account.");
  }

  if (params.isAdminActor) {
    return {
      physicalDeviceBound: false,
      arrivalEvidenceMode: "ADMIN_FUNCTIONAL_ONLY",
    };
  }
  if (!params.assignedTechnicianId || params.assignedTechnicianId !== authUid) {
    throw new HttpsError("permission-denied", "You are not assigned to this mission.");
  }

  // This read occurs for every ARRIVED request, including replayed queue items.
  // A locally queued hash never becomes authority over the current registration.
  const userRef = db.collection("users").doc(authUid);
  const technicianRef = db.collection("technicians").doc(authUid);
  const userSnap = await params.transaction.get(userRef);
  const technicianSnap = await params.transaction.get(technicianRef);
  const user = userSnap.data() || {};
  const technician = technicianSnap.data() || {};

  const requestedHash = normalizeInstallationHash(params.request?.data?.installationHash);
  const userFixture = protectedBrowserFixtureId(user.registeredDeviceId);
  const technicianFixture = protectedBrowserFixtureId(technician.registeredDeviceId);
  const hasSecureRegistration = Boolean(
    normalizeInstallationHash(user.registeredInstallationHash) ||
    normalizeInstallationHash(technician.registeredInstallationHash),
  );
  const appId = text(params.request?.app?.appId);
  const protectedBrowserFixture =
    !hasSecureRegistration &&
    !requestedHash &&
    user.deviceRegistered === true &&
    technician.deviceRegistered === true &&
    user.deviceVerified === true &&
    technician.deviceVerified === true &&
    Boolean(userFixture) &&
    userFixture === technicianFixture &&
    !isVerifiedAndroidAppCheckAppId(appId, CONFIGURED_ANDROID_APP_ID);

  if (protectedBrowserFixture) {
    return {
      physicalDeviceBound: false,
      arrivalEvidenceMode: "BROWSER_FUNCTIONAL_ONLY",
    };
  }
  if (!requestedHash) {
    throw new HttpsError(
      "failed-precondition",
      "A registered Android installation is required for physical arrival evidence.",
    );
  }

  assertVerifiedNativeAndroidAppCheck(params.request);
  const decision = classifyInstallationRegistration(
    user.registeredInstallationHash,
    technician.registeredInstallationHash,
    requestedHash,
  );
  if (decision !== "IDEMPOTENT_REGISTRATION") {
    throw new HttpsError(
      "failed-precondition",
      "Arrival installation does not match the current Technician registration.",
    );
  }
  if (
    user.deviceRegistered !== true ||
    technician.deviceRegistered !== true ||
    role(user.registeredDevicePlatform) !== "android" ||
    role(technician.registeredDevicePlatform) !== "android"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Technician Android installation registration is incomplete.",
    );
  }

  return {
    physicalDeviceBound: true,
    arrivalInstallationHash: requestedHash,
    arrivalDevicePlatform: "android",
    arrivalEvidenceMode: "PLAY_INTEGRITY_INSTALLATION_BOUND",
  };
}
