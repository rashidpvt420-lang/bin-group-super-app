#!/usr/bin/env node
/**
 * Retired compatibility contract for the completed Phase 1 payment-policy migration.
 *
 * The production workflow has already been promoted and is the source of truth. This
 * module intentionally performs no repository mutation. It remains temporarily so
 * launch-coherence tests can verify the payment-policy decision contract without
 * restoring the obsolete one-shot workflow generator.
 */

export function evaluatePhase1PaymentPolicy({
  launchMode,
  paymentPolicy,
  postdeployCleared,
  phase1ManualPaymentProof,
  stripeLiveProof,
}) {
  const paymentProofOk = paymentPolicy === 'phase1-manual'
    ? phase1ManualPaymentProof?.status === 'passed'
    : paymentPolicy === 'phase2-stripe' && stripeLiveProof?.status === 'passed';

  return {
    paymentProofOk,
    hardLaunchEligible: launchMode === 'public' && postdeployCleared && paymentProofOk,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.error(
    '[phase1-policy] RETIRED — the validated production workflow is already promoted; no source mutation was performed.',
  );
  process.exit(1);
}
