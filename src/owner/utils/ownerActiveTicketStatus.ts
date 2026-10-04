// Owner dashboard "active ticket" status matching.
// Ticket writers are not case-consistent: the dispatch path writes lowercase
// `status: "pending_assignment"` when a property has no verified geo, older
// tenant flows write `open`, and newer flows write upper-case values. Exact-case
// matching hid those tickets from the owner dashboard counts (gap 13).

export const OWNER_ACTIVE_TICKET_STATUSES: readonly string[] = [
  'OPEN',
  'PENDING_ASSIGNMENT',
  'WAITING_FOR_TECHNICIAN',
  'ASSIGNED',
  'ACCEPTED',
  'EN_ROUTE',
  'ARRIVED',
  'ON_SITE',
  'IN_PROGRESS',
  'WAITING_PARTS',
  'ESCALATED',
];

export function normalizeTicketStatus(value: unknown): string {
  return String(value ?? '').trim().replace(/[\s-]+/g, '_').toUpperCase();
}

const ACTIVE = new Set(OWNER_ACTIVE_TICKET_STATUSES);

export function isOwnerActiveTicketStatus(value: unknown): boolean {
  return ACTIVE.has(normalizeTicketStatus(value));
}

// A ticket with no status is treated as OPEN (matches the previous dashboard default).
export function isOwnerActiveTicket(ticket: { status?: unknown; trackingStatus?: unknown } | null | undefined): boolean {
  const status = ticket?.status;
  const primary = status === undefined || status === null || String(status).trim() === '' ? 'OPEN' : status;
  return isOwnerActiveTicketStatus(primary) || isOwnerActiveTicketStatus(ticket?.trackingStatus);
}

// Values for a Firestore `where('status', 'in', ...)` filter: the upper-case
// canonical values plus their lower-case spellings (22 values, under the 30 limit).
export const OWNER_ACTIVE_TICKET_STATUS_QUERY_VALUES: readonly string[] = [
  ...OWNER_ACTIVE_TICKET_STATUSES,
  ...OWNER_ACTIVE_TICKET_STATUSES.map((status) => status.toLowerCase()),
];
