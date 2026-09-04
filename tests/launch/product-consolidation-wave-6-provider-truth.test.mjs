import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

const providerTruth = read('packages/shared/src/config/providerLaunchTruth.ts');
const runtime = read('functions/runtime.ts');
const stripeHold = read('functions/stripePaymentPhase1Hold.ts');
const stripeHistorical = read('functions/stripePayment.ts');
const paymentConfig = read('functions/paymentConfiguration.ts');
const adminLaunch = read('apps/admin-panel/src/pages/admin/PublicLaunchCommandCenterPageV2.tsx');
const adminTerminal = read('src/admin/AdminTerminal.tsx');
const envWriter = read('scripts/write-production-env.mjs');
const launchLedger = JSON.parse(read('launch_package/launch-proof-gates.json'));
const bridge = read('scripts/record-firestore-evidence.js');
const manifestBuilder = read('scripts/build-command-center-evidence-manifest.mjs');

test('Wave 6 has one canonical Phase 1 Cash/Cheque policy', () => {
  assert.match(providerTruth, /approvedMethods: Object\.freeze\(\['CASH', 'CHEQUE'\]/);
  assert.match(providerTruth, /bankTransferEnabled: false/);
  assert.match(providerTruth, /stripeEnabled: false/);
  assert.match(paymentConfig, /PHASE1_METHODS = \["CASH", "CHEQUE"\]/);
  assert.match(paymentConfig, /Phase 1 owner onboarding must enable exactly Cash and Cheque/);
  assert.deepEqual(launchLedger.phase1PaymentPolicy.approvedMethods, ['CASH', 'CHEQUE']);
  assert.equal(launchLedger.phase1PaymentPolicy.bankTransferEnabled, false);
  assert.equal(launchLedger.phase1PaymentPolicy.stripeEnabled, false);
});

test('Stripe is a fail-closed compatibility surface, not a deployed live provider', () => {
  assert.doesNotMatch(runtime, /export \* from ["']\.\/stripePayment["']/);
  assert.match(runtime, /export \* from ["']\.\/stripePaymentPhase1Hold["']/);
  assert.match(stripeHold, /createStripeCheckoutSession/);
  assert.match(stripeHold, /stripeWebhook/);
  assert.match(stripeHold, /Cash and Cheque only/);
  assert.doesNotMatch(stripeHold, /STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/);

  // Future migration source remains hardened but unreachable from Phase 1 runtime.
  assert.match(stripeHistorical, /defineSecret\("STRIPE_SECRET_KEY"\)/);
  assert.match(stripeHistorical, /defineSecret\("STRIPE_WEBHOOK_SECRET"\)/);
  assert.match(stripeHistorical, /webhooks\.constructEvent/);
});

test('Wave 6 retains the protected Cash/Cheque design implementation and its executable regressions', () => {
  assert.match(runtime, /export \* from ["']\.\/paymentEvidence["']/);
  const exports = read('functions/paymentEvidence.ts');
  const handlers = read('functions/designPayments.ts');
  for (const name of ['getDesignPaymentInstructions', 'createDesignPaymentRequest', 'submitDesignOwnerDecision', 'adminReviewDesignPayment', 'adminHandoffDesignRequest']) {
    assert.ok(exports.includes(name), `${name} must remain reachable from runtime`);
    assert.ok(handlers.includes(`export const ${name} = onCall`));
  }
  assert.match(handlers, /enforceAppCheck: true/);
  assert.match(handlers, /design_receipt_registry/);
  assert.match(read('functions/designPaymentPolicy.ts'), /DESIGN_CASH_CHEQUE_V1/);
  assert.doesNotMatch(read('src/pages/DesignRequestDetailPage.tsx'), /createStripeCheckoutSession|writeBatch|updateDoc/);
  assert.match(read('apps/admin-panel/src/pages/admin/DesignStudioAdminPage.tsx'), /<DesignHandoffQueue/);
  assert.match(read('tests/launch/launch-workflow-remediation.test.mjs'), /receipt-backed approval and engineer handoff/);
});

test('evidence coverage is exact-SHA, PASSED-only and evidence-layer qualified without authorizing launch', () => {
  assert.match(providerTruth, /status \|\| ''\)\.trim\(\)\.toLowerCase\(\) !== 'passed'/);
  assert.match(providerTruth, /evidence\.releaseSha \|\| evidence\.commitSha/);
  assert.match(providerTruth, /evidenceLayerSatisfies/);
  assert.match(adminLaunch, /RELEASE_SHA = normalizeCommitSha\(process\.env\.REACT_APP_RELEASE_COMMIT_SHA\)/);
  assert.match(adminLaunch, /evidenceCountsForPublicLaunch/);
  assert.match(adminLaunch, /waived \(non-passing\)/);
  assert.match(adminLaunch, /EVIDENCE COVERAGE COMPLETE/);
  assert.match(adminLaunch, /This page measures exact-SHA evidence coverage only\. It never authorizes hard public launch/);
  assert.match(adminLaunch, /protected signed hard-launch decision/);
  assert.match(adminLaunch, /source: 'admin-manual-evidence'/);
  assert.match(adminLaunch, /hardLaunchClaim: false/);
  assert.doesNotMatch(adminLaunch, /PUBLIC READY/);
  assert.doesNotMatch(adminLaunch, /\['passed', 'waived'\]\.includes/);
});

test('provider gates distinguish hosted from physical-device proof', () => {
  assert.match(providerTruth, /id: 'firebaseCloudMessaging'[\s\S]*requiredEvidenceLayer: 'physical_device'/);
  assert.match(providerTruth, /id: 'googleMaps'[\s\S]*requiredEvidenceLayer: 'physical_device'/);
  assert.match(providerTruth, /id: 'phase1Payments'[\s\S]*requiredEvidenceLayer: 'physical_device'/);
  assert.match(providerTruth, /id: 'aiVisionOrTriage'[\s\S]*requiredEvidenceLayer: 'hosted'/);
  assert.equal(launchLedger.requiredProviderGates.phase1Payments.evidenceLayerRequired, 'physical_device');
  assert.equal(launchLedger.requiredProviderGates.googleMaps.evidenceLayerRequired, 'physical_device');
  assert.equal(launchLedger.requiredProviderGates.firebaseCloudMessaging.evidenceLayerRequired, 'physical_device');
});

test('production builds carry the exact release SHA into both app surfaces', () => {
  assert.match(envWriter, /GITHUB_SHA \|\| process\.env\.RELEASE_COMMIT_SHA/);
  assert.match(envWriter, /\['VITE_RELEASE_COMMIT_SHA', releaseCommitSha\]/);
  assert.match(envWriter, /\['REACT_APP_RELEASE_COMMIT_SHA', releaseCommitSha\]/);
  assert.match(envWriter, /\^\[a-f0-9\]\{40\}\$/);
});

test('legacy Admin operational dashboard cannot independently claim PUBLIC READY', () => {
  assert.doesNotMatch(adminTerminal, /stripeLiveMode/);
  assert.doesNotMatch(adminTerminal, /system_health['"],\s*['"]admin_summaries/);
  assert.doesNotMatch(adminTerminal, /allLaunchGatesPassed/);
  assert.doesNotMatch(adminTerminal, /PUBLIC READY/);
  assert.match(adminTerminal, /does not calculate or cache a public-launch PASS\/NO-GO result/);
  assert.match(adminTerminal, /PHASE1_PAYMENT_POLICY/);
});

test('committed launch ledger is conservative and retires the manual-bank gate', () => {
  assert.equal(launchLedger.schemaVersion, 4);
  assert.match(launchLedger.statusRule, /WAIVED_NEVER_COUNTS/);
  assert.equal(launchLedger.requiredProviderGates.phase1Payments.status, 'pending');
  assert.equal(launchLedger.requiredProviderGates.paymentGatewayOrManualBank.required, false);
  assert.equal(launchLedger.requiredProviderGates.paymentGatewayOrManualBank.status, 'retired');
  assert.equal(launchLedger.requiredProviderGates.paymentGatewayOrManualBank.replacementGate, 'phase1Payments');
  assert.equal(launchLedger.requiredProviderGates.appCheckEnforcement.status, 'pending');
});

test('protected GitHub evidence remains exact-SHA provenance, never device impersonation', () => {
  assert.match(bridge, /releaseSha/);
  assert.match(bridge, /workflowRunId/);
  assert.match(bridge, /batch\.create\(/);
  assert.match(manifestBuilder, /releaseSha/);
  assert.match(manifestBuilder, /workflowRunId/);
  assert.doesNotMatch(manifestBuilder, /gateId: 'phase1Payments'/);
});
