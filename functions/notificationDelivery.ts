import { FieldValue } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();
const MAX_PUSH_TOKENS_PER_USER = 10;
const PUSH_TOKEN_MIN_LENGTH = 50;
const PUSH_TOKEN_MAX_LENGTH = 4096;
const PUSH_TOKEN_RE = /^[A-Za-z0-9_:\-.]+$/;
const PUSH_PLATFORMS = new Set(["web", "android-web", "ios-pwa"]);
const PUSH_ENABLED_ROLES = new Set([
    "tenant",
    "technician",
    "owner",
    "broker",
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
const INACTIVE_STATUSES = new Set(["suspended", "disabled", "rejected", "inactive"]);

type NotificationPayload = {
    recipientId?: unknown;
    recipientRole?: unknown;
    type?: unknown;
    title?: unknown;
    body?: unknown;
    ticketId?: unknown;
    link?: unknown;
    metadata?: unknown;
};

type PushRegistration = {
    token: string;
    tokenHash: string;
    userId: string;
    ref: FirebaseFirestore.DocumentReference;
};

function unique(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)));
}

function cleanString(value: unknown, maxLength = 240) {
    return String(value || "").trim().slice(0, maxLength);
}

function cleanRole(value: unknown) {
    return cleanString(value, 40).toLowerCase();
}

function tokenHash(token: string) {
    return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function timestampMillis(value: unknown) {
    if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
        return (value as { toMillis: () => number }).toMillis();
    }
    const parsed = Date.parse(String(value || ""));
    return Number.isFinite(parsed) ? parsed : 0;
}

function assertSafePushToken(value: unknown) {
    const token = String(value || "").trim();
    if (token.length < PUSH_TOKEN_MIN_LENGTH || token.length > PUSH_TOKEN_MAX_LENGTH || !PUSH_TOKEN_RE.test(token)) {
        throw new HttpsError("invalid-argument", "A valid Firebase Cloud Messaging registration token is required.");
    }
    return token;
}

function assertPushPlatform(value: unknown) {
    const platform = cleanString(value, 40).toLowerCase();
    if (!PUSH_PLATFORMS.has(platform)) {
        throw new HttpsError("invalid-argument", "Unsupported push-notification platform.");
    }
    return platform;
}

function resolvedRole(authRecord: admin.auth.UserRecord, profile: FirebaseFirestore.DocumentData) {
    const claims = authRecord.customClaims || {};
    return cleanRole(claims.role || claims.userRole || claims.primaryRole || profile.role || profile.userRole || profile.primaryRole);
}

function profileIsActive(profile: FirebaseFirestore.DocumentData) {
    return profile.suspended !== true && !INACTIVE_STATUSES.has(cleanRole(profile.status));
}

async function requirePushAccount(uid: string) {
    const [authRecord, profileSnap] = await Promise.all([
        admin.auth().getUser(uid),
        db.collection("users").doc(uid).get(),
    ]);
    if (authRecord.disabled || authRecord.customClaims?.suspended === true) {
        throw new HttpsError("permission-denied", "The authenticated account is disabled or suspended.");
    }
    if (!authRecord.emailVerified) {
        throw new HttpsError("failed-precondition", "A verified email is required before registering push notifications.");
    }
    if (!profileSnap.exists) {
        throw new HttpsError("failed-precondition", "An active user profile is required before registering push notifications.");
    }
    const profile = profileSnap.data() || {};
    if (!profileIsActive(profile)) {
        throw new HttpsError("permission-denied", "The user profile is not active.");
    }
    const role = resolvedRole(authRecord, profile);
    if (!PUSH_ENABLED_ROLES.has(role)) {
        throw new HttpsError("permission-denied", "The authenticated role is not eligible for push notifications.");
    }
    return { authRecord, profile, role };
}

async function refreshUserPushSummary(userId: string, latestPlatform?: string, latestRole?: string) {
    const tokenSnapshot = await db.collection("users").doc(userId).collection("fcmTokens").get();
    const count = tokenSnapshot.size;
    await db.collection("users").doc(userId).set({
        fcmTokens: FieldValue.delete(),
        pushEnabled: count > 0,
        pushTokenCount: count,
        ...(latestPlatform ? { pushPlatform: latestPlatform } : {}),
        ...(latestRole ? { pushRole: latestRole } : {}),
        pushUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return count;
}

async function pruneUserPushTokens(userId: string) {
    const snapshot = await db.collection("users").doc(userId).collection("fcmTokens").get();
    const ordered = [...snapshot.docs].sort((left, right) => {
        const rightMs = timestampMillis(right.data().lastRegisteredAt || right.data().createdAt);
        const leftMs = timestampMillis(left.data().lastRegisteredAt || left.data().createdAt);
        return rightMs - leftMs;
    });
    const stale = ordered.slice(MAX_PUSH_TOKENS_PER_USER);
    if (stale.length) {
        const batch = db.batch();
        stale.forEach((docSnap) => batch.delete(docSnap.ref));
        await batch.commit();
    }
    return { retainedCount: Math.min(ordered.length, MAX_PUSH_TOKENS_PER_USER), prunedCount: stale.length };
}

function assertSafeNotificationPayload(data: NotificationPayload) {
    const recipientId = cleanString(data.recipientId, 128);
    const recipientRole = cleanRole(data.recipientRole);
    const type = cleanString(data.type || "STATUS_UPDATE", 80);
    const title = cleanString(data.title || "BIN GROUP", 120);
    const body = cleanString(data.body || "New update received.", 240);
    const ticketId = cleanString(data.ticketId, 128);
    const link = cleanString(data.link || "/notifications", 240) || "/notifications";
    const metadata = data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
        ? data.metadata as Record<string, unknown>
        : {};

    if (!recipientId) throw new HttpsError("invalid-argument", "recipientId is required.");
    if (!recipientRole) throw new HttpsError("invalid-argument", "recipientRole is required.");
    if (!title) throw new HttpsError("invalid-argument", "title is required.");
    if (!body) throw new HttpsError("invalid-argument", "body is required.");
    if (!/^[A-Za-z0-9_:\-.]+$/.test(type)) throw new HttpsError("invalid-argument", "Unsupported notification type.");
    if (!link.startsWith("/")) throw new HttpsError("invalid-argument", "Notification links must be internal app paths.");

    return { recipientId, recipientRole, type, title, body, ticketId, link, metadata };
}

async function registrationsForUser(userId: string): Promise<PushRegistration[]> {
    const tokenDocs = await db.collection("users").doc(userId).collection("fcmTokens").get();
    const registrations: PushRegistration[] = [];
    for (const tokenDoc of tokenDocs.docs) {
        const token = String(tokenDoc.data()?.token || "").trim();
        if (!token || tokenHash(token) !== tokenDoc.id) continue;
        registrations.push({ token, tokenHash: tokenDoc.id, userId, ref: tokenDoc.ref });
    }
    return registrations;
}

async function adminRecipients() {
    const roles = ["admin", "super_admin", "ceo", "manager", "operations_admin", "dispatcher"];
    const snapshots = await Promise.all(
        roles.map((role) => db.collection("users").where("role", "==", role).limit(100).get())
    );
    return unique(snapshots.flatMap((snap) => snap.docs.map((docSnap) => docSnap.id)));
}

async function onDutyTechnicianRecipients() {
    const snapshot = await db.collection("users")
        .where("role", "==", "technician")
        .where("onDuty", "==", true)
        .limit(200)
        .get();
    return unique(snapshot.docs.map((docSnap) => docSnap.id));
}

async function recipientIdsForNotification(data: FirebaseFirestore.DocumentData) {
    const recipientId = String(data.recipientId || "").trim();
    if (!recipientId) return [];
    if (recipientId === "ADMIN_GROUP") return adminRecipients();
    if (recipientId === "ON_DUTY_TECHNICIANS") return onDutyTechnicianRecipients();
    return [recipientId];
}

function roleFromToken(token: Record<string, unknown>) {
    return cleanRole(token.role || token.userRole || token.primaryRole);
}

async function isAdminCaller(uid: string, token: Record<string, unknown>) {
    void uid;
    const tokenRole = roleFromToken(token);
    if (token.admin === true || token.isAdmin === true || token.ceo === true) return true;
    if (["admin", "super_admin", "superadmin", "ceo", "manager", "operations_admin", "dispatcher"].includes(tokenRole)) return true;
    return false;
}

function participantIds(ticket: FirebaseFirestore.DocumentData) {
    return unique([
        ticket.ownerId,
        ticket.ownerUid,
        ticket.tenantId,
        ticket.tenantUid,
        ticket.userId,
        ticket.createdBy,
        ticket.createdByUid,
        ticket.assignedTechnicianId,
        ticket.technicianId,
        ticket.technicianUid,
        ticket.assignedTechId,
        ticket.techId,
    ].map((value) => cleanString(value, 128)));
}

async function loadTicket(ticketId: string) {
    if (!ticketId) return null;
    const maintenanceSnap = await db.collection("maintenanceTickets").doc(ticketId).get();
    if (maintenanceSnap.exists) return maintenanceSnap.data() || null;
    const ticketSnap = await db.collection("tickets").doc(ticketId).get();
    return ticketSnap.exists ? ticketSnap.data() || null : null;
}

async function canCreateNotification(uid: string, token: Record<string, unknown>, payload: ReturnType<typeof assertSafeNotificationPayload>) {
    if (await isAdminCaller(uid, token)) return true;
    if (payload.recipientId === uid) return true;
    if (payload.recipientId === "ADMIN_GROUP" || payload.recipientId === "ON_DUTY_TECHNICIANS") {
        const allowedTypes = payload.recipientId === "ADMIN_GROUP"
            ? new Set(["TICKET_CREATED", "OWNER_COMPLAINT", "EMERGENCY_SOS", "TENANT_APPROVED", "TENANT_REJECTED"])
            : new Set(["EMERGENCY_SOS"]);
        if (!allowedTypes.has(payload.type) || !payload.ticketId) return false;
        const ticket = await loadTicket(payload.ticketId);
        if (!ticket || !participantIds(ticket).includes(uid)) return false;
        if (payload.type === "EMERGENCY_SOS") {
            const priority = cleanString(ticket.priority || ticket.severity || ticket.urgency, 40).toUpperCase();
            const status = cleanString(ticket.status, 80).toUpperCase();
            if (!["EMERGENCY", "CRITICAL", "SOS"].includes(priority) && !status.includes("EMERGENCY")) {
                return false;
            }
        }
        return payload.recipientId === "ADMIN_GROUP"
            ? payload.recipientRole === "admin"
            : payload.recipientRole === "technician";
    }

    const ticket = await loadTicket(payload.ticketId);
    if (ticket) {
        const participants = participantIds(ticket);
        if (!participants.includes(uid)) return false;
        return participants.includes(payload.recipientId);
    }

    return false;
}

export const registerPushToken = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
    const uid = request.auth.uid;
    const token = assertSafePushToken(request.data?.token);
    const platform = assertPushPlatform(request.data?.platform);
    if (cleanString(request.data?.permission, 20).toLowerCase() !== "granted") {
        throw new HttpsError("failed-precondition", "Notification permission must be granted before registration.");
    }
    const { role } = await requirePushAccount(uid);
    const hash = tokenHash(token);
    const tokenRef = db.collection("users").doc(uid).collection("fcmTokens").doc(hash);
    const auditRef = db.collection("audit_logs").doc();
    const now = FieldValue.serverTimestamp();
    const userAgent = cleanString(request.rawRequest?.headers?.["user-agent"], 800);
    const userAgentHash = userAgent ? crypto.createHash("sha256").update(userAgent, "utf8").digest("hex") : null;

    await db.runTransaction(async (transaction) => {
        const existing = await transaction.get(tokenRef);
        transaction.set(tokenRef, {
            token,
            tokenHash: hash,
            userId: uid,
            role,
            platform,
            permission: "granted",
            isStandalone: request.data?.isStandalone === true,
            userAgentHash,
            source: "callable:registerPushToken",
            active: true,
            createdAt: existing.exists ? existing.data()?.createdAt || now : now,
            lastRegisteredAt: now,
            updatedAt: now,
        }, { merge: true });
        transaction.set(auditRef, {
            action: "PUSH_TOKEN_REGISTERED",
            actorId: uid,
            actorRole: role,
            targetType: "user",
            targetId: uid,
            platform,
            registrationHashPrefix: hash.slice(0, 12),
            sensitiveValuesExcluded: true,
            createdAt: now,
        });
    });

    const pruning = await pruneUserPushTokens(uid);
    const count = await refreshUserPushSummary(uid, platform, role);
    return {
        enabled: true,
        registrationId: hash.slice(0, 16),
        registeredTokenCount: count,
        prunedTokenCount: pruning.prunedCount,
        platform,
    };
  },
);

export const unregisterPushToken = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
    const uid = request.auth.uid;
    const token = assertSafePushToken(request.data?.token);
    const { role } = await requirePushAccount(uid);
    const hash = tokenHash(token);
    const tokenRef = db.collection("users").doc(uid).collection("fcmTokens").doc(hash);
    const auditRef = db.collection("audit_logs").doc();
    const now = FieldValue.serverTimestamp();
    await db.runTransaction(async (transaction) => {
        transaction.delete(tokenRef);
        transaction.set(auditRef, {
            action: "PUSH_TOKEN_UNREGISTERED",
            actorId: uid,
            actorRole: role,
            targetType: "user",
            targetId: uid,
            registrationHashPrefix: hash.slice(0, 12),
            sensitiveValuesExcluded: true,
            createdAt: now,
        });
    });
    const count = await refreshUserPushSummary(uid);
    return { removed: true, registeredTokenCount: count };
  },
);

export const createNotification = onCall(
  { cors: true, region: "europe-west3", enforceAppCheck: true },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");

    const payload = assertSafeNotificationPayload(request.data || {});
    const token = (request.auth.token || {}) as Record<string, unknown>;
    const uid = request.auth.uid;
    const allowed = await canCreateNotification(uid, token, payload);
    if (!allowed) throw new HttpsError("permission-denied", "You cannot create this notification.");

    const recipientIds = await recipientIdsForNotification({ recipientId: payload.recipientId });
    if (!recipientIds.length) return { notificationIds: [], recipientCount: 0 };

    const notificationIds: string[] = [];
    const now = FieldValue.serverTimestamp();
    const groupDispatch = payload.recipientId === "ADMIN_GROUP" || payload.recipientId === "ON_DUTY_TECHNICIANS";
    const dispatchKey = groupDispatch
        ? crypto.createHash("sha256")
            .update(`${payload.ticketId}|${payload.type}|${payload.recipientId}`)
            .digest("hex")
        : "";
    const claimRef = dispatchKey
        ? db.collection("notification_dispatch_claims").doc(dispatchKey)
        : null;

    const notificationWrites = recipientIds.slice(0, 300).map((recipientId) => {
        const ref = groupDispatch
            ? db.collection("notifications").doc(`${dispatchKey.slice(0, 24)}_${recipientId}`)
            : db.collection("notifications").doc();
        notificationIds.push(ref.id);
        return { ref, recipientId, data: {
            recipientId,
            recipientRole: payload.recipientRole,
            type: payload.type,
            title: payload.title,
            body: payload.body,
            ticketId: payload.ticketId || null,
            link: payload.link,
            metadata: payload.metadata,
            read: false,
            createdAt: now,
            createdByUid: uid,
            createdByEmail: cleanString(token.email, 160) || null,
            deliverySource: "callable:createNotification",
        } };
    });

    if (claimRef) {
        const created = await db.runTransaction(async (transaction) => {
            const claimSnap = await transaction.get(claimRef);
            if (claimSnap.exists) return false;
            transaction.create(claimRef, {
                ticketId: payload.ticketId,
                type: payload.type,
                recipientGroup: payload.recipientId,
                createdByUid: uid,
                createdAt: now,
            });
            notificationWrites.forEach(({ ref, data }) => transaction.create(ref, data));
            return true;
        });
        return {
            notificationIds: created ? notificationIds : [],
            recipientCount: created ? notificationIds.length : 0,
            idempotent: !created,
        };
    }

    const batch = db.batch();
    notificationWrites.forEach(({ ref, data }) => batch.set(ref, data));
    await batch.commit();
    return { notificationIds, recipientCount: notificationIds.length, idempotent: false };
  },
);

export const deliverNotificationPush = onDocumentCreated("notifications/{notificationId}", async (event) => {
    const snap = event.data;
    if (!snap) return null;

    const data = snap.data() || {};
    const title = String(data.title || "BIN GROUP").slice(0, 120);
    const body = String(data.body || "New update received.").slice(0, 240);
    const link = String(data.link || "/");

    const recipientIds = await recipientIdsForNotification(data);
    if (!recipientIds.length) return null;

    const collected = (await Promise.all(recipientIds.map(registrationsForUser))).flat();
    const uniqueByToken = new Map<string, PushRegistration>();
    collected.forEach((registration) => {
        if (!uniqueByToken.has(registration.token)) uniqueByToken.set(registration.token, registration);
    });
    const registrations = [...uniqueByToken.values()];

    if (!registrations.length) {
        await snap.ref.set({
            pushAttemptedAt: FieldValue.serverTimestamp(),
            pushTokenCount: 0,
            pushSuccessCount: 0,
            pushFailureCount: 0,
            pushPrunedCount: 0,
            pushDeliveryState: "NO_REGISTERED_TOKEN",
            invalidPushTokens: FieldValue.delete(),
        }, { merge: true });
        return null;
    }

    const response = await admin.messaging().sendEachForMulticast({
        tokens: registrations.map((registration) => registration.token),
        notification: { title, body },
        data: {
            title,
            body,
            link,
            notificationId: event.params.notificationId,
            recipientRole: String(data.recipientRole || "unknown"),
            type: String(data.type || "STATUS_UPDATE"),
            ticketId: String(data.ticketId || ""),
        },
        webpush: {
            notification: {
                icon: "/icons/icon-192x192.png",
                badge: "/icons/icon-192x192.png",
            },
            fcmOptions: { link },
        },
    });

    const invalidRegistrations = response.responses
        .map((item, index) => ({ item, registration: registrations[index] }))
        .filter(({ item, registration }) => {
            if (!registration) return false;
            const code = item.error?.code || "";
            return code.includes("registration-token-not-registered") || code.includes("invalid-registration-token");
        })
        .map(({ registration }) => registration)
        .filter((registration): registration is PushRegistration => Boolean(registration));

    if (invalidRegistrations.length) {
        const batch = db.batch();
        invalidRegistrations.forEach((registration) => batch.delete(registration.ref));
        await batch.commit();
        const affectedUsers = unique(invalidRegistrations.map((registration) => registration.userId));
        await Promise.all(affectedUsers.map((userId) => refreshUserPushSummary(userId)));
    }

    const deliveryState = response.failureCount === 0
        ? "SUCCESS"
        : response.successCount > 0
            ? "PARTIAL"
            : "FAILED";
    await snap.ref.set({
        invalidPushTokens: FieldValue.delete(),
        pushAttemptedAt: FieldValue.serverTimestamp(),
        pushTokenCount: registrations.length,
        pushSuccessCount: response.successCount,
        pushFailureCount: response.failureCount,
        pushPrunedCount: invalidRegistrations.length,
        pushDeliveryState: deliveryState,
    }, { merge: true });

    return null;
});
