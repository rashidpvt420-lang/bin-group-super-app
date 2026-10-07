/**
 * Idempotency keys for the requester-facing "Technician Assigned" notification.
 *
 * A single assignment moves a ticket through two statuses that both mean "a
 * technician is assigned": OPEN -> ASSIGNED (auto-assignment or dispatch) and
 * then ASSIGNED -> ACCEPTED (the technician accepts). onTicketStatusChanged
 * used to emit "Technician Assigned" on each transition with a random
 * notification ID, so owners/tenants saw it twice for one assignment (and
 * trigger retries could add more). The key below identifies one assignment
 * (ticket + technician + assignment time), so both transitions and retries
 * map to the same notification document, while a genuine re-assignment (a
 * different technician, or a fresh assignment time) gets a new key.
 *
 * Dependency-free so it can be unit-tested without the Admin SDK.
 */

type PlainRecord = Record<string, any>;

export const TECHNICIAN_ASSIGNED_STATUSES: ReadonlySet<string> = new Set([
  "assigned",
  "accepted",
  "technician_assigned",
]);

function clean(value: unknown, max = 240): string {
  if (value === null || value === undefined) return "";
  return String(value).trim().slice(0, max);
}

export function isTechnicianAssignedStatus(status: unknown): boolean {
  return TECHNICIAN_ASSIGNED_STATUSES.has(clean(status, 80).toLowerCase().replace(/[\s-]+/g, "_"));
}

export function assignedTechnicianIdOf(ticket: PlainRecord | null | undefined): string {
  if (!ticket) return "";
  return clean(
    ticket.assignedTechnicianId || ticket.technicianId || ticket.assignedTechId || ticket.techId,
    160,
  );
}

/** Millisecond value for Firestore Timestamps, {seconds}, Dates, ISO strings or numbers. */
export function timestampMillis(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const record = value as any;
  if (typeof record?.toMillis === "function") {
    const millis = Number(record.toMillis());
    return Number.isFinite(millis) ? millis : null;
  }
  if (value instanceof Date) {
    const millis = value.getTime();
    return Number.isFinite(millis) ? millis : null;
  }
  const seconds = Number(record?.seconds ?? record?._seconds);
  if (Number.isFinite(seconds)) {
    const nanos = Number(record?.nanoseconds ?? record?._nanoseconds ?? 0);
    return seconds * 1000 + Math.floor((Number.isFinite(nanos) ? nanos : 0) / 1e6);
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * The moment the current assignment was made. Dispatch writes assignedAt,
 * auto-assignment writes autoAssignedAt (the latest of the two wins); a
 * technician self-claim of an open ticket only writes acceptedAt. Accepting an
 * already-assigned ticket does not touch assignedAt/autoAssignedAt, so the
 * epoch is stable across ASSIGNED -> ACCEPTED.
 */
export function assignmentEpoch(ticket: PlainRecord | null | undefined): string {
  if (!ticket) return "unversioned";
  const assigned = [timestampMillis(ticket.assignedAt), timestampMillis(ticket.autoAssignedAt)]
    .filter((value): value is number => value !== null);
  if (assigned.length) return String(Math.max(...assigned));
  const accepted = timestampMillis(ticket.acceptedAt);
  return accepted !== null ? String(accepted) : "unversioned";
}

/**
 * Stable seed for one recipient's notification about one assignment, or null
 * when there is no assigned technician. Hash it into the notification doc ID.
 */
export function technicianAssignedNotificationSeed(
  ticketId: string,
  recipientId: string,
  audience: string,
  ticket: PlainRecord | null | undefined,
): string | null {
  const technicianId = assignedTechnicianIdOf(ticket);
  const ticketKey = clean(ticketId, 160);
  const recipientKey = clean(recipientId, 160);
  if (!ticketKey || !recipientKey || !technicianId) return null;
  return [
    "technician-assigned-v1",
    ticketKey,
    technicianId,
    assignmentEpoch(ticket),
    clean(audience, 40).toLowerCase() || "requester",
    recipientKey,
  ].join("|");
}

/**
 * Whether this ticket update starts a new technician assignment that the
 * requester should hear about: the status entered an assigned/accepted state,
 * or the technician changed while the ticket stayed assigned/accepted.
 */
export function isTechnicianAssignmentEvent(
  before: PlainRecord | null | undefined,
  after: PlainRecord | null | undefined,
): boolean {
  if (!after || !isTechnicianAssignedStatus(after.status)) return false;
  if (clean(before?.status) !== clean(after.status)) return true;
  const afterTechnicianId = assignedTechnicianIdOf(after);
  return Boolean(afterTechnicianId) && assignedTechnicianIdOf(before) !== afterTechnicianId;
}
