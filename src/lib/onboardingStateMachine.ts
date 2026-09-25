/**
 * Canonical property-owner onboarding lifecycle.
 *
 * Phase 12 contract:
 * - New writes use these exact uppercase states only.
 * - Legacy aliases are accepted only when reading existing records.
 * - Only server-authoritative code may advance operational state.
 */

export const ONBOARDING_STATES = [
  'DRAFT',
  'ACCOUNT_CREATED',
  'PROPERTY_DETAILS_COMPLETE',
  'DOCUMENTS_PENDING',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
  'INSPECTION_REQUIRED',
  'INSPECTION_IN_PROGRESS',
  'QUOTE_READY',
  'CONTRACT_SELECTED',
  'SIGNATURE_PENDING',
  'PAYMENT_PENDING',
  'PAYMENT_PROCESSING',
  'PAYMENT_CONFIRMED',
  'APPROVED',
  'ACTIVE',
  'REJECTED',
  'EXPIRED',
  'SUSPENDED',
] as const;

export type OnboardingState = (typeof ONBOARDING_STATES)[number];

const LEGACY_STATUS_ALIASES: Record<string, OnboardingState> = {
  DRAFT: 'DRAFT',
  ACCOUNT_CREATED: 'ACCOUNT_CREATED',
  AUTH_CREATED: 'ACCOUNT_CREATED',
  OWNER_ACCOUNT_CREATED: 'ACCOUNT_CREATED',
  PROPERTY_DETAILS_COMPLETE: 'PROPERTY_DETAILS_COMPLETE',
  DOCUMENTS_PENDING: 'DOCUMENTS_PENDING',
  UNDER_REVIEW: 'UNDER_REVIEW',
  ADMIN_REVIEW: 'UNDER_REVIEW',
  PENDING_ADMIN_REVIEW: 'UNDER_REVIEW',
  PENDING_ADMIN_APPROVAL: 'UNDER_REVIEW',
  PAYMENT_VERIFIED_PENDING_ADMIN_APPROVAL: 'UNDER_REVIEW',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  PENDING_PROPERTY_INSPECTION: 'INSPECTION_REQUIRED',
  SUBMITTED_FOR_PROPERTY_INSPECTION: 'INSPECTION_REQUIRED',
  AWAITING_SITE_INSPECTION: 'INSPECTION_REQUIRED',
  READY_FOR_SITE_VISIT: 'INSPECTION_REQUIRED',
  READY_FOR_SITE_VISITS: 'INSPECTION_REQUIRED',
  INSPECTION_IN_PROGRESS: 'INSPECTION_IN_PROGRESS',
  INSPECTION_COMPLETED: 'QUOTE_READY',
  QUOTE_READY: 'QUOTE_READY',
  CONTRACT_SELECTED: 'CONTRACT_SELECTED',
  IDENTITY_PENDING: 'SIGNATURE_PENDING',
  SIGNATURE_PENDING: 'SIGNATURE_PENDING',
  AWAITING_SIGNATURE: 'SIGNATURE_PENDING',
  APPROVED_AWAITING_OWNER_SIGNATURE: 'SIGNATURE_PENDING',
  APPROVED_PENDING_OWNER_SIGNATURE: 'SIGNATURE_PENDING',
  DEPOSIT_PENDING: 'PAYMENT_PENDING',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  AWAITING_PAYMENT: 'PAYMENT_PENDING',
  AWAITING_15_PERCENT_PAYMENT: 'PAYMENT_PENDING',
  AWAITING_ACTIVATION_PAYMENT: 'PAYMENT_PENDING',
  DEPOSIT_PROCESSING: 'PAYMENT_PROCESSING',
  PAYMENT_PENDING_APPROVAL: 'PAYMENT_PROCESSING',
  PENDING_ADMIN_PAYMENT_VERIFICATION: 'PAYMENT_PROCESSING',
  PENDING_PAYMENT_VERIFICATION: 'PAYMENT_PROCESSING',
  PAYMENT_SUBMITTED: 'PAYMENT_PROCESSING',
  PAYMENT_PROCESSING: 'PAYMENT_PROCESSING',
  DEPOSIT_PAID: 'PAYMENT_CONFIRMED',
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
  PAID: 'PAYMENT_CONFIRMED',
  PAYMENT_VERIFIED: 'PAYMENT_CONFIRMED',
  APPROVED: 'APPROVED',
  READY_FOR_ACTIVATION: 'APPROVED',
  APPROVED_AWAITING_ACTIVATION: 'APPROVED',
  ACTIVE: 'ACTIVE',
  ACTIVATED: 'ACTIVE',
  LIVE: 'ACTIVE',
  REJECTED: 'REJECTED',
  DENIED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'EXPIRED',
  CANCELED: 'EXPIRED',
  SUSPENDED: 'SUSPENDED',
  PENDING: 'DRAFT',
};

const PROGRESS_PERCENT: Record<OnboardingState, number> = {
  DRAFT: 5,
  ACCOUNT_CREATED: 10,
  PROPERTY_DETAILS_COMPLETE: 20,
  DOCUMENTS_PENDING: 30,
  UNDER_REVIEW: 38,
  CHANGES_REQUESTED: 30,
  INSPECTION_REQUIRED: 45,
  INSPECTION_IN_PROGRESS: 55,
  QUOTE_READY: 65,
  CONTRACT_SELECTED: 72,
  SIGNATURE_PENDING: 78,
  PAYMENT_PENDING: 84,
  PAYMENT_PROCESSING: 88,
  PAYMENT_CONFIRMED: 92,
  APPROVED: 97,
  ACTIVE: 100,
  REJECTED: 0,
  EXPIRED: 0,
  SUSPENDED: 0,
};

const NEXT_STEP: Record<OnboardingState, string> = {
  DRAFT: 'Create and verify the owner account',
  ACCOUNT_CREATED: 'Complete property details',
  PROPERTY_DETAILS_COMPLETE: 'Upload ownership documents',
  DOCUMENTS_PENDING: 'Complete documents and submit for review',
  UNDER_REVIEW: 'Wait for BIN GROUP review',
  CHANGES_REQUESTED: 'Address Admin feedback and resubmit',
  INSPECTION_REQUIRED: 'Complete the authoritative physical inspection',
  INSPECTION_IN_PROGRESS: 'Complete inspection evidence',
  QUOTE_READY: 'Review the final server-authoritative quote',
  CONTRACT_SELECTED: 'Complete contract signature',
  SIGNATURE_PENDING: 'Sign the contract with OTP verification',
  PAYMENT_PENDING: 'Submit the locked 15% Cash/Cheque payment evidence',
  PAYMENT_PROCESSING: 'Wait for Admin payment verification',
  PAYMENT_CONFIRMED: 'Wait for final activation approval',
  APPROVED: 'Wait for server activation',
  ACTIVE: 'Owner dashboard unlocked',
  REJECTED: 'Contact support or restart onboarding',
  EXPIRED: 'Restart onboarding with fresh evidence',
  SUSPENDED: 'Contact support to restore access',
};

const BLOCKERS: Record<OnboardingState, string> = {
  DRAFT: 'Verified owner account required',
  ACCOUNT_CREATED: 'Property details incomplete',
  PROPERTY_DETAILS_COMPLETE: 'Ownership documents required',
  DOCUMENTS_PENDING: 'Documents incomplete or not submitted',
  UNDER_REVIEW: 'BIN GROUP review outstanding',
  CHANGES_REQUESTED: 'Admin requested changes',
  INSPECTION_REQUIRED: 'Physical inspection required',
  INSPECTION_IN_PROGRESS: 'Physical inspection evidence incomplete',
  QUOTE_READY: 'Final quote not accepted',
  CONTRACT_SELECTED: 'Owner signature outstanding',
  SIGNATURE_PENDING: 'Contract signature OTP outstanding',
  PAYMENT_PENDING: '15% mobilisation evidence outstanding',
  PAYMENT_PROCESSING: 'Admin payment verification outstanding',
  PAYMENT_CONFIRMED: 'Final activation approval outstanding',
  APPROVED: 'Server activation outstanding',
  ACTIVE: 'None',
  REJECTED: 'Onboarding rejected',
  EXPIRED: 'Onboarding expired',
  SUSPENDED: 'Account suspended',
};

const ALLOWED_TRANSITIONS: Record<OnboardingState, OnboardingState[]> = {
  DRAFT: ['ACCOUNT_CREATED', 'EXPIRED', 'SUSPENDED'],
  ACCOUNT_CREATED: ['PROPERTY_DETAILS_COMPLETE', 'DOCUMENTS_PENDING', 'EXPIRED', 'SUSPENDED'],
  PROPERTY_DETAILS_COMPLETE: ['DOCUMENTS_PENDING', 'UNDER_REVIEW', 'EXPIRED', 'SUSPENDED'],
  DOCUMENTS_PENDING: ['UNDER_REVIEW', 'CHANGES_REQUESTED', 'EXPIRED', 'SUSPENDED'],
  UNDER_REVIEW: ['CHANGES_REQUESTED', 'INSPECTION_REQUIRED', 'QUOTE_READY', 'REJECTED', 'SUSPENDED'],
  CHANGES_REQUESTED: ['UNDER_REVIEW', 'DOCUMENTS_PENDING', 'EXPIRED', 'SUSPENDED'],
  INSPECTION_REQUIRED: ['INSPECTION_IN_PROGRESS', 'CHANGES_REQUESTED', 'REJECTED', 'SUSPENDED'],
  INSPECTION_IN_PROGRESS: ['QUOTE_READY', 'CHANGES_REQUESTED', 'REJECTED', 'SUSPENDED'],
  QUOTE_READY: ['CONTRACT_SELECTED', 'CHANGES_REQUESTED', 'REJECTED', 'EXPIRED'],
  CONTRACT_SELECTED: ['SIGNATURE_PENDING', 'EXPIRED', 'SUSPENDED'],
  SIGNATURE_PENDING: ['PAYMENT_PENDING', 'APPROVED', 'EXPIRED', 'SUSPENDED'],
  PAYMENT_PENDING: ['PAYMENT_PROCESSING', 'EXPIRED', 'SUSPENDED'],
  PAYMENT_PROCESSING: ['PAYMENT_CONFIRMED', 'PAYMENT_PENDING', 'CHANGES_REQUESTED', 'SUSPENDED'],
  PAYMENT_CONFIRMED: ['APPROVED', 'SUSPENDED'],
  APPROVED: ['ACTIVE', 'SUSPENDED'],
  ACTIVE: ['SUSPENDED'],
  REJECTED: ['DRAFT'],
  EXPIRED: ['DRAFT'],
  SUSPENDED: ['UNDER_REVIEW', 'ACTIVE', 'DRAFT'],
};

function token(raw: unknown): string {
  return String(raw ?? '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

export function isCanonicalOnboardingState(raw: unknown): raw is OnboardingState {
  return (ONBOARDING_STATES as readonly string[]).includes(token(raw));
}

export function normalizeOnboardingState(raw: unknown): OnboardingState {
  const key = token(raw);
  if (!key) return 'DRAFT';
  if ((ONBOARDING_STATES as readonly string[]).includes(key)) return key as OnboardingState;
  return LEGACY_STATUS_ALIASES[key] || 'DRAFT';
}

export function assertCanonicalOnboardingState(raw: unknown): OnboardingState {
  const state = token(raw);
  if (!(ONBOARDING_STATES as readonly string[]).includes(state)) {
    throw new Error(`Non-canonical onboarding state write rejected: ${state || '(empty)'}`);
  }
  return state as OnboardingState;
}

export function canTransitionOnboarding(fromRaw: unknown, toRaw: unknown): boolean {
  const from = normalizeOnboardingState(fromRaw);
  const to = normalizeOnboardingState(toRaw);
  if (from === to) return true;
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

export function assertOnboardingTransition(fromRaw: unknown, toRaw: unknown): OnboardingState {
  const from = normalizeOnboardingState(fromRaw);
  const to = assertCanonicalOnboardingState(toRaw);
  if (!canTransitionOnboarding(from, to)) {
    throw new Error(`Invalid onboarding transition: ${from} -> ${to}`);
  }
  return to;
}

export function onboardingProgressPercent(raw: unknown): number {
  return PROGRESS_PERCENT[normalizeOnboardingState(raw)] ?? 0;
}

export function onboardingNextStep(raw: unknown): string {
  return NEXT_STEP[normalizeOnboardingState(raw)];
}

export function onboardingCurrentBlocker(raw: unknown): string {
  return BLOCKERS[normalizeOnboardingState(raw)];
}

export function isOwnerDashboardUnlockEligible(flags: {
  status?: unknown;
  paymentVerified?: boolean;
  adminApproved?: boolean;
  dashboardUnlocked?: boolean;
  dashboardLocked?: boolean;
  activeContractId?: string | null;
  onboardingStatus?: unknown;
}): boolean {
  const state = normalizeOnboardingState(flags.onboardingStatus);
  if (['SUSPENDED', 'REJECTED', 'EXPIRED'].includes(state)) return false;
  return (
    String(flags.status || '').trim().toUpperCase() === 'ACTIVE' &&
    flags.paymentVerified === true &&
    flags.adminApproved === true &&
    flags.dashboardUnlocked === true &&
    flags.dashboardLocked !== true &&
    Boolean(String(flags.activeContractId || '').trim())
  );
}

export function buildOnboardingRecoverySnapshot(input: {
  status: unknown;
  supportReferenceId?: string;
  lastCompletedStep?: string;
  adminReviewReason?: string;
  updatedAt?: unknown;
}) {
  const status = normalizeOnboardingState(input.status);
  return {
    status,
    progressPercent: onboardingProgressPercent(status),
    currentBlocker: onboardingCurrentBlocker(status),
    nextRequiredStep: onboardingNextStep(status),
    lastCompletedStep: input.lastCompletedStep || null,
    actionRequired: !['ACTIVE', 'UNDER_REVIEW', 'PAYMENT_PROCESSING'].includes(status),
    supportReferenceId: input.supportReferenceId || null,
    adminReviewReason: input.adminReviewReason || null,
    updatedAt: input.updatedAt || null,
    unlocksDashboard: status === 'ACTIVE',
  };
}
