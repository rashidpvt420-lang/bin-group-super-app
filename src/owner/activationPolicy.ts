const normalized = (value: unknown) => String(value || '').trim().toLowerCase();

export const OWNER_PRE_ACTIVATION_PATHS = new Set([
  '/owner/activation',
  '/owner/onboarding-status',
  '/owner/contracts',
  '/owner/documents',
]);

export const OWNER_LOCKED_STATUSES = new Set([
  'pending',
  'pending_approval',
  'pending_admin_approval',
  'pending_owner_signature',
  'ready_for_activation',
  'payment_pending',
  'payment_pending_approval',
  'payment_pending_admin_verification',
  'payment_verified_pending_admin_approval',
  'awaiting_verification',
  'awaiting_approval',
  'admin_review',
  'changes_requested',
  'rejected',
  'expired',
  'onboarding',
  'profile_incomplete',
  'suspended',
]);

export function isOwnerPreActivationPath(pathname: string) {
  return OWNER_PRE_ACTIVATION_PATHS.has(pathname);
}

export function isOwnerProfileActivated(profile: any) {
  if (!profile) return false;
  return normalized(profile.status) === 'active' &&
    profile.adminApproved === true &&
    profile.paymentVerified === true &&
    profile.dashboardUnlocked === true &&
    profile.dashboardLocked !== true &&
    Boolean(String(profile.activeContractId || '').trim());
}

export function isOwnerContractActivated(contract: any) {
  if (!contract) return false;
  const status = normalized(contract.status || contract.contractStatus);
  const activationStatus = normalized(contract.activationStatus);
  return contract.ownerSigned === true &&
    contract.adminApproved === true &&
    contract.paymentVerified === true &&
    (contract.dashboardUnlockApproved === true || contract.dashboardUnlocked === true) &&
    (status === 'active' || activationStatus === 'active') &&
    Boolean(String(contract.ownerUid || contract.ownerId || '').trim());
}
