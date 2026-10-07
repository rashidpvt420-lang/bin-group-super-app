/**
 * Shared Owner open / high-risk ticket attention counters.
 * Simple command-strip and advanced "Open Maintenance Tasks" must use the same
 * open-status definition so owners never see a silent zero while advanced shows opens.
 */

/** Matches OwnerDashboardResolvedPage ACTIVE_TICKET_STATUSES (Open Maintenance Tasks KPI). */
export const OWNER_OPEN_TICKET_STATUSES = new Set([
  'OPEN',
  'PENDING_ASSIGNMENT',
  'ASSIGNED',
  'ACCEPTED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'WAITING_PARTS',
  'ESCALATED',
]);

/** Aligned with OwnerContractModeMatrix emergency/high + SLA / ticket priority variants. */
export const OWNER_HIGH_RISK_PRIORITIES = new Set([
  'EMERGENCY',
  'CRITICAL',
  'HIGH',
  'URGENT',
]);

export function normalizeOwnerTicketToken(value: unknown, fallback = ''): string {
  return String(value ?? fallback)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

export function isOwnerOpenTicket(ticket: any): boolean {
  if (!ticket) return false;
  const status = normalizeOwnerTicketToken(ticket.status, '');
  // Prefer primary status (same as advanced Open Maintenance Tasks).
  if (status) return OWNER_OPEN_TICKET_STATUSES.has(status);
  // Fall back to trackingStatus only when status is missing.
  const tracking = normalizeOwnerTicketToken(ticket.trackingStatus, '');
  return tracking !== '' && OWNER_OPEN_TICKET_STATUSES.has(tracking);
}

export function isOwnerHighRiskPriority(ticket: any): boolean {
  if (!ticket) return false;
  if (ticket.isEmergency === true) return true;
  const category = normalizeOwnerTicketToken(ticket.category, '');
  if (category === 'EMERGENCY') return true;
  const priority = normalizeOwnerTicketToken(
    ticket.slaPriority || ticket.priority || ticket.severity || '',
    '',
  );
  return priority !== '' && OWNER_HIGH_RISK_PRIORITIES.has(priority);
}

export function isOwnerHighRiskTicket(ticket: any): boolean {
  return isOwnerOpenTicket(ticket) && isOwnerHighRiskPriority(ticket);
}

export function countOwnerOpenTickets(tickets: any[] | null | undefined): number {
  if (!Array.isArray(tickets)) return 0;
  return tickets.filter(isOwnerOpenTicket).length;
}

export function countOwnerHighRiskTickets(tickets: any[] | null | undefined): number {
  if (!Array.isArray(tickets)) return 0;
  return tickets.filter(isOwnerHighRiskTicket).length;
}
