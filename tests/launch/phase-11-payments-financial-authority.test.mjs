import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('Phase 11: current production payment policy is exactly AED Cash/Cheque', () => {
  const config = read('functions/paymentConfiguration.ts');
  const launchTruth = read('packages/shared/src/config/providerLaunchTruth.ts');
  const phase1 = read('scripts/ensure-phase1-manual-payment-config.mjs');

  assert.match(config, /PHASE1_METHODS = \["CASH", "CHEQUE"\]/);
  assert.match(config, /bankTransferEnabled: false/);
  assert.match(config, /stripeEnabled: false/);
  assert.match(phase1, /EXPECTED_METHODS = \['CASH', 'CHEQUE'\]/);
  assert.match(launchTruth, /PHASE1_PAYMENT_POLICY/);
  assert.match(launchTruth, /approvedMethods: Object\.freeze\(\['CASH', 'CHEQUE'\] as const\)/);
});

test('Phase 11: Stripe is fail-closed in the deployed runtime', () => {
  const runtime = read('functions/runtime.ts');
  const hold = read('functions/stripePaymentPhase1Hold.ts');

  assert.match(runtime, /export \* from "\.\/stripePaymentPhase1Hold";/);
  assert.doesNotMatch(runtime, /export \* from "\.\/stripePayment";/);
  assert.match(hold, /createStripeCheckoutSession = onCall/);
  assert.match(hold, /enforceAppCheck: true/);
  assert.match(hold, /Stripe\/card collection is disabled/i);
  assert.match(hold, /response\.status\(410\)/);
});

test('Phase 11: inspection-first Owner payment cannot start before final verified server re-quote', () => {
  const activation = read('functions/contractActivation.ts');
  const inspection = read('functions/inspectionFirstOwnerOnboarding.ts');

  assert.match(activation, /assertInspectionFirstPaymentReady/);
  assert.match(activation, /inspectionVerified !== true/);
  assert.match(activation, /quoteRepricedAfterInspection !== true/);
  assert.match(activation, /FINAL_VERIFIED_AFTER_ALL_SITE_VISITS/);
  assert.match(activation, /finalVerifiedQuoteSnapshot/);
  assert.match(activation, /signedPreInspectionQuoteHash/);
  assert.match(activation, /Owner activation payment is not due until every property inspection is verified/i);

  const gateIndex = activation.indexOf('assertInspectionFirstPaymentReady(contract)');
  const policyIndex = activation.indexOf('loadActivePaymentConfiguration()');
  const createIndex = activation.indexOf('transaction.create(paymentRef');
  assert.ok(gateIndex >= 0 && policyIndex > gateIndex && createIndex > policyIndex);

  assert.match(inspection, /NOT_DUE_UNTIL_INSPECTION_COMPLETE/);
  assert.match(inspection, /INSPECTION_REQUIRED_BEFORE_PAYMENT/);
});

test('Phase 11: exact fils authority and active UI never calculate the payable 15 percent locally', () => {
  const inspection = read('functions/inspectionFirstOwnerOnboarding.ts');
  const submit = read('src/components/onboarding/InspectionSubmissionStep.tsx');
  const signature = read('src/components/onboarding/ContractSignatureStep.tsx');
  const summary = read('src/components/onboarding/PaymentSummaryStep.tsx');
  const vault = read('apps/admin-panel/src/pages/admin/IntakeVaultPage.tsx');

  assert.match(inspection, /amountReceived !== expectedAmount/);
  assert.doesNotMatch(inspection, /Math\.abs\(amountReceived - expectedAmount\) > 0\.01/);
  assert.match(inspection, /exactly to the fils/);

  for (const source of [submit, signature, summary, vault]) {
    assert.doesNotMatch(source, /Math\.round\([^\n]*\*\s*0\.15/);
  }
  assert.match(submit, /serverQuote\?\.activationDeposit/);
  assert.match(summary, /canonicalQuote\?\.activationDeposit/);
});

test('Phase 11: live financial displays never reconstruct payable deposits from annual value', () => {
  const ownerFinancials = read('src/owner/utils/ownerFinancialResolver.ts');
  const ownerContracts = read('src/owner/pages/OwnerContractsResolvedPage.tsx');
  const designDetail = read('src/pages/DesignRequestDetailPage.tsx');
  const routeGuard = read('scripts/verify-route-consolidation.mjs');

  assert.doesNotMatch(ownerFinancials, /annualContractValue\s*\*\s*0\.15/);
  assert.match(ownerFinancials, /quoteSnapshot\?\.activationDeposit/);
  assert.doesNotMatch(ownerContracts, /annual\s*>\s*0\s*\?\s*annual\s*\*\s*0\.15/);
  assert.match(ownerContracts, /Pending admin confirmation/);
  assert.doesNotMatch(designDetail, /finalTotal[^\n]*\*\s*0\.15/);
  assert.match(designDetail, /quote\.mobilizationAmount/);
  assert.match(designDetail, /Pending server quote/);

  assert.match(routeGuard, /LegacyOwnerRedirectShell/);
  assert.match(routeGuard, /Legacy owner app: manual handoff only/);
});

test('Phase 11: Admin Owner activation approval is Cash/Cheque only and creates immutable financial records', () => {
  const approval = read('functions/paymentTransactionApproval.ts');
  const secure = read('functions/securePaymentApproval.ts');

  assert.match(approval, /\["CASH", "CHEQUE"\]\.includes\(normalizedMethod\)/);
  assert.match(approval, /\["CASH", "CHEQUE"\]\.includes\(freshMethod\)/);
  assert.doesNotMatch(approval, /\["BANK_TRANSFER", "CHEQUE", "CASH"\]/);
  assert.doesNotMatch(approval, /freshMethod === "STRIPE"/);
  assert.doesNotMatch(approval, /manualReference \|\| payment\.stripeSessionId/);
  assert.match(approval, /transaction\.set\(db\.collection\("invoices"\)\.doc\(invoiceId\)/);
  assert.match(approval, /transaction\.set\(db\.collection\("invoice_registry"\)\.doc\(invoiceHash\)/);
  assert.match(approval, /status: "ACTIVE"/);
  assert.match(approval, /paymentVerified: true/);
  assert.match(approval, /dashboardUnlocked: true/);

  assert.match(secure, /requireMfaFinanceAdmin/);
  assert.match(secure, /A verified Admin MFA session is required for payment decisions/);
});

test('Phase 11: contract cancellation preserves paid history and forces a server-side refund disposition', () => {
  const closure = read('functions/secureAdminContractOperations.ts');
  const refund = read('functions/securePaymentApproval.ts');
  const adminPage = read('apps/admin-panel/src/pages/admin/AdminContractControlPage.tsx');
  const legacyPage = read('apps/admin-panel/src/pages/admin/ContractTerminationPage.tsx');

  assert.match(closure, /REFUND_REVIEW_REQUIRED/);
  assert.match(closure, /FULL_REFUND_RECORDED/);
  assert.match(closure, /NO_APPROVED_PAYMENT/);
  assert.match(closure, /refundReviewRequired/);
  assert.match(closure, /closureFinancialDisposition/);

  assert.match(refund, /adminRecordOwnerPaymentRefund/);
  assert.match(refund, /\["FULL_REFUND", "NO_REFUND"\]/);
  assert.match(refund, /Partial refunds require a separately approved server policy/);
  assert.match(refund, /payment\.amountReceived \?\? payment\.amount \?\? payment\.activationDeposit/);
  assert.match(refund, /normalizeAedMoney/);
  assert.doesNotMatch(refund, /request\.data\?\.refundAmount/);
  assert.match(refund, /transaction\.create\(refundRef/);
  assert.match(refund, /originalPaymentId: paymentId/);

  assert.match(adminPage, /adminRecordOwnerPaymentRefund/);
  assert.match(adminPage, /Refund amount is server-derived/);
  assert.doesNotMatch(adminPage, /refundAmount.*onChange/);
  assert.match(legacyPage, /adminCloseContract/);
  assert.doesNotMatch(legacyPage, /updateDoc\(doc\(db, 'contracts'/);
});

test('Phase 11: canonical production evidence and legacy aliases cannot disagree on payment policy', () => {
  const canonical = read('scripts/run-owner-inspection-first-production-evidence.mjs');
  const legacy = read('scripts/run-owner-onboarding-production-evidence.mjs');
  const legacySecure = read('scripts/run-owner-onboarding-production-evidence-secure.mjs');

  assert.match(canonical, /\['CASH', 'CHEQUE'\]/);
  assert.match(canonical, /adminRecordOwnerMobilizationPaymentEvidence/);
  assert.match(canonical, /adminApprovePayment/);
  assert.match(canonical, /paymentNotDueBeforeInspections: true/);
  assert.match(canonical, /finalApprovalIdempotentReplay: true/);
  assert.doesNotMatch(canonical, /BANK_TRANSFER/);

  for (const alias of [legacy, legacySecure]) {
    assert.match(alias, /run-owner-inspection-first-production-evidence\.mjs/);
    assert.doesNotMatch(alias, /submitOwnerOnboardingPaymentPackage/);
    assert.doesNotMatch(alias, /BANK_TRANSFER/);
  }
});

test('Phase 11: retired owner-app payment abstraction cannot create a browser-authoritative payment', () => {
  const legacyService = read('apps/owner-app/src/lib/paymentService.ts');
  assert.match(legacyService, /legacy payment screen is retired/i);
  assert.match(legacyService, /server can lock the quote, OTP, contract, and payment evidence/i);
  assert.doesNotMatch(legacyService, /httpsCallable\([^\n]*createStripeCheckoutSession/);
});
