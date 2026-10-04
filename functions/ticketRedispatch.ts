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

export const REDISPATCH_SCAN_LIMIT = 200;

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

function createdAtMillis(ticket: admin.firestore.DocumentData): number {
    const value = ticket.createdAt;
    if (value && typeof value.toMillis === "function") return value.toMillis();
    if (value instanceof Date) return value.getTime();
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

export async function redispatchWaitingTickets(params: {
    db: admin.firestore.Firestore;
    attempt: DispatchAttempt;
    limit: number;
}): Promise<{ scanned: number; attempted: number; assigned: number }> {
    const { db, attempt } = params;
    const limit = Math.max(1, Math.min(50, Math.floor(params.limit)));
    const snap = await db.collection("maintenanceTickets")
        .where("status", "in", [...REDISPATCH_STATUS_VALUES])
        .limit(REDISPATCH_SCAN_LIMIT)
        .get();
    const waiting = snap.docs
        .filter((doc) => isAwaitingTechnician(doc.data()))
        .sort((a, b) => createdAtMillis(a.data()) - createdAtMillis(b.data()))
        .slice(0, limit);

    let assigned = 0;
    for (const doc of waiting) {
        try {
            await attempt(doc.ref, doc.data());
            const fresh = await doc.ref.get();
            if (!isAwaitingTechnician(fresh.data())) assigned += 1;
        } catch (error) {
            console.error(`[redispatch] attempt failed for ${doc.id}:`, error);
        }
    }
    return { scanned: snap.size, attempted: waiting.length, assigned };
}
