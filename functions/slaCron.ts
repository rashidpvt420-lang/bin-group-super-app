import * as admin from "firebase-admin";
import { TICKET_STATE_MACHINE } from "./canonicalStateMachines";
import { adminRecipientIds } from "./ticketStakeholderNotifications";
import { createSlaBreachNotifications } from "./slaBreachNotification";

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
  // Admins are looked up once per run, and only if a ticket is breaching for the first time.
  let adminIds: string[] | null = null;
  let notifyFailures = 0;
  for (const doc of staleTickets.docs) {
    const data = doc.data() || {};
    const update: Record<string, unknown> = { slaViolated: true, lastEscalatedAt: now };
    // Tell Admin once per breach. Tickets already flagged by earlier runs (slaViolated) or already
    // notified are not re-announced, so deploying this does not page Admin for the whole backlog.
    if (data.slaViolated !== true && !data.slaBreachNotifiedAt) {
      try {
        adminIds = adminIds ?? await adminRecipientIds(db);
        await createSlaBreachNotifications({
          db,
          ticketId: doc.id,
          ticket: data,
          adminIds,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          breachWindowHours: SLA_BREACH_AFTER_MS / (60 * 60 * 1000),
        });
        update.slaBreachNotifiedAt = now;
      } catch (error) {
        // Leave the ticket unflagged so the next cron run retries; ids are deterministic so a
        // partially delivered fan-out is completed, not duplicated.
        notifyFailures += 1;
        console.error(`[sla-cron] breach notification failed for ticket ${doc.id}`, error);
        continue;
      }
    }
    await doc.ref.update(update);
  }
  if (notifyFailures > 0) throw new Error(`SLA breach notification failed for ${notifyFailures} ticket(s); they will be retried on the next run.`);
  return staleTickets.size;
}
