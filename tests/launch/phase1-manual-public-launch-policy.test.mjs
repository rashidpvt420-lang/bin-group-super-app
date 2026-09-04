import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');

test('production workflow keeps legacy Phase 2 dispatch fields fail-closed while Phase 1 remains the decision authority', () => {
  const workflow = read('.github/workflows/firebase-production-deploy.yml');
  const decision = read('scripts/hard-launch-decision-gate.mjs');
  assert.ok(workflow.includes('payment_policy:'));
  assert.ok(workflow.includes('phase1-manual'));
  assert.ok(workflow.includes('phase2-stripe'));
  assert.ok(workflow.includes('Verify Phase 1 manual Cash/Cheque production policy'));
  assert.ok(workflow.includes("inputs.payment_policy == 'phase1-manual'"));
  assert.ok(workflow.includes('phase1-manual-payment-proof.json'));
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

test('postdeploy and signed final decision bind public clearance to Phase 1 Cash/Cheque proof', () => {
  const postdeploy = read('scripts/postdeploy-release-gate.mjs');
  const decision = read('scripts/hard-launch-decision-gate.mjs');
  assert.ok(postdeploy.includes('PAYMENT_POLICY'));
  assert.ok(postdeploy.includes('phase1-manual-payment-proof.json'));
  assert.ok(decision.includes('phase1ManualPaymentProof'));
  assert.ok(decision.includes('paymentProofOk'));
  assert.ok(decision.includes('paymentPolicy: PHASE1_PAYMENT_POLICY'));
  assert.ok(decision.includes("paymentPolicy !== PHASE1_PAYMENT_POLICY"));
  assert.ok(!decision.includes('stripe-live-proof.json'));
  assert.ok(!decision.includes('postdeployCleared && stripeLiveOk'));
});