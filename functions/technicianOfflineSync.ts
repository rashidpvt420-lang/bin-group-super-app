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
            if (type === "COMPLETE_TICKET" || type === "UPDATE_STATUS") {
                const ticketRef = db.collection("maintenanceTickets").doc(payload.ticketId);
                const ticketDoc = await ticketRef.get();
                if (!ticketDoc.exists) {
                    results.push({ id, status: "failed_not_found" });
                    continue;
                }
                const data = ticketDoc.data() as any;
                
                // Security: enforce technician ownership
                if (data.assignedTechnicianId !== technicianId && data.technicianId !== technicianId && data.assignedTechId !== technicianId && data.technicianUid !== technicianId) {
                    results.push({ id, status: "failed_permission_denied" });
                    continue;
                }

                const currentStatus = String(data.status || "").toUpperCase();
                // Block if already finalized
                if (["COMPLETED", "CLOSED", "DISPUTED", "CANCELLED", "PENDING_TENANT_REVIEW", "PENDING TENANT REVIEW"].includes(currentStatus)) {
                    results.push({ id, status: "skipped_stale_status" });
                    continue;
                }

                if (type === "COMPLETE_TICKET") {
                    // Extract only safe fields
                    const { afterPhotoUrl, partsDisposition, partsUsed, resolutionCode, resolutionNotes, completionNotes, tenantSignatureUrl } = payload.completionData || {};
                    const safePayload: any = { status: "COMPLETED", completedAt: admin.firestore.FieldValue.serverTimestamp(), offlineSyncTimestamp: timestamp, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
                    if (afterPhotoUrl) safePayload.afterPhotoUrl = afterPhotoUrl;
                    if (partsDisposition) safePayload.partsDisposition = partsDisposition;
                    if (partsUsed) safePayload.partsUsed = partsUsed;
                    if (resolutionCode) safePayload.resolutionCode = resolutionCode;
                    if (resolutionNotes) safePayload.resolutionNotes = resolutionNotes;
                    if (completionNotes) safePayload.completionNotes = completionNotes;
                    if (tenantSignatureUrl) safePayload.tenantSignatureUrl = tenantSignatureUrl;

                    batch.update(ticketRef, safePayload);
                    processedCount++;
                    results.push({ id, status: "processed" });
                } else if (type === "UPDATE_STATUS") {
                    const newStatus = String(payload.status || "").toUpperCase();
                    batch.update(ticketRef, {
                        status: newStatus,
                        offlineSyncTimestamp: timestamp,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    processedCount++;
                    results.push({ id, status: "processed" });
                }
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
