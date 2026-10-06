/**
 * BIN GROUP — Live tracking panel state.
 *
 * Maps the real ticket lifecycle status (canonical TICKET_STATE_MACHINE states
 * plus legacy aliases) to what the shared Owner/Tenant tracking panel may
 * claim. Terminal tickets (completed, pending approval, closed, cancelled)
 * never expose live GPS, a technician position, distance or an arrival
 * estimate. A ticket with an assigned technician is never reported as
 * awaiting assignment. Active jobs keep the existing live-tracking path.
 *
 * Pure ESM so the launch tests can execute it directly with node --test.
 */

export const COMPLETED_TRACKING_STATUSES = Object.freeze([
  'COMPLETED',
  'COMPLETED_PENDING_APPROVAL',
  'COMPLETED_PENDING_TENANT_APPROVAL',
  'COMPLETED_PENDING_OWNER_APPROVAL',
  'AWAITING_OWNER_APPROVAL',
  'PENDING_OWNER_APPROVAL',
  'PENDING_TENANT_APPROVAL',
  'TENANT_APPROVED',
  'OWNER_APPROVED',
  'RESOLVED',
  'CLOSED',
  'CLOSED_VERIFIED',
  'DONE',
]);

export const CANCELLED_TRACKING_STATUSES = Object.freeze(['CANCELLED', 'CANCELED', 'REJECTED']);

const COMPLETED_SET = new Set(COMPLETED_TRACKING_STATUSES);
const CANCELLED_SET = new Set(CANCELLED_TRACKING_STATUSES);

const PHASE_BY_STATUS = Object.freeze({
  OPEN: 'open',
  NEW: 'open',
  PENDING: 'open',
  UNASSIGNED: 'open',
  PENDING_ASSIGNMENT: 'open',
  EMERGENCY_SUBMITTED: 'open',
  PENDING_SCHEDULING: 'scheduled',
  SCHEDULED: 'scheduled',
  ASSIGNED: 'accepted',
  AUTO_ASSIGNED: 'accepted',
  DISPATCHED: 'accepted',
  TECHNICIAN_ASSIGNED: 'accepted',
  ACCEPTED: 'accepted',
  CLAIMED: 'accepted',
  EN_ROUTE: 'on_the_way',
  ON_THE_WAY: 'on_the_way',
  LIVE_TRACKING: 'on_the_way',
  ARRIVED: 'arrived',
  IN_PROGRESS: 'in_progress',
  STARTED: 'in_progress',
  WORK_STARTED: 'in_progress',
  WAITING_PARTS: 'waiting_parts',
  ON_HOLD: 'on_hold',
  RESCHEDULE_REQUESTED: 'on_hold',
  CANCELLATION_REQUESTED: 'on_hold',
  ESCALATED: 'escalated',
  DISPUTED: 'disputed',
  PENDING_DISPUTE_REVIEW: 'disputed',
  REOPENED: 'reopened',
  REOPENED_FOR_REVISIT: 'reopened',
});

// Which DISPLAY_STEPS entry (open → accepted → on_the_way → arrived →
// in_progress → completed) each phase corresponds to.
const TIMELINE_STEP_BY_PHASE = Object.freeze({
  open: 'open',
  scheduled: 'open',
  accepted: 'accepted',
  on_the_way: 'on_the_way',
  arrived: 'arrived',
  in_progress: 'in_progress',
  waiting_parts: 'in_progress',
  on_hold: 'accepted',
  escalated: 'accepted',
  disputed: 'completed',
  reopened: 'accepted',
  completed: 'completed',
  cancelled: 'open',
});

export function normalizeTrackingStatusKey(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function hasAssignedTechnician(ticket) {
  return Boolean(
    ticket && (
      nonEmpty(ticket.assignedTechnicianId) ||
      nonEmpty(ticket.technicianId) ||
      nonEmpty(ticket.assignedTechId) ||
      nonEmpty(ticket.technicianUid)
    ),
  );
}

export function assignedTechnicianDisplayName(ticket) {
  const name = [ticket?.assignedTechnicianName, ticket?.technicianName]
    .find((value) => nonEmpty(value));
  return name ? name.trim() : '';
}

/**
 * Resolves the lifecycle phase the tracking panel should present.
 */
export function resolveTrackingPhase(ticket) {
  const statusKey = normalizeTrackingStatusKey(ticket?.status);
  const trackingKey = normalizeTrackingStatusKey(ticket?.trackingStatus);
  const assigned = hasAssignedTechnician(ticket);

  if (COMPLETED_SET.has(statusKey) || statusKey.startsWith('COMPLETED_')) return 'completed';
  if (CANCELLED_SET.has(statusKey)) return 'cancelled';

  let phase = PHASE_BY_STATUS[statusKey];
  if (!phase) {
    // Unknown/missing status: fall back to the server-written tracking
    // status before defaulting, so a stopped "COMPLETED" session is honoured.
    if (trackingKey === 'COMPLETED') return 'completed';
    if (trackingKey === 'CANCELLED') return 'cancelled';
    phase = 'open';
  }
  // A technician is assigned: never claim the ticket is awaiting assignment.
  if ((phase === 'open' || phase === 'scheduled') && assigned) {
    return phase === 'scheduled' ? 'scheduled' : 'accepted';
  }
  return phase;
}

/**
 * Policy for what the tracking panel may show for a ticket.
 */
export function resolveTrackingPanelState(ticket) {
  const phase = resolveTrackingPhase(ticket);
  const isTerminal = phase === 'completed' || phase === 'cancelled';
  return {
    phase,
    statusKey: normalizeTrackingStatusKey(ticket?.status),
    isTerminal,
    // Terminal tickets never show live GPS, a technician position, distance
    // or an arrival estimate.
    allowLiveTracking: !isTerminal,
    technicianAssigned: hasAssignedTechnician(ticket),
    technicianName: assignedTechnicianDisplayName(ticket),
    timelineStep: TIMELINE_STEP_BY_PHASE[phase] || 'open',
  };
}
