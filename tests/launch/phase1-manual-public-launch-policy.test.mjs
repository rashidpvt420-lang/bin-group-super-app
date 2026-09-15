import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DECISION_KIND,
  HARD_LAUNCH_CONTROL_SCHEMA,
  signDocument,
  validateHardLaunchDecisionDocument,
} from '../../scripts/lib/hard-launch-control.mjs';

const read = (file) => readFileSync(file, 'utf8');

test('production workflow exposes only the current Phase 1 Cash/Cheque payment policy', () => {
  const workflow = read('.github/workflows/firebase-production-deploy.yml');
  const decision = read('scripts/hard-launch-decision-gate.mjs');
  assert.ok(workflow.includes('payment_policy:'));
  assert.ok(workflow.includes('phase1-manual'));
  assert.ok(workflow.includes('Verify Phase 1 manual Cash/Cheque production policy'));
  assert.ok(workflow.includes("inputs.payment_policy == 'phase1-manual'"));
  assert.ok(workflow.includes('phase1-manual-payment-proof.json'));
  assert.ok(!workflow.includes('phase2-stripe'));
  assert.ok(!workflow.includes('Verify recent live Stripe payment and processed webhook'));
  assert.ok(!workflow.includes('verify-stripe-live-proof.mjs'));
  assert.ok(!workflow.includes('launch_package/stripe-live-proof.json'));
  assert.ok(decision.includes("const PHASE1_PAYMENT_POLICY = 'phase1-manual'"));
  assert.ok(decision.includes('PAYMENT_POLICY must equal phase1-manual while PHASE1_CASH_CHEQUE_V1 is active'));
  assert.ok(!decision.includes('stripeLiveProof'));
});

test('Phase 1 verifier proves exact production Cash and Cheque policy without leaking banking data', () => {
  const source = read('scripts/verify-phase1-manual-payment-proof.mjs');
  assert.ok(source.includes("const EXPECTED_METHODS = ['CASH', 'CHEQUE'];"));
  assert.ok(source.includes("source: 'firebase-production-manual-payment-policy-verifier'"));
  assert.ok(source.includes('sensitiveValuesExcluded: true'));
  assert.ok(source.includes('bankTransferEnabled: false'));
  assert.ok(source.includes('stripeEnabled: false'));
  const proofStart = source.indexOf('const proof = {');
  const proofEnd = source.indexOf('\n};', proofStart);
  assert.ok(proofStart >= 0 && proofEnd > proofStart, 'proof object must be present');
  const proofBlock = source.slice(proofStart, proofEnd);
  assert.ok(!proofBlock.includes('accountNumber'), 'proof must exclude account number');
  assert.ok(!proofBlock.includes('iban'), 'proof must exclude IBAN');
  assert.ok(!proofBlock.includes('swiftBic'), 'proof must exclude SWIFT/BIC');
});

test('predeploy, postdeploy and signed final decision all bind to Phase 1 Cash/Cheque proof', () => {
  const predeploy = read('scripts/predeploy-approval-gate.mjs');
  const postdeploy = read('scripts/postdeploy-release-gate.mjs');
  const workflowEnv = read('scripts/verify-production-workflow-env.mjs');
  const decision = read('scripts/hard-launch-decision-gate.mjs');

  assert.ok(predeploy.includes("const PHASE1_PAYMENT_POLICY = 'phase1-manual'"));
  assert.ok(predeploy.includes('PAYMENT_POLICY must equal phase1-manual while PHASE1_CASH_CHEQUE_V1 is active'));
  assert.ok(workflowEnv.includes("const PHASE1_PAYMENT_POLICY = 'phase1-manual'"));
  assert.ok(workflowEnv.includes('PAYMENT_POLICY must equal phase1-manual while PHASE1_CASH_CHEQUE_V1 is active'));
  assert.ok(postdeploy.includes("const PHASE1_PAYMENT_POLICY = 'phase1-manual'"));
  assert.ok(postdeploy.includes('phase1-manual-payment-proof.json'));
  assert.ok(!postdeploy.includes('phase2-stripe'));
  assert.ok(!postdeploy.includes('stripe-live-proof.json'));
  assert.ok(!postdeploy.includes('stripe-api-live-verifier'));
  assert.ok(decision.includes('phase1ManualPaymentProof'));
  assert.ok(decision.includes('paymentProofOk'));
  assert.ok(decision.includes('paymentPolicy: PHASE1_PAYMENT_POLICY'));
  assert.ok(decision.includes("paymentPolicy !== PHASE1_PAYMENT_POLICY"));
  assert.ok(!decision.includes('stripe-live-proof.json'));
  assert.ok(!decision.includes('postdeployCleared && stripeLiveOk'));
});

test('final decision validation requires the signed Phase 1 proof instead of retired Stripe evidence', () => {
  const now = Date.parse('2026-09-15T12:00:00.000Z');
  const hmacKey = 'phase1-final-decision-test-key-1234567890';
  const hash = 'a'.repeat(64);
  const payload = {
    schemaVersion: HARD_LAUNCH_CONTROL_SCHEMA,
    kind: DECISION_KIND,
    status: 'approved',
    hardLaunchClaim: true,
    launchMode: 'public',
    paymentPolicy: 'phase1-manual',
    commitSha: 'b'.repeat(40),
    repository: 'rashidpvt420-lang/bin-group-super-app',
    approvedAt: new Date(now).toISOString(),
    evidenceHashes: {
      authorization: hash,
      incidents: hash,
      deployment: hash,
      liveEvidence: hash,
      publicReleaseStatus: hash,
      phase1ManualPaymentProof: hash,
      pilotIncidentReport: hash,
    },
  };
  const decision = signDocument(payload, hmacKey);

  assert.deepEqual(validateHardLaunchDecisionDocument(decision, {
    now,
    commitSha: payload.commitSha,
    repository: payload.repository,
    hmacKey,
    expectedHashes: payload.evidenceHashes,
  }), []);

  const retiredStripeDecision = signDocument({
    ...payload,
    evidenceHashes: {
      ...payload.evidenceHashes,
      phase1ManualPaymentProof: undefined,
      stripeLiveProof: hash,
    },
  }, hmacKey);
  assert.ok(
    validateHardLaunchDecisionDocument(retiredStripeDecision, { now, hmacKey })
      .includes('decision evidence hash is missing or invalid: phase1ManualPaymentProof'),
  );
});
