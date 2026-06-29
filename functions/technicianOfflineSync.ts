import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";

const db = admin.firestore();

export const syncOfflineActions = onCall({ cors: true }, async (request) => {
    if (!request.auth?.uid) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
    }
    const technicianId = request.auth.uid;
    const { actions } = request.data;
    
    if (!Array.isArray(actions) || actions.length === 0) {
        return { success: true, processedCount: 0 };
    }

    const batch = db.batch();
    const results: any[] = [];
    let processedCount = 0;

    for (const action of actions) {
        const { id, type, payload, timestamp, idempotencyKey } = action;
        if (!id || !type || !idempotencyKey) continue;

        // Conflict / Idempotency check
        const syncRef = db.collection("offline_sync_logs").doc(idempotencyKey);
        const syncDoc = await syncRef.get();
        
        if (syncDoc.exists) {
            results.push({ id, status: "skipped_duplicate" });
            continue;
        }

        try {
            if (type === "COMPLETE_TICKET") {
                const ticketRef = db.collection("maintenanceTickets").doc(payload.ticketId);
                const ticketDoc = await ticketRef.get();
                if (!ticketDoc.exists) {
                    results.push({ id, status: "failed_not_found" });
                    continue;
                }
                const currentStatus = ticketDoc.data()?.status;
                if (currentStatus === "completed" || currentStatus === "closed") {
                    results.push({ id, status: "skipped_stale_status" });
                } else {
                    batch.update(ticketRef, {
                        status: "completed",
                        completedAt: admin.firestore.FieldValue.serverTimestamp(),
                        offlineSyncTimestamp: timestamp,
                        ...payload.completionData
                    });
                    processedCount++;
                    results.push({ id, status: "processed" });
                }
            } else if (type === "UPDATE_STATUS") {
                const ticketRef = db.collection("maintenanceTickets").doc(payload.ticketId);
                batch.update(ticketRef, {
                    status: payload.status,
                    offlineSyncTimestamp: timestamp,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                processedCount++;
                results.push({ id, status: "processed" });
            } else {
                results.push({ id, status: "ignored_unknown_type" });
            }

            // Record idempotency
            batch.set(syncRef, {
                actionId: id,
                technicianId,
                type,
                processedAt: admin.firestore.FieldValue.serverTimestamp()
            });

        } catch (err: any) {
            results.push({ id, status: "error", error: err.message });
        }
    }

    await batch.commit();

    return {
        success: true,
        processedCount,
        results
    };
});
