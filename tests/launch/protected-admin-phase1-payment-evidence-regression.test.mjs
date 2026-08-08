import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { patchAdminBusinessEvidence } from '../../scripts/apply-five-role-business-evidence-fixes.mjs';

const read = (file) => readFileSync(file, 'utf8');

test('protected Admin replay replaces retired Stripe activation fixture with immutable Phase 1 CASH evidence', () => {
  const source = read('tests/e2e/business-admin.spec.ts');
  const patched = patchAdminBusinessEvidence(source);

  for (const required of [
    "db.collection('system_payment_config').doc('current').get()",
    "phase1ApprovedMethods.includes('CASH')",
    "paymentMethod: 'CASH'",
    "paymentStatus: 'PENDING_ADMIN_APPROVAL'",
    'paymentConfigVersion: phase1PaymentConfiguration.version',
    'paymentConfigHash: phase1PaymentConfigHash',
    'paymentProofPath: phase1ReceiptPath',
    'paymentProofHash: phase1ReceiptHash',
    'paymentProofGeneration: phase1ReceiptGeneration',
    "evidenceType: 'owner_payment_receipt'",
    "createHash('sha256').update(JSON.stringify(phase1PaymentConfiguration)).digest('hex')",
    "-cash-receipt.pdf').delete({ ignoreNotFound: true })",
  ]) {
    assert.ok(patched.includes(required), `missing protected Phase 1 Admin evidence control: ${required}`);
  }

  assert.ok(!patched.includes('stripeSessionId: `cs_e2e_${RUN_ID}`'), 'retired Stripe activation fixture must not survive protected replay');
  assert.equal(patchAdminBusinessEvidence(patched), patched, 'protected replay patch must be idempotent');
});

test('protected Admin evidence repair does not relax the production Cash/Cheque authority', () => {
  const ownerOnboarding = read('functions/inspectionFirstOwnerOnboarding.ts');
  const phase1Config = read('scripts/ensure-phase1-manual-payment-config.mjs');
  const paymentApproval = read('functions/securePaymentApproval.ts');

  assert.ok(ownerOnboarding.includes('if (!["CASH", "CHEQUE"].includes(method))'));
  assert.ok(phase1Config.includes("const EXPECTED_METHODS = ['CASH', 'CHEQUE']"));
  assert.ok(paymentApproval.includes('MANUAL_PAYMENT_METHODS = new Set(["BANK_TRANSFER", "CHEQUE", "CASH"])'));
  assert.ok(paymentApproval.includes('submittedVersion !== activeConfiguration.version'));
  assert.ok(paymentApproval.includes('submittedHash !== activeConfiguration.configHash'));
});
