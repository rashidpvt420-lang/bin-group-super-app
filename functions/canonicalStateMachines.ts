/**
 * Phase 12 canonical lifecycle contracts.
 *
 * Canonical states are the only values that may be written by new authoritative
 * code. Legacy aliases are read-compatibility only and must be normalized before
 * comparisons, filters, reporting, or transition checks.
 */

export type StateMachineDefinition = Readonly<{
  states: readonly string[];
  aliases: Readonly<Record<string, string>>;
  transitions: Readonly<Record<string, readonly string[]>>;
}>;

const rawKey = (value: unknown) => String(value || '')
  .trim()
  .replace(/[\s-]+/g, '_');

const keyFor = (machineName: string, value: unknown) =>
  machineName === 'onboarding' ? rawKey(value).toLowerCase() : rawKey(value).toUpperCase();

const machine = (
  states: readonly string[],
  aliases: Record<string, string>,
  transitions: Record<string, readonly string[]>,
): StateMachineDefinition => Object.freeze({
  states: Object.freeze([...states]),
  aliases: Object.freeze({ ...aliases }),
  transitions: Object.freeze({ ...transitions }),
});

export const PROPERTY_STATE_MACHINE = machine(
  [
    'DRAFT',
    'UNDER_REVIEW',
    'CHANGES_REQUESTED',
    'PENDING_PROPERTY_INSPECTION',
    'INSPECTION_IN_PROGRESS',
    'INSPECTION_COMPLETED',
    'QUOTE_READY',
    'CONTRACT_PENDING',
    'PAYMENT_PENDING',
    'ACTIVATION_PENDING',
    'ACTIVE',
    'REJECTED',
    'SUSPENDED',
  ],
  {
    ADMIN_REVIEW: 'UNDER_REVIEW',
    SUBMITTED: 'UNDER_REVIEW',
    SUBMITTED_FOR_PROPERTY_INSPECTION: 'PENDING_PROPERTY_INSPECTION',
    AWAITING_SITE_INSPECTION: 'PENDING_PROPERTY_INSPECTION',
    SIGNED_PENDING_PROPERTY_INSPECTION: 'PENDING_PROPERTY_INSPECTION',
    AWAITING_15_PERCENT_PAYMENT: 'PAYMENT_PENDING',
    AWAITING_ACTIVATION_PAYMENT: 'PAYMENT_PENDING',
    READY_FOR_ACTIVATION: 'ACTIVATION_PENDING',
    ACTIVATED: 'ACTIVE',
    LIVE: 'ACTIVE',
  },
  {
    DRAFT: ['UNDER_REVIEW'],
    UNDER_REVIEW: ['CHANGES_REQUESTED', 'PENDING_PROPERTY_INSPECTION', 'REJECTED'],
    CHANGES_REQUESTED: ['UNDER_REVIEW'],
    PENDING_PROPERTY_INSPECTION: ['INSPECTION_IN_PROGRESS', 'CHANGES_REQUESTED'],
    INSPECTION_IN_PROGRESS: ['INSPECTION_COMPLETED', 'CHANGES_REQUESTED'],
    INSPECTION_COMPLETED: ['QUOTE_READY'],
    QUOTE_READY: ['CONTRACT_PENDING'],
    CONTRACT_PENDING: ['PAYMENT_PENDING'],
    PAYMENT_PENDING: ['ACTIVATION_PENDING'],
    ACTIVATION_PENDING: ['ACTIVE'],
    ACTIVE: ['SUSPENDED'],
    SUSPENDED: ['ACTIVE'],
    REJECTED: [],
  },
);

export const TICKET_STATE_MACHINE = machine(
  [
    'OPEN',
    'PENDING_SCHEDULING',
    'SCHEDULED',
    'ASSIGNED',
    'ACCEPTED',
    'EN_ROUTE',
    'ARRIVED',
    'IN_PROGRESS',
    'WAITING_PARTS',
    'ON_HOLD',
    'RESCHEDULE_REQUESTED',
    'CANCELLATION_REQUESTED',
    'ESCALATED',
    'DISPUTED',
    'REOPENED',
    'COMPLETED_PENDING_APPROVAL',
    'COMPLETED',
    'CLOSED',
    'CANCELLED',
    'REJECTED',
  ],
  {
    NEW: 'OPEN',
    UNASSIGNED: 'OPEN',
    PENDING: 'OPEN',
    PENDING_ASSIGNMENT: 'OPEN',
    EMERGENCY_SUBMITTED: 'OPEN',
    AUTO_ASSIGNED: 'ASSIGNED',
    DISPATCHED: 'ASSIGNED',
    TECHNICIAN_ASSIGNED: 'ASSIGNED',
    CLAIMED: 'ACCEPTED',
    ON_THE_WAY: 'EN_ROUTE',
    STARTED: 'IN_PROGRESS',
    WORK_STARTED: 'IN_PROGRESS',
    TENANT_APPROVED: 'CLOSED',
    RESOLVED: 'CLOSED',
    CLOSED_VERIFIED: 'CLOSED',
    CANCELED: 'CANCELLED',
  },
  {
    OPEN: ['PENDING_SCHEDULING', 'ASSIGNED', 'CANCELLED', 'REJECTED'],
    PENDING_SCHEDULING: ['SCHEDULED', 'CANCELLED'],
    SCHEDULED: ['ASSIGNED', 'RESCHEDULE_REQUESTED', 'CANCELLATION_REQUESTED'],
    ASSIGNED: ['ACCEPTED', 'CANCELLED'],
    ACCEPTED: ['EN_ROUTE', 'ARRIVED', 'CANCELLED'],
    EN_ROUTE: ['ARRIVED', 'CANCELLED'],
    ARRIVED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['WAITING_PARTS', 'ON_HOLD', 'COMPLETED_PENDING_APPROVAL', 'ESCALATED'],
    WAITING_PARTS: ['IN_PROGRESS', 'ON_HOLD', 'ESCALATED'],
    ON_HOLD: ['IN_PROGRESS', 'CANCELLED', 'ESCALATED'],
    RESCHEDULE_REQUESTED: ['SCHEDULED', 'CANCELLED'],
    CANCELLATION_REQUESTED: ['CANCELLED', 'SCHEDULED'],
    ESCALATED: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
    DISPUTED: ['REOPENED', 'CLOSED'],
    REOPENED: ['ASSIGNED', 'IN_PROGRESS'],
    COMPLETED_PENDING_APPROVAL: ['COMPLETED', 'DISPUTED', 'REOPENED'],
    COMPLETED: ['CLOSED', 'DISPUTED', 'REOPENED'],
    CLOSED: [],
    CANCELLED: [],
    REJECTED: [],
  },
);

export const INSPECTION_STATE_MACHINE = machine(
  [
    'PENDING',
    'SCHEDULED',
    'IN_PROGRESS',
    'SUBMITTED',
    'OWNER_REVIEW',
    'CHANGES_REQUESTED',
    'REINSPECTION_REQUESTED',
    'DISPUTED',
    'COMPLETED',
    'VERIFIED',
    'REJECTED',
    'CANCELLED',
  ],
  {
    PENDING_ADMIN_SITE_VISIT: 'PENDING',
    AWAITING_SITE_INSPECTION: 'PENDING',
    EVIDENCE_RECORDED_PENDING_COMPLETION: 'SUBMITTED',
    INSPECTION_EVIDENCE_RECORDED: 'SUBMITTED',
    PENDING_REVIEW: 'OWNER_REVIEW',
    CANCELED: 'CANCELLED',
  },
  {
    PENDING: ['SCHEDULED', 'IN_PROGRESS', 'CANCELLED'],
    SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['SUBMITTED', 'CANCELLED'],
    SUBMITTED: ['OWNER_REVIEW', 'COMPLETED', 'CHANGES_REQUESTED', 'REJECTED'],
    OWNER_REVIEW: ['VERIFIED', 'CHANGES_REQUESTED', 'REINSPECTION_REQUESTED', 'DISPUTED'],
    CHANGES_REQUESTED: ['IN_PROGRESS', 'SUBMITTED'],
    REINSPECTION_REQUESTED: ['SCHEDULED', 'IN_PROGRESS'],
    DISPUTED: ['REINSPECTION_REQUESTED', 'VERIFIED', 'REJECTED'],
    COMPLETED: ['VERIFIED', 'CHANGES_REQUESTED'],
    VERIFIED: [],
    REJECTED: [],
    CANCELLED: [],
  },
);

export const PAYMENT_STATE_MACHINE = machine(
  [
    'NOT_DUE_UNTIL_INSPECTION_COMPLETE',
    'PENDING_ADMIN_PAYMENT_VERIFICATION',
    'PENDING_ADMIN_APPROVAL',
    'APPROVED',
    'REJECTED',
    'FAILED',
    'CANCELLED',
    'REFUND_PENDING',
    'REFUNDED',
  ],
  {
    NOT_STARTED: 'NOT_DUE_UNTIL_INSPECTION_COMPLETE',
    PENDING: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
    PENDING_VERIFICATION: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
    ADMIN_VERIFICATION_REQUIRED: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
    AWAITING_VERIFICATION: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
    PAYMENT_SUBMITTED: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
    PAYMENT_PROCESSING: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
    PENDING_ADMIN_VERIFICATION: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
    PENDING_ADMIN_PAYMENT_APPROVAL: 'PENDING_ADMIN_APPROVAL',
    PAID: 'APPROVED',
    VERIFIED: 'APPROVED',
    ADMIN_VERIFIED: 'APPROVED',
    PAYMENT_VERIFIED: 'APPROVED',
    SETTLED: 'APPROVED',
    RECONCILED: 'APPROVED',
    CANCELED: 'CANCELLED',
  },
  {
    NOT_DUE_UNTIL_INSPECTION_COMPLETE: ['PENDING_ADMIN_PAYMENT_VERIFICATION'],
    PENDING_ADMIN_PAYMENT_VERIFICATION: ['PENDING_ADMIN_APPROVAL', 'REJECTED', 'FAILED', 'CANCELLED'],
    PENDING_ADMIN_APPROVAL: ['APPROVED', 'REJECTED', 'FAILED', 'CANCELLED'],
    APPROVED: ['REFUND_PENDING'],
    REFUND_PENDING: ['REFUNDED', 'APPROVED'],
    REJECTED: [],
    FAILED: ['PENDING_ADMIN_PAYMENT_VERIFICATION', 'CANCELLED'],
    CANCELLED: [],
    REFUNDED: [],
  },
);

export const QUOTE_STATE_MACHINE = machine(
  [
    'DRAFT',
    'PENDING_OPERATIONS_QUOTE',
    'PENDING_OWNER_APPROVAL',
    'PENDING_TENANT_APPROVAL',
    'READY',
    'APPROVED',
    'REJECTED',
    'DEPOSIT_PENDING',
    'EXPIRED',
    'SUPERSEDED',
  ],
  {
    QUOTE_READY: 'READY',
    SENT: 'READY',
    ACCEPTED: 'APPROVED',
    APPROVED_RECURRING_PLAN: 'APPROVED',
    OWNER_APPROVED: 'APPROVED',
    TENANT_APPROVED: 'APPROVED',
  },
  {
    DRAFT: ['PENDING_OPERATIONS_QUOTE', 'READY'],
    PENDING_OPERATIONS_QUOTE: ['PENDING_OWNER_APPROVAL', 'PENDING_TENANT_APPROVAL', 'READY', 'EXPIRED'],
    PENDING_OWNER_APPROVAL: ['APPROVED', 'REJECTED', 'EXPIRED'],
    PENDING_TENANT_APPROVAL: ['APPROVED', 'REJECTED', 'EXPIRED'],
    READY: ['APPROVED', 'REJECTED', 'EXPIRED', 'SUPERSEDED'],
    APPROVED: ['DEPOSIT_PENDING', 'SUPERSEDED'],
    DEPOSIT_PENDING: ['SUPERSEDED'],
    REJECTED: [],
    EXPIRED: [],
    SUPERSEDED: [],
  },
);

export const CONTRACT_STATE_MACHINE = machine(
  [
    'DRAFT',
    'PENDING_OWNER_SIGNATURE',
    'SIGNED',
    'PENDING_ACTIVATION',
    'ACTIVE',
    'SUSPENDED',
    'CANCELLED',
    'EXPIRED',
    'TERMINATED',
  ],
  {
    PENDING: 'DRAFT',
    PENDING_SIGNATURE: 'PENDING_OWNER_SIGNATURE',
    APPROVED_PENDING_OWNER_SIGNATURE: 'PENDING_OWNER_SIGNATURE',
    APPROVED_AWAITING_OWNER_SIGNATURE: 'PENDING_OWNER_SIGNATURE',
    OWNER_SIGNED: 'SIGNED',
    READY_FOR_ACTIVATION: 'PENDING_ACTIVATION',
    CANCELED: 'CANCELLED',
    CLOSED: 'TERMINATED',
  },
  {
    DRAFT: ['PENDING_OWNER_SIGNATURE', 'CANCELLED', 'EXPIRED'],
    PENDING_OWNER_SIGNATURE: ['SIGNED', 'CANCELLED', 'EXPIRED'],
    SIGNED: ['PENDING_ACTIVATION', 'CANCELLED'],
    PENDING_ACTIVATION: ['ACTIVE', 'CANCELLED'],
    ACTIVE: ['SUSPENDED', 'CANCELLED', 'TERMINATED', 'EXPIRED'],
    SUSPENDED: ['ACTIVE', 'TERMINATED'],
    CANCELLED: [],
    EXPIRED: [],
    TERMINATED: [],
  },
);

export const TENANT_LINK_STATE_MACHINE = machine(
  [
    'PENDING_ADMIN_REVIEW',
    'CHANGES_REQUESTED',
    'APPROVED',
    'REJECTED',
    'REVOKED',
  ],
  {
    PENDING: 'PENDING_ADMIN_REVIEW',
    UNDER_REVIEW: 'PENDING_ADMIN_REVIEW',
    VERIFIED: 'APPROVED',
    LINKED: 'APPROVED',
    DENIED: 'REJECTED',
  },
  {
    PENDING_ADMIN_REVIEW: ['CHANGES_REQUESTED', 'APPROVED', 'REJECTED'],
    CHANGES_REQUESTED: ['PENDING_ADMIN_REVIEW', 'REJECTED'],
    APPROVED: ['REVOKED'],
    REJECTED: [],
    REVOKED: [],
  },
);

export const BROKER_KYC_STATE_MACHINE = machine(
  [
    'INCOMPLETE',
    'PENDING_REVIEW',
    'VERIFIED',
    'REJECTED',
    'SUSPENDED',
    'EXPIRED',
  ],
  {
    PENDING: 'PENDING_REVIEW',
    UNDER_REVIEW: 'PENDING_REVIEW',
    APPROVED: 'VERIFIED',
    DENIED: 'REJECTED',
  },
  {
    INCOMPLETE: ['PENDING_REVIEW'],
    PENDING_REVIEW: ['VERIFIED', 'REJECTED'],
    VERIFIED: ['SUSPENDED', 'EXPIRED'],
    REJECTED: ['INCOMPLETE', 'PENDING_REVIEW'],
    SUSPENDED: ['PENDING_REVIEW', 'VERIFIED'],
    EXPIRED: ['PENDING_REVIEW'],
  },
);

export const TECHNICIAN_JOB_STATE_MACHINE = machine(
  [
    'ASSIGNED',
    'ACCEPTED',
    'EN_ROUTE',
    'ARRIVED',
    'IN_PROGRESS',
    'WAITING_PARTS',
    'ON_HOLD',
    'COMPLETED_PENDING_APPROVAL',
    'COMPLETED',
    'CLOSED',
    'CANCELLED',
  ],
  {
    AUTO_ASSIGNED: 'ASSIGNED',
    TECHNICIAN_ASSIGNED: 'ASSIGNED',
    ON_THE_WAY: 'EN_ROUTE',
    WORK_STARTED: 'IN_PROGRESS',
    INSPECTION_EVIDENCE_RECORDED: 'IN_PROGRESS',
    CANCELED: 'CANCELLED',
  },
  {
    ASSIGNED: ['ACCEPTED', 'CANCELLED'],
    ACCEPTED: ['EN_ROUTE', 'ARRIVED', 'CANCELLED'],
    EN_ROUTE: ['ARRIVED', 'CANCELLED'],
    ARRIVED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['WAITING_PARTS', 'ON_HOLD', 'COMPLETED_PENDING_APPROVAL'],
    WAITING_PARTS: ['IN_PROGRESS', 'ON_HOLD'],
    ON_HOLD: ['IN_PROGRESS', 'CANCELLED'],
    COMPLETED_PENDING_APPROVAL: ['COMPLETED', 'IN_PROGRESS'],
    COMPLETED: ['CLOSED'],
    CLOSED: [],
    CANCELLED: [],
  },
);

export const ONBOARDING_STATE_MACHINE = machine(
  [
    'draft',
    'account_created',
    'property_details_complete',
    'documents_pending',
    'quote_ready',
    'contract_selected',
    'deposit_pending',
    'deposit_processing',
    'deposit_paid',
    'identity_pending',
    'signature_pending',
    'admin_review',
    'changes_requested',
    'approved',
    'active',
    'rejected',
    'expired',
    'suspended',
  ],
  {
    auth_created: 'account_created',
    owner_account_created: 'account_created',
    pending: 'draft',
    under_review: 'admin_review',
    pending_admin_review: 'admin_review',
    pending_admin_approval: 'admin_review',
    payment_verified_pending_admin_approval: 'admin_review',
    payment_pending: 'deposit_pending',
    payment_pending_approval: 'deposit_processing',
    pending_admin_payment_verification: 'deposit_processing',
    pending_payment_verification: 'deposit_processing',
    awaiting_payment: 'deposit_pending',
    awaiting_verification: 'admin_review',
    payment_submitted: 'deposit_processing',
    payment_processing: 'deposit_processing',
    paid: 'deposit_paid',
    payment_verified: 'deposit_paid',
    awaiting_signature: 'signature_pending',
    approved_awaiting_owner_signature: 'signature_pending',
    approved_pending_owner_signature: 'signature_pending',
    ready_for_activation: 'approved',
    approved_awaiting_activation: 'approved',
    activated: 'active',
    live: 'active',
    denied: 'rejected',
    cancelled: 'expired',
    canceled: 'expired',
  },
  {
    draft: ['account_created', 'expired', 'suspended'],
    account_created: ['property_details_complete', 'documents_pending', 'expired', 'suspended'],
    property_details_complete: ['documents_pending', 'quote_ready', 'expired', 'suspended'],
    documents_pending: ['quote_ready', 'changes_requested', 'expired', 'suspended'],
    quote_ready: ['contract_selected', 'expired', 'suspended'],
    contract_selected: ['identity_pending', 'signature_pending', 'expired', 'suspended'],
    deposit_pending: ['deposit_processing', 'expired', 'suspended'],
    deposit_processing: ['deposit_paid', 'deposit_pending', 'expired', 'suspended'],
    deposit_paid: ['admin_review', 'suspended'],
    identity_pending: ['signature_pending', 'property_details_complete', 'documents_pending', 'expired', 'suspended'],
    signature_pending: ['deposit_pending', 'admin_review', 'approved', 'suspended'],
    admin_review: ['changes_requested', 'approved', 'rejected', 'signature_pending', 'suspended'],
    changes_requested: ['account_created', 'documents_pending', 'quote_ready', 'contract_selected', 'deposit_pending', 'admin_review', 'expired', 'suspended'],
    approved: ['active', 'suspended'],
    active: ['suspended'],
    rejected: ['draft'],
    expired: ['draft'],
    suspended: ['admin_review', 'active', 'draft'],
  },
);

export const CANONICAL_STATE_MACHINES = Object.freeze({
  property: PROPERTY_STATE_MACHINE,
  ticket: TICKET_STATE_MACHINE,
  inspection: INSPECTION_STATE_MACHINE,
  payment: PAYMENT_STATE_MACHINE,
  quote: QUOTE_STATE_MACHINE,
  contract: CONTRACT_STATE_MACHINE,
  tenantLink: TENANT_LINK_STATE_MACHINE,
  brokerKyc: BROKER_KYC_STATE_MACHINE,
  technicianJob: TECHNICIAN_JOB_STATE_MACHINE,
  onboarding: ONBOARDING_STATE_MACHINE,
});

export type CanonicalStateMachineName = keyof typeof CANONICAL_STATE_MACHINES;

export function normalizeCanonicalState(machineName: CanonicalStateMachineName, raw: unknown): string {
  const definition = CANONICAL_STATE_MACHINES[machineName];
  const normalized = keyFor(machineName, raw);
  if (!normalized) return definition.states[0];
  const aliased = definition.aliases[normalized] || normalized;
  return definition.states.includes(aliased) ? aliased : definition.states[0];
}

export function isCanonicalState(machineName: CanonicalStateMachineName, raw: unknown): boolean {
  return CANONICAL_STATE_MACHINES[machineName].states.includes(keyFor(machineName, raw));
}

export function canTransitionCanonicalState(
  machineName: CanonicalStateMachineName,
  fromRaw: unknown,
  toRaw: unknown,
): boolean {
  const definition = CANONICAL_STATE_MACHINES[machineName];
  const from = normalizeCanonicalState(machineName, fromRaw);
  const to = normalizeCanonicalState(machineName, toRaw);
  if (from === to) return true;
  return (definition.transitions[from] || []).includes(to);
}

export function assertCanonicalTransition(
  machineName: CanonicalStateMachineName,
  fromRaw: unknown,
  toRaw: unknown,
): string {
  const from = normalizeCanonicalState(machineName, fromRaw);
  const to = normalizeCanonicalState(machineName, toRaw);
  if (!canTransitionCanonicalState(machineName, from, to)) {
    throw new Error(`Invalid ${machineName} transition: ${from} -> ${to}`);
  }
  return to;
}
