/**
 * Owner ticket sign-off gate.
 * Matches OwnerTicketDetailPage: completed work awaiting Approve & Close.
 * Status may arrive as COMPLETED_PENDING_APPROVAL or "COMPLETED PENDING APPROVAL".
 */
export const OWNER_PENDING_SIGNOFF_STATUSES = new Set([
  'COMPLETED',
  'COMPLETED_PENDING_APPROVAL',
  'COMPLETED_PENDING_TENANT_APPROVAL',
  'RESOLVED',
]);

export function normalizeOwnerTicketStatus(value: unknown): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

export function isOwnerPendingSignOff(
  ticket: { status?: unknown; ownerApproved?: unknown } | null | undefined,
): boolean {
  if (!ticket) return false;
  if (ticket.ownerApproved === true) return false;
  return OWNER_PENDING_SIGNOFF_STATUSES.has(normalizeOwnerTicketStatus(ticket.status));
}

export function countOwnerPendingSignOffs(
  tickets: Array<{ status?: unknown; ownerApproved?: unknown }>,
): number {
  return tickets.filter(isOwnerPendingSignOff).length;
}
