const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();

exports.pushOnNotificationCreated = onDocumentCreated("notifications/{notificationId}", async (event) => {
    const snap = event.data;
    if (!snap) return;

    const notification = snap.data();
    const recipientId = notification.recipientId || notification.userId || notification.toUserId;

    if (!recipientId) {
        return snap.ref.update({
            pushStatus: 'SKIPPED_NO_RECIPIENT',
            pushAttemptedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    const db = admin.firestore();
    const userRef = db.collection("users").doc(recipientId);
    
    // Read tokens
    const userDoc = await userRef.get();
    let tokens = new Set();
    
    if (userDoc.exists) {
        const userData = userDoc.data();
        if (Array.isArray(userData.fcmTokens)) {
            userData.fcmTokens.forEach(t => tokens.add(t));
        }
    }

    const tokensSnap = await userRef.collection("fcmTokens").get();
    tokensSnap.forEach(doc => {
        const t = doc.data().token;
        if (t) tokens.add(t);
    });

    const tokenArray = Array.from(tokens);

    if (tokenArray.length === 0) {
        return snap.ref.update({
            pushStatus: 'SKIPPED_NO_TOKENS',
            pushAttemptedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    const payload = {
        tokens: tokenArray,
        notification: {
            title: notification.title || "BIN Group",
            body: notification.body || "You have a new notification."
        },
        data: {
            link: notification.link || "",
            type: notification.type || ""
        }
    };

    const response = await admin.messaging().sendEachForMulticast(payload);
    
    const invalidTokens = [];
    if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
            if (!resp.success) {
                const error = resp.error;
                if (error && (error.code === 'messaging/invalid-registration-token' || error.code === 'messaging/registration-token-not-registered')) {
                    invalidTokens.push(tokenArray[idx]);
                }
            }
        });
    }

    // Clean up invalid tokens
    if (invalidTokens.length > 0) {
        // Remove from user array
        await userRef.update({
            fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens)
        });

        // Remove from subcollection
        for (const it of invalidTokens) {
            const tkQuery = await userRef.collection("fcmTokens").where("token", "==", it).get();
            const batch = db.batch();
            tkQuery.forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
    }

    let pushStatus = 'SENT';
    if (response.failureCount > 0 && response.successCount > 0) {
        pushStatus = 'PARTIAL';
    } else if (response.successCount === 0) {
        pushStatus = 'FAILED';
    }

    return snap.ref.update({
        pushStatus,
        pushSuccessCount: response.successCount,
        pushFailureCount: response.failureCount,
        pushAttemptedAt: admin.firestore.FieldValue.serverTimestamp()
    });
});
