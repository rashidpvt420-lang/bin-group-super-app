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
          registeredInstallationHash: installationHash,
          registeredDevicePlatform: "android",
          deviceRegisteredAt: registeredAt,
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
