import * as admin from "firebase-admin";

// Automatic dispatch used to run exactly once, when the ticket document was created. A complaint
// filed while no qualified technician was on duty therefore stayed unassigned forever, even after
// a technician started (or resumed) duty. These helpers re-run the same server-side dispatch for
// tickets that are still waiting, oldest first. They never assign anyone themselves: the caller
// passes the canonical attemptAutoAssignment, which keeps every eligibility/transaction check.

// Pre-assignment states accepted by attemptAutoAssignment, in both stored spellings.
export const REDISPATCH_STATUS_VALUES: readonly string[] = Object.freeze([
    "OPEN", "open",
    "PENDING_ASSIGNMENT", "pending_assignment",
    "EMERGENCY_SUBMITTED", "emergency_submitted",
]);

// Page size and hard ceiling for the waiting-ticket scan (paged by document id, so every
// waiting ticket is reachable rather than only the first unordered window).
export const REDISPATCH_SCAN_PAGE = 200;
export const REDISPATCH_SCAN_MAX = 2000;
// A ticket that was just retried without success waits this long before it is retried again,
// so a backlog of undispatchable tickets cannot starve newer ones.
export const REDISPATCH_RETRY_COOLDOWN_MS = 30 * 60 * 1000;

export type DispatchAttempt = (
    ticketRef: admin.firestore.DocumentReference,
    ticketData: admin.firestore.DocumentData,
) => Promise<unknown>;

export function isAwaitingTechnician(ticket: admin.firestore.DocumentData | undefined): boolean {
    if (!ticket) return false;
    const assigned = String(ticket.assignedTechnicianId || ticket.technicianId || "").trim();
    if (assigned) return false;
    if (ticket.deleted === true || ticket.archived === true) return false;
    return REDISPATCH_STATUS_VALUES.includes(String(ticket.status || ""));
}

function millisOf(value: any): number {
    if (value && typeof value.toMillis === "function") return value.toMillis();
    if (value instanceof Date) return value.getTime();
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export function selectRedispatchCandidates(
    docs: Array<{ id: string; data: admin.firestore.DocumentData }>,
    limit: number,
    nowMs: number,
): Array<{ id: string; data: admin.firestore.DocumentData }> {
    return docs
        .filter((doc) => isAwaitingTechnician(doc.data))
        .filter((doc) => nowMs - millisOf(doc.data.redispatchAttemptedAt) >= REDISPATCH_RETRY_COOLDOWN_MS)
        // Never-retried (or least recently retried) first, then oldest complaint first.
        .sort((a, b) => millisOf(a.data.redispatchAttemptedAt) - millisOf(b.data.redispatchAttemptedAt) ||
            millisOf(a.data.createdAt) - millisOf(b.data.createdAt))
        .slice(0, limit);
}

export async function redispatchWaitingTickets(params: {
    db: admin.firestore.Firestore;
    attempt: DispatchAttempt;
    limit: number;
    nowMs?: number;
}): Promise<{ scanned: number; attempted: number; assigned: number }> {
    const { db, attempt } = params;
    const limit = Math.max(1, Math.min(50, Math.floor(params.limit)));
    const nowMs = params.nowMs ?? Date.now();
    const docs: Array<{ id: string; ref: admin.firestore.DocumentReference; data: admin.firestore.DocumentData }> = [];
    let cursor: admin.firestore.QueryDocumentSnapshot | null = null;
    while (docs.length < REDISPATCH_SCAN_MAX) {
        let query = db.collection("maintenanceTickets")
            .where("status", "in", [...REDISPATCH_STATUS_VALUES])
            .orderBy(admin.firestore.FieldPath.documentId())
            .limit(REDISPATCH_SCAN_PAGE);
        if (cursor) query = query.startAfter(cursor);
        const page = await query.get();
        page.docs.forEach((doc) => docs.push({ id: doc.id, ref: doc.ref, data: doc.data() }));
        if (page.size < REDISPATCH_SCAN_PAGE) break;
        cursor = page.docs[page.docs.length - 1];
    }
    const refs = new Map(docs.map((doc) => [doc.id, doc.ref]));
    const waiting = selectRedispatchCandidates(docs, limit, nowMs);

    let assigned = 0;
    let attempted = 0;
    for (const candidate of waiting) {
        const ref = refs.get(candidate.id)!;
        try {
            // Re-read right before the retry: a ticket cancelled or assigned since the scan is skipped,
            // and dispatch always sees the current document rather than the scan snapshot.
            const current = await ref.get();
            const currentData = current.data();
            if (!current.exists || !isAwaitingTechnician(currentData)) continue;
            await ref.update({ redispatchAttemptedAt: admin.firestore.Timestamp.fromMillis(nowMs) });
            attempted += 1;
            await attempt(ref, { ...currentData, redispatchAttemptedAt: admin.firestore.Timestamp.fromMillis(nowMs) });
            const fresh = await ref.get();
            if (!isAwaitingTechnician(fresh.data())) assigned += 1;
        } catch (error) {
            console.error(`[redispatch] attempt failed for ${candidate.id}:`, error);
        }
    }
    return { scanned: docs.length, attempted, assigned };
}
