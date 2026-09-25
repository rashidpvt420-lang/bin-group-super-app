export type NormalizedTicketStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'IN_PROGRESS'
  | 'WAITING_PARTS'
  | 'COMPLETED'
  | 'TENANT_APPROVED'
  | 'CLOSED'
  | 'DISPUTED';

const aliases: Record<string, NormalizedTicketStatus> = {
  open: 'OPEN',
  new: 'OPEN',
  pending: 'OPEN',
  pending_assignment: 'OPEN',
  assigned: 'ASSIGNED',
  dispatched: 'ASSIGNED',
  accepted: 'ACCEPTED',
  claimed: 'ACCEPTED',
  on_the_way: 'EN_ROUTE',
  en_route: 'EN_ROUTE',
  arrived: 'ARRIVED',
  in_progress: 'IN_PROGRESS',
  started: 'IN_PROGRESS',
  waiting_parts: 'WAITING_PARTS',
  completed: 'COMPLETED',
  resolved: 'CLOSED',
  tenant_approved: 'TENANT_APPROVED',
  closed: 'CLOSED',
  done: 'CLOSED',
  disputed: 'DISPUTED',
  rejected: 'DISPUTED',
};

export function normalizeTicketStatus(value: unknown): NormalizedTicketStatus {
  const key = String(value || 'open').trim().replace(/[\s-]+/g, '_').toLowerCase();
  return aliases[key] || 'OPEN';
}

export function formatTicketStatus(value: unknown): string {
  return normalizeTicketStatus(value).replaceAll('_', ' ');
}
