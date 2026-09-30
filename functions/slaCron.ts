import * as admin from "firebase-admin";
import { TICKET_STATE_MACHINE } from "./canonicalStateMachines";

// N-36: evaluateSLACron matched status in ["OPEN", "assigned"], a mixed-case set. Tickets stored
// with canonical upper-case ASSIGNED, lower-case "open", or legacy aliases (NEW, PENDING,
// DISPATCHED, TECHNICIAN_ASSIGNED, ...) were never flagged, so SLA breaches were under-reported.
//
// Pre-work states: the ticket has not been accepted/started by a technician yet.
const PRE_WORK_CANONICAL = ["OPEN", "PENDING_SCHEDULING", "ASSIGNED", "REOPENED"] as const;

function preWorkStatusValues(): string[] {
  const canonical = new Set<string>(PRE_WORK_CANONICAL);
  const values = new Set<string>(PRE_WORK_CANONICAL);
  for (const [alias, target] of Object.entries(TICKET_STATE_MACHINE.aliases)) {
    if (canonical.has(target)) values.add(alias);
  }
  // Legacy writers stored lower-case statuses; match both spellings of every value.
  for (const value of [...values]) values.add(value.toLowerCase());
  return [...values].sort();
}

export const SLA_PRE_WORK_STATUSES: readonly string[] = Object.freeze(preWorkStatusValues());
export const SLA_BREACH_AFTER_MS = 24 * 60 * 60 * 1000;

export async function flagSlaBreaches(db: admin.firestore.Firestore, now: admin.firestore.Timestamp): Promise<number> {
  if (SLA_PRE_WORK_STATUSES.length > 30) throw new Error("Firestore 'in' filters accept at most 30 values.");
  const cutoff = admin.firestore.Timestamp.fromMillis(now.toMillis() - SLA_BREACH_AFTER_MS);
  const staleTickets = await db.collection("maintenanceTickets")
    .where("status", "in", [...SLA_PRE_WORK_STATUSES])
    .where("createdAt", "<", cutoff)
    .get();
  for (const doc of staleTickets.docs) {
    await doc.ref.update({ slaViolated: true, lastEscalatedAt: now });
  }
  return staleTickets.size;
}
