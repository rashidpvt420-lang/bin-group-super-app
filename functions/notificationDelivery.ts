import { FieldValue } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

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

function unique(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)));
}

function cleanString(value: unknown, maxLength = 240) {
    return String(value || "").trim().slice(0, maxLength);
}

function cleanRole(value: unknown) {
    return cleanString(value, 40).toLowerCase();
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

async function tokensForUser(userId: string) {
    const tokenSet: string[] = [];
    const userSnap = await db.collection("users").doc(userId).get();
    const userData = userSnap.data() || {};

    if (Array.isArray(userData.fcmTokens)) {
        tokenSet.push(...userData.fcmTokens.map((value: unknown) => String(value || "").trim()));
    }

    const tokenDocs = await db.collection("users").doc(userId).collection("fcmTokens").get();
    tokenDocs.docs.forEach((tokenDoc) => {
        const data = tokenDoc.data() || {};
        tokenSet.push(String(data.token || tokenDoc.id || "").trim());
    });

    return unique(tokenSet);
}

async function adminRecipients() {
    const roles = ["admin", "super_admin", "ceo", "manager", "operations_admin", "dispatcher"];
    const snapshots = await Promise.all(
        roles.map((role) => db.collection("users").where("role", "==", role).get())
    );
    return unique(snapshots.flatMap((snap) => snap.docs.map((docSnap) => docSnap.id)));
}

async function onDutyTechnicianRecipients() {
    const snapshot = await db.collection("users")
        .where("role", "==", "technician")
        .where("onDuty", "==", true)
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
    const tokenRole = roleFromToken(token);
    if (token.admin === true || token.isAdmin === true || token.ceo === true) return true;
    if (["admin", "super_admin", "superadmin", "ceo", "manager", "operations_admin", "dispatcher"].includes(tokenRole)) return true;

    const userSnap = await db.collection("users").doc(uid).get();
    const data = userSnap.data() || {};
    const role = cleanRole(data.role || data.userRole || data.primaryRole);
    return data.admin === true || data.isAdmin === true || data.ceo === true ||
        ["admin", "super_admin", "superadmin", "ceo", "manager", "operations_admin", "dispatcher"].includes(role);
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

    const ticket = await loadTicket(payload.ticketId);
    if (ticket) {
        const participants = participantIds(ticket);
        if (!participants.includes(uid)) return false;
        if (payload.recipientId === "ADMIN_GROUP" || payload.recipientId === "ON_DUTY_TECHNICIANS") return true;
        return participants.includes(payload.recipientId);
    }

    return payload.recipientId === "ADMIN_GROUP" && [
        "NEW_ONBOARDING",
        "TICKET_CREATED",
        "EMERGENCY_SOS",
        "DESIGN_NOC",
        "TENANT_APPROVED",
        "TENANT_REJECTED",
    ].includes(payload.type);
}

export const createNotification = onCall({ cors: true, region: "europe-west3" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");

    const payload = assertSafeNotificationPayload(request.data || {});
    const token = (request.auth.token || {}) as Record<string, unknown>;
    const uid = request.auth.uid;
    const allowed = await canCreateNotification(uid, token, payload);
    if (!allowed) throw new HttpsError("permission-denied", "You cannot create this notification.");

    const recipientIds = await recipientIdsForNotification({ recipientId: payload.recipientId });
    if (!recipientIds.length) return { notificationIds: [], recipientCount: 0 };

    const batch = db.batch();
    const notificationIds: string[] = [];
    const now = FieldValue.serverTimestamp();

    recipientIds.forEach((recipientId) => {
        const ref = db.collection("notifications").doc();
        notificationIds.push(ref.id);
        batch.set(ref, {
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
        });
    });

    await batch.commit();
    return { notificationIds, recipientCount: notificationIds.length };
});

export const deliverNotificationPush = onDocumentCreated("notifications/{notificationId}", async (event) => {
    const snap = event.data;
    if (!snap) return null;

    const data = snap.data() || {};
    const title = String(data.title || "BIN GROUP").slice(0, 120);
    const body = String(data.body || "New update received.").slice(0, 240);
    const link = String(data.link || "/");

    const recipientIds = await recipientIdsForNotification(data);
    if (!recipientIds.length) return null;

    const tokens = unique((await Promise.all(recipientIds.map(tokensForUser))).flat());
    if (!tokens.length) return null;

    const response = await admin.messaging().sendEachForMulticast({
        tokens,
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

    const invalidTokens = response.responses
        .map((item, index) => ({ item, token: tokens[index] }))
        .filter(({ item }) => {
            const code = item.error?.code || "";
            return code.includes("registration-token-not-registered") || code.includes("invalid-registration-token");
        })
        .map(({ token }) => token);

    if (invalidTokens.length) {
        await snap.ref.set({ invalidPushTokens: invalidTokens, pushPrunedAt: FieldValue.serverTimestamp() }, { merge: true });
    }

    await snap.ref.set({
        pushAttemptedAt: FieldValue.serverTimestamp(),
        pushSuccessCount: response.successCount,
        pushFailureCount: response.failureCount,
    }, { merge: true });

    return null;
});
