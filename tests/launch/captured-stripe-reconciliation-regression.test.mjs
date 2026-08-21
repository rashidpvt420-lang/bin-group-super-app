import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('historical Stripe reconciliation requires the successful server webhook evidence shape', async () => {
  const [approval, webhook] = await Promise.all([
    read('functions/paymentTransactionApproval.ts'),
    read('functions/stripePayment.ts'),
  ]);

  for (const evidence of [
    /paymentMethod:\s*"STRIPE"/,
    /gateway:\s*"STRIPE"/,
    /status:\s*"PENDING_ADMIN_APPROVAL"/,
    /paymentStatus:\s*"PAID"/,
    /verificationState:\s*"AUTO_VERIFIED"/,
    /verified:\s*true/,
    /paymentVerified:\s*true/,
    /adminApprovalRequired:\s*true/,
    /unlocksDashboard:\s*false/,
    /activationState:\s*"PAYMENT_VERIFIED_PENDING_ADMIN_APPROVAL"/,
    /stripeSessionId:\s*session\.id/,
    /stripePaymentIntentId:\s*String\(session\.payment_intent \|\| ""\)/,
  ]) {
    assert.match(webhook, evidence);
  }

  assert.match(approval, /isCapturedStripeReconciliationPayment/);
  assert.match(approval, /upper\(payment\.gateway\) === "STRIPE"/);
  assert.match(approval, /upper\(payment\.currency\) === "AED"/);
  assert.match(approval, /upper\(payment\.status\) === "PENDING_ADMIN_APPROVAL"/);
  assert.match(approval, /upper\(payment\.paymentStatus\) === "PAID"/);
  assert.match(approval, /upper\(payment\.verificationState\) === "AUTO_VERIFIED"/);
  assert.match(approval, /payment\.verified === true/);
  assert.match(approval, /payment\.paymentVerified === true/);
  assert.match(approval, /payment\.adminApprovalRequired === true/);
  assert.match(approval, /payment\.unlocksDashboard === false/);
  assert.match(approval, /Boolean\(stripeSessionId\)/);
  assert.match(approval, /Boolean\(stripePaymentIntentId\)/);
  assert.match(approval, /stripeSessionId !== invalidatedSessionId/);
  assert.match(approval, /stripePaymentIntentId !== invalidatedPaymentIntentId/);
  assert.match(approval, /storedAmount === expectedAmount/);
  assert.match(approval, /amountReceived === expectedAmount/);
  assert.match(approval, /payment\.ownerUid \|\| payment\.ownerId/);
  assert.match(approval, /payment\.contractId/);
  assert.match(approval, /payment\.intakeId/);
  assert.match(approval, /payment\.quoteHash/);
});

test('current payment policy is bypassed only for a captured Stripe reconciliation record', async () => {
  const approval = await read('functions/paymentTransactionApproval.ts');
  const stripeEvidenceIndex = approval.indexOf('const freshStripeVerified = isCapturedStripeReconciliationPayment');
  const policyGuardIndex = approval.indexOf('if (!freshStripeVerified) {', stripeEvidenceIndex);
  const configVersionIndex = approval.indexOf('const freshConfigVersion', policyGuardIndex);
  const approvedMethodsIndex = approval.indexOf('transactionalConfiguration.approvedMethods.includes(freshMethod)', configVersionIndex);

  assert.ok(stripeEvidenceIndex >= 0, 'captured Stripe evidence must be resolved in the transaction');
  assert.ok(policyGuardIndex > stripeEvidenceIndex, 'policy exception must depend on verified captured Stripe evidence');
  assert.ok(configVersionIndex > policyGuardIndex, 'manual policy binding must be inside the non-Stripe guard');
  assert.ok(approvedMethodsIndex > configVersionIndex, 'approved-method validation must remain for manual payments');
  assert.match(approval, /!\["CHEQUE", "CASH"\]\.includes\(freshMethod\)/);
});

test('fake or incomplete Stripe records fail the approval evidence predicates', async () => {
  const approval = await read('functions/paymentTransactionApproval.ts');
  assert.match(approval, /Boolean\(payment\.submittedAt\)/);
  assert.match(approval, /Boolean\(payment\.verifiedAt\)/);
  assert.match(approval, /Boolean\(stripePaymentIntentId\)/);
  assert.match(approval, /upper\(payment\.activationState\) === "PAYMENT_VERIFIED_PENDING_ADMIN_APPROVAL"/);
  assert.doesNotMatch(approval, /const stripeVerified = normalizedMethod === "STRIPE" &&\s*upper\(payment\.paymentStatus\) === "PAID" &&\s*payment\.verified === true &&\s*Boolean\(payment\.stripeSessionId\)/s);
});

test('new Phase-1 activation remains CASH/CHEQUE only and cannot submit Stripe/Card/Bank Transfer', async () => {
  const [policy, configScript, page] = await Promise.all([
    read('functions/ownerActivationPaymentPolicy.ts'),
    read('scripts/ensure-phase1-manual-payment-config.mjs'),
    read('src/owner/pages/OwnerActivationPage.tsx'),
  ]);

  assert.match(policy, /PHASE1_OWNER_ACTIVATION_METHODS = new Set<OwnerActivationPaymentMethod>\(\["CASH", "CHEQUE"\]\)/);
  assert.match(configScript, /const EXPECTED_METHODS = \['CASH', 'CHEQUE'\]/);
  assert.match(configScript, /bankTransferEnabled: false/);
  assert.match(configScript, /stripeEnabled: false/);
  assert.doesNotMatch(page, /method:\s*'BANK_TRANSFER'/);
  assert.doesNotMatch(page, /method:\s*'STRIPE'/);
  assert.doesNotMatch(page, /method:\s*'CARD'/);
});

test('protected Admin approval still requires App Check, Finance Admin authority and MFA', async () => {
  const secureApproval = await read('functions/securePaymentApproval.ts');
  assert.match(secureApproval, /adminApprovePayment = onCall/);
  assert.match(secureApproval, /enforceAppCheck:\s*true/);
  assert.match(secureApproval, /requireMfaFinanceAdmin/);
  assert.match(secureApproval, /sign_in_second_factor/);
  assert.match(secureApproval, /A verified Admin MFA session is required/);
});

test('approval retains exact-once/idempotent activation semantics', async () => {
  const approval = await read('functions/paymentTransactionApproval.ts');
  assert.match(approval, /const alreadyApproved = roleOf\(payment\.status\) === "approved"/);
  assert.match(approval, /approvalWasIdempotent = true/);
  assert.match(approval, /idempotent: approvalWasIdempotent/);
  assert.match(approval, /status:\s*"ACTIVE"/);
  assert.match(approval, /dashboardUnlocked:\s*true/);
});
