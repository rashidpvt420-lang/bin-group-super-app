/**
 * Technician capacity reconciliation.
 *
 * users/{uid}.currentJobCount is incremented on every assignment and decremented only when a
 * ticket completes or moves to a terminal status through onTicketStatusChanged. A ticket that is
 * deleted while assigned (test teardown, data cleanup) or closed by a path that marks the release
 * as done without decrementing never gave its slot back, so the stored counter drifted upward
 * (a technician with one open job read as 10) and auto-dispatch rejected the technician as full.
 *
 * The source of truth is the set of open tickets actually assigned to the technician. These
 * helpers count it, and dispatch uses that count instead of the stored counter. Capacity limits
 * themselves (maxConcurrentJobs) are unchanged.
 */
import * as admin from "firebase-admin";

const TERMINAL_TICKET_STATES = new Set([
    "completed", "completed_pending_approval", "completed_pending_tenant_approval", "completed_pending_review",
    "closed", "cancelled", "canceled", "rejected", "resolved", "solved", "archived", "deleted",
]);

const key = (value: unknown) => String(value ?? "").trim().replace(/[\s-]+/g, "_").toLowerCase();

export function ticketOccupiesTechnician(ticket: admin.firestore.DocumentData | undefined, technicianId: string): boolean {
    if (!ticket || !technicianId) return false;
    if (ticket.deleted === true || ticket.archived === true) return false;
    const assigned = String(ticket.assignedTechnicianId || ticket.technicianId || "").trim();
    if (assigned !== technicianId) return false;
    if (TERMINAL_TICKET_STATES.has(key(ticket.status))) return false;
    if (TERMINAL_TICKET_STATES.has(key(ticket.dispatchStatus))) return false;
    return true;
}

function openAssignedQueries(db: admin.firestore.Firestore, technicianId: string) {
    const tickets = db.collection("maintenanceTickets");
    return [
        tickets.where("assignedTechnicianId", "==", technicianId),
        tickets.where("technicianId", "==", technicianId),
    ];
}

function countOpen(snaps: admin.firestore.QuerySnapshot[], technicianId: string, excludeTicketId?: string): number {
    const ids = new Set<string>();
    for (const snap of snaps) {
        for (const doc of snap.docs) {
            if (doc.id === excludeTicketId) continue;
            if (ticketOccupiesTechnician(doc.data(), technicianId)) ids.add(doc.id);
        }
    }
    return ids.size;
}

/** Number of open tickets currently assigned to the technician (outside a transaction). */
export async function countOpenAssignedTickets(db: admin.firestore.Firestore, technicianId: string, excludeTicketId?: string): Promise<number> {
    const snaps = await Promise.all(openAssignedQueries(db, technicianId).map((query) => query.get()));
    return countOpen(snaps, technicianId, excludeTicketId);
}

/** Same count, read inside a transaction so the assignment decision and the counter agree. */
export async function countOpenAssignedTicketsInTransaction(
    db: admin.firestore.Firestore,
    transaction: admin.firestore.Transaction,
    technicianId: string,
    excludeTicketId?: string,
): Promise<number> {
    const snaps: admin.firestore.QuerySnapshot[] = [];
    for (const query of openAssignedQueries(db, technicianId)) snaps.push(await transaction.get(query));
    return countOpen(snaps, technicianId, excludeTicketId);
}

/**
 * Release capacity for a ticket that was deleted while it still occupied a technician:
 * the stored counter is reset to the technician's real open-ticket count (never below 0).
 */
export async function releaseCapacityForDeletedTicket(
    db: admin.firestore.Firestore,
    ticketId: string,
    ticket: admin.firestore.DocumentData | undefined,
): Promise<{ technicianId: string; currentJobCount: number } | null> {
    const technicianId = String(ticket?.assignedTechnicianId || ticket?.technicianId || "").trim();
    if (!technicianId || !ticket || ticket.capacityReleasedAt) return null;
    if (!ticketOccupiesTechnician(ticket, technicianId)) return null;
    return reconcileTechnicianJobCount(db, technicianId, ticketId);
}

/** Set users/{uid}.currentJobCount to the real number of open assigned tickets. */
export async function reconcileTechnicianJobCount(
    db: admin.firestore.Firestore,
    technicianId: string,
    excludeTicketId?: string,
): Promise<{ technicianId: string; currentJobCount: number } | null> {
    const technicianRef = db.collection("users").doc(technicianId);
    return db.runTransaction(async (transaction) => {
        const technicianSnap = await transaction.get(technicianRef);
        if (!technicianSnap.exists) return null;
        const open = await countOpenAssignedTicketsInTransaction(db, transaction, technicianId, excludeTicketId);
        const currentJobCount = Math.max(0, open);
        if (Number(technicianSnap.data()?.currentJobCount || 0) !== currentJobCount) {
            transaction.set(technicianRef, {
                currentJobCount,
                currentJobCountReconciledAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
        return { technicianId, currentJobCount };
    });
}
