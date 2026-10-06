// Plain-language lifecycle stage for a maintenance ticket, shared by the Admin and Owner views.
// The Owner view in the main app mirrors this mapping; keep both identical.
export type TicketLifecycleStageKey = 'PENDING' | 'ASSIGNED' | 'IN_PROGRESS' | 'AWAITING_APPROVAL' | 'SOLVED' | 'CANCELLED';

export interface TicketLifecycleStage {
  stage: TicketLifecycleStageKey;
  label: string;
  tone: 'error' | 'warning' | 'info' | 'success' | 'default';
  assigned: boolean;
  needsManualDispatch: boolean;
  reason: string;
}

const SOLVED = new Set(['COMPLETED', 'CLOSED', 'RESOLVED', 'TENANT_APPROVED', 'CLOSED_VERIFIED', 'OWNER_APPROVED']);
const AWAITING_APPROVAL = new Set(['COMPLETED_PENDING_APPROVAL', 'PENDING_APPROVAL', 'AWAITING_TENANT_APPROVAL']);
const CANCELLED = new Set(['CANCELLED', 'CANCELED', 'REJECTED']);
const IN_PROGRESS = new Set([
  'EN_ROUTE', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'STARTED', 'WORK_STARTED', 'WAITING_PARTS', 'ON_HOLD',
  'ESCALATED', 'DISPUTED',
]);
const ASSIGNED = new Set(['ASSIGNED', 'AUTO_ASSIGNED', 'DISPATCHED', 'TECHNICIAN_ASSIGNED', 'ACCEPTED', 'CLAIMED', 'SCHEDULED']);

function key(value: unknown): string {
  return String(value ?? '').trim().replace(/[\s-]+/g, '_').toUpperCase();
}

export function ticketLifecycleStage(ticket: Record<string, any> | null | undefined): TicketLifecycleStage {
  const data = ticket || {};
  const status = key(data.status);
  const dispatchStatus = key(data.dispatchStatus);
  const assigned = Boolean(String(data.assignedTechnicianId || data.technicianId || '').trim());
  const result = (stage: TicketLifecycleStageKey, label: string, tone: TicketLifecycleStage['tone'], needsManualDispatch = false, reason = '') =>
    ({ stage, label, tone, assigned, needsManualDispatch, reason });

  if (CANCELLED.has(status)) return result('CANCELLED', 'Cancelled', 'default');
  if (SOLVED.has(status)) return result('SOLVED', 'Solved', 'success');
  if (AWAITING_APPROVAL.has(status)) return result('AWAITING_APPROVAL', 'Completed – awaiting approval', 'info');
  if (IN_PROGRESS.has(status)) return result('IN_PROGRESS', 'In progress', 'warning');
  if (ASSIGNED.has(status) || assigned) return result('ASSIGNED', 'Assigned', 'info');
  if (dispatchStatus === 'PENDING_MANUAL_DISPATCH') {
    const reason = String(data.assignmentError || data.assignmentReasonCode || 'No qualified technician was available.').trim();
    return result('PENDING', 'Pending – needs manual dispatch', 'error', true, reason);
  }
  return result('PENDING', 'Pending assignment', 'error');
}
