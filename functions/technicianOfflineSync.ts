import { onCall, HttpsError } from "firebase-functions/v2/https";

/**
 * Retained only as a fail-closed compatibility endpoint for older clients.
 * Current clients replay each queued action through acceptTechnicianTicket or
 * updateTicketLifecycle, so completion proof and state-machine checks cannot be
 * bypassed by a bulk Admin SDK write.
 */
export const syncOfflineActions = onCall({ cors: true, enforceAppCheck: true }, async (request) => {
    if (!request.auth?.uid) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
    }
    throw new HttpsError(
        "failed-precondition",
        "Legacy bulk offline sync is disabled. Replay queued actions through the protected ticket lifecycle controls.",
    );
});
