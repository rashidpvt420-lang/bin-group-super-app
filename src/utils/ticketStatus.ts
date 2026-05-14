export type NormalizedTicketStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'ON_THE_WAY'
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
  on_the_way: 'ON_THE_WAY',
  en_route: 'ON_THE_WAY',
  arrived: 'ARRIVED',
  in_progress: 'IN_PROGRESS',
  started: 'IN_PROGRESS',
  waiting_parts: 'WAITING_PARTS',
  completed: 'COMPLETED',
  resolved: 'COMPLETED',
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
