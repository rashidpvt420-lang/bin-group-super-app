import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";

if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

function unique(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)));
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

async function recipientIdsForNotification(data: FirebaseFirestore.DocumentData) {
    const recipientId = String(data.recipientId || "").trim();
    if (!recipientId) return [];
    if (recipientId === "ADMIN_GROUP") return adminRecipients();
    return [recipientId];
}

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
        await snap.ref.set({ invalidPushTokens: invalidTokens, pushPrunedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }

    await snap.ref.set({
        pushAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
        pushSuccessCount: response.successCount,
        pushFailureCount: response.failureCount,
    }, { merge: true });

    return null;
});
