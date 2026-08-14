const PILOT_NON_DEFERABLE_PROVIDER_GATES = new Set([
  'firebaseAuth',
  'firestoreRules',
  'storageRules',
  'appCheckEnforcement',
  'appCheckProduction',
]);

/**
 * Exact-commit workflow evidence may replace stale manual ledger entries for
 * these security/deployment gates during a controlled pilot. Public-launch
 * clearance intentionally does not call this helper.
 */
export function pilotExecutionSupersedesLedger({
  groupName,
  name,
  currentExecutionComplete,
  deploymentValid,
}) {
  if (groupName === 'deploymentProof') {
    return deploymentValid && (name === 'hosting' || name === 'functionsDeploy');
  }
  if (groupName !== 'requiredProviderGates') return false;
  if (name === 'firebaseAuth' || name === 'appCheckEnforcement' || name === 'appCheckProduction') {
    return currentExecutionComplete;
  }
  if (name === 'firestoreRules' || name === 'storageRules') {
    return currentExecutionComplete && deploymentValid;
  }
  return false;
}

/**
 * The repository policy explicitly allows provider/device work to remain
 * pending during the friends-only pilot. Deferral is available only after the
 * protected exact-SHA deployment and every required live suite are complete,
 * and never for the non-deferrable security gates above.
 */
export function pilotMayDeferManualLedger({
  groupName,
  name,
  currentExecutionComplete,
  deploymentValid,
}) {
  if (!currentExecutionComplete || !deploymentValid) return false;
  if (groupName === 'requiredDeviceGates') return true;
  return groupName === 'requiredProviderGates' && !PILOT_NON_DEFERABLE_PROVIDER_GATES.has(name);
}
