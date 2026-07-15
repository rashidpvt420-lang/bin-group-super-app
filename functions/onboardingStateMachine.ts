/**
 * Canonical property-owner onboarding lifecycle.
 * Clients may display these states; only Cloud Functions / Admin SDK may advance them.
 */

export const ONBOARDING_STATES = [
  'draft',
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
] as const;

export type OnboardingState = (typeof ONBOARDING_STATES)[number];

const LEGACY_STATUS_ALIASES: Record<string, OnboardingState> = {
  draft: 'draft',
  property_details_complete: 'property_details_complete',
  documents_pending: 'documents_pending',
  quote_ready: 'quote_ready',
  contract_selected: 'contract_selected',
  deposit_pending: 'deposit_pending',
  deposit_processing: 'deposit_processing',
  deposit_paid: 'deposit_paid',
  identity_pending: 'identity_pending',
  signature_pending: 'signature_pending',
  admin_review: 'admin_review',
  changes_requested: 'changes_requested',
  approved: 'approved',
  active: 'active',
  rejected: 'rejected',
  expired: 'expired',
  suspended: 'suspended',
  // Legacy / fragmented write paths → canonical
  pending: 'draft',
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
};

const PROGRESS_PERCENT: Record<OnboardingState, number> = {
  draft: 5,
  property_details_complete: 15,
  documents_pending: 25,
  quote_ready: 35,
  contract_selected: 45,
  deposit_pending: 55,
  deposit_processing: 60,
  deposit_paid: 70,
  identity_pending: 75,
  signature_pending: 80,
  admin_review: 85,
  changes_requested: 70,
  approved: 95,
  active: 100,
  rejected: 0,
  expired: 0,
  suspended: 0,
};

const NEXT_STEP: Record<OnboardingState, string> = {
  draft: 'Complete property details',
  property_details_complete: 'Upload ownership / title-deed documents',
  documents_pending: 'Finish document upload and wait for quote',
  quote_ready: 'Select a service package and contract',
  contract_selected: 'Submit the 15% mobilization deposit',
  deposit_pending: 'Pay the mobilization deposit',
  deposit_processing: 'Wait for payment confirmation',
  deposit_paid: 'Complete owner identity verification',
  identity_pending: 'Sign the generated contract (OTP)',
  signature_pending: 'Sign the contract with OTP verification',
  admin_review: 'Wait for BIN GROUP admin review',
  changes_requested: 'Address admin feedback and resubmit',
  approved: 'Wait for server activation of the owner dashboard',
  active: 'Owner dashboard unlocked',
  rejected: 'Contact support or resubmit a new onboarding package',
  expired: 'Restart onboarding with a fresh quote',
  suspended: 'Contact support to restore access',
};

const BLOCKERS: Record<OnboardingState, string> = {
  draft: 'Property details incomplete',
  property_details_complete: 'Ownership documents required',
  documents_pending: 'Documents still pending',
  quote_ready: 'Contract package not selected',
  contract_selected: 'Mobilization deposit unpaid',
  deposit_pending: 'Awaiting deposit payment',
  deposit_processing: 'Awaiting Stripe/admin payment confirmation',
  deposit_paid: 'Identity verification incomplete',
  identity_pending: 'Contract signature outstanding',
  signature_pending: 'Contract signature OTP outstanding',
  admin_review: 'BIN GROUP admin approval outstanding',
  changes_requested: 'Admin requested changes',
  approved: 'Final server activation outstanding',
  active: 'None',
  rejected: 'Onboarding rejected',
  expired: 'Onboarding expired',
  suspended: 'Account suspended',
};

const ALLOWED_TRANSITIONS: Record<OnboardingState, OnboardingState[]> = {
  draft: ['property_details_complete', 'expired', 'suspended'],
  property_details_complete: ['documents_pending', 'quote_ready', 'expired', 'suspended'],
  documents_pending: ['quote_ready', 'changes_requested', 'expired', 'suspended'],
  quote_ready: ['contract_selected', 'expired', 'suspended'],
  contract_selected: ['deposit_pending', 'expired', 'suspended'],
  deposit_pending: ['deposit_processing', 'expired', 'suspended'],
  deposit_processing: ['deposit_paid', 'deposit_pending', 'expired', 'suspended'],
  deposit_paid: ['identity_pending', 'signature_pending', 'admin_review', 'suspended'],
  identity_pending: ['signature_pending', 'admin_review', 'suspended'],
  signature_pending: ['admin_review', 'approved', 'suspended'],
  admin_review: ['changes_requested', 'approved', 'rejected', 'signature_pending', 'suspended'],
  changes_requested: ['documents_pending', 'quote_ready', 'contract_selected', 'deposit_pending', 'admin_review', 'expired', 'suspended'],
  approved: ['active', 'suspended'],
  active: ['suspended'],
  rejected: ['draft'],
  expired: ['draft'],
  suspended: ['admin_review', 'active', 'draft'],
};

export function normalizeOnboardingState(raw: unknown): OnboardingState {
  const key = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!key) return 'draft';
  return LEGACY_STATUS_ALIASES[key] || ((ONBOARDING_STATES as readonly string[]).includes(key) ? (key as OnboardingState) : 'draft');
}

export function canTransitionOnboarding(fromRaw: unknown, toRaw: unknown): boolean {
  const from = normalizeOnboardingState(fromRaw);
  const to = normalizeOnboardingState(toRaw);
  if (from === to) return true;
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

export function assertOnboardingTransition(fromRaw: unknown, toRaw: unknown): OnboardingState {
  const from = normalizeOnboardingState(fromRaw);
  const to = normalizeOnboardingState(toRaw);
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
  if (state === 'suspended' || state === 'rejected' || state === 'expired') return false;
  return (
    String(flags.status || '').trim().toLowerCase() === 'active' &&
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
    actionRequired: status !== 'active' && status !== 'admin_review' && status !== 'deposit_processing',
    supportReferenceId: input.supportReferenceId || null,
    adminReviewReason: input.adminReviewReason || null,
    updatedAt: input.updatedAt || null,
    unlocksDashboard: status === 'active',
  };
}
