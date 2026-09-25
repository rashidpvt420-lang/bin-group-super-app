import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Phase 12 exposes one identical canonical registry to backend, root UI and shared Admin UI', async () => {
  const [functionsRegistry, rootRegistry, sharedRegistry] = await Promise.all([
    read('functions/workflowStateMachines.ts'),
    read('src/lib/workflowStateMachines.ts'),
    read('packages/shared/src/workflowStateMachines.ts'),
  ]);
  assert.equal(rootRegistry, functionsRegistry);
  assert.equal(sharedRegistry, functionsRegistry);

  for (const domain of [
    'PROPERTY', 'TICKET', 'INSPECTION', 'PAYMENT', 'QUOTE',
    'CONTRACT', 'TENANT_LINK', 'BROKER_KYC', 'TECHNICIAN_JOB', 'ONBOARDING',
  ]) {
    assert.match(functionsRegistry, new RegExp(`\\b${domain}: \\\[`));
  }
  assert.match(functionsRegistry, /Legacy aliases exist for reads\/migrations only/);
  assert.match(functionsRegistry, /assertCanonicalWorkflowState/);
  assert.match(functionsRegistry, /assertWorkflowTransition/);
  assert.match(functionsRegistry, /legacyWorkflowAliases/);
});

test('Phase 12 Owner property and onboarding writes use canonical uppercase lifecycle states', async () => {
  const [resubmit, inspectionFirst, inspectionCompletion, registration, onboardingBackend, onboardingFrontend] = await Promise.all([
    read('functions/ownerPropertyResubmission.ts'),
    read('functions/inspectionFirstOwnerOnboarding.ts'),
    read('functions/ownerInspectionCompletion.ts'),
    read('functions/ownerRegistrationRequest.ts'),
    read('functions/onboardingStateMachine.ts'),
    read('src/lib/onboardingStateMachine.ts'),
  ]);

  assert.equal(onboardingFrontend, onboardingBackend);
  assert.match(resubmit, /propertyState !== "CHANGES_REQUESTED"/);
  assert.match(resubmit, /assertOnboardingTransition\(propertyState, "UNDER_REVIEW"\)/);
  assert.match(resubmit, /lifecycleStatus: "UNDER_REVIEW"/);
  assert.match(resubmit, /onboardingState: "UNDER_REVIEW"/);
  assert.doesNotMatch(resubmit, /(?:status|lifecycleStatus|onboardingState): "admin_review"/);

  assert.match(inspectionFirst, /status: "INSPECTION_REQUIRED"/);
  assert.match(inspectionFirst, /status: "PENDING_PROPERTY_INSPECTION"/);
  assert.match(inspectionFirst, /status: "PENDING_PAYMENT"/);
  assert.match(inspectionFirst, /onboardingStatus: "PAYMENT_PENDING"/);
  assert.match(inspectionCompletion, /status: "EVIDENCE_RECORDED"/);
  assert.match(inspectionCompletion, /status: "PENDING_PAYMENT"/);
  assert.match(registration, /onboardingStatus: pendingPaymentPackage \? "PAYMENT_PROCESSING" : "UNDER_REVIEW"/);
  assert.match(registration, /status: pendingPaymentPackage \? "PAYMENT_PROCESSING" : "UNDER_REVIEW"/);
});

test('Phase 12 payment, quote and contract authority cannot mint legacy lifecycle states', async () => {
  const [approval, activation, designPayments, designStudio, legacyAdmin] = await Promise.all([
    read('functions/paymentTransactionApproval.ts'),
    read('functions/contractActivation.ts'),
    read('functions/designPayments.ts'),
    read('functions/aiDesignStudio.ts'),
    read('functions/adminOwnerOperations.ts'),
  ]);

  assert.match(approval, /assertWorkflowTransition\("PAYMENT", currentPaymentState, "APPROVED"\)/);
  assert.match(approval, /assertWorkflowTransition\("CONTRACT", currentContractState, "ACTIVE"\)/);
  assert.match(approval, /assertWorkflowTransition\("ONBOARDING", currentOnboardingState, "ACTIVE"\)/);
  assert.match(approval, /assertWorkflowTransition\("PROPERTY", propertyState, "ACTIVE"\)/);
  assert.match(approval, /status: "PENDING_PAYMENT"/);
  assert.match(approval, /status: "PAYMENT_PENDING"/);
  assert.doesNotMatch(approval, /status: "PAYMENT_REJECTED"/);

  assert.match(activation, /status: "PENDING_PAYMENT"/);
  assert.match(activation, /paymentStatus: "PENDING"/);
  assert.doesNotMatch(activation, /status: "PENDING_ADMIN_PAYMENT_VERIFICATION"/);
  assert.doesNotMatch(activation, /paymentStatus: "PENDING_VERIFICATION"/);

  assert.match(designPayments, /design_quotes[^\n]*\{ status: action === 'REJECT' \? 'REJECTED' : 'ACCEPTED'/);
  assert.match(designStudio, /status: role === "tenant" \? "PRESENTED" : "READY"/);
  assert.doesNotMatch(designStudio, /design_quotes[\s\S]{0,500}status: role === "tenant" \? "PENDING_OWNER_APPROVAL" : "DEPOSIT_PENDING"/);

  assert.match(legacyAdmin, /contractStatus: "PENDING_OWNER_SIGNATURE"/);
  assert.match(legacyAdmin, /status: "APPROVED", paymentStatus: "APPROVED", verificationState: "ADMIN_VERIFIED"/);
  assert.match(legacyAdmin, /status: "PENDING_PAYMENT", contractStatus: "PENDING_PAYMENT"/);
});

test('Phase 12 tenant-link and Broker KYC mutations enforce canonical transitions', async () => {
  const [tenantLink, profileWorkflows, brokerSubmit, brokerReview, listing, payout] = await Promise.all([
    read('functions/secureTenantUnitLinkOperations.ts'),
    read('functions/profileP1Workflows.ts'),
    read('functions/brokerKycProfile.ts'),
    read('functions/secureBrokerKycReview.ts'),
    read('functions/brokerListingAccess.ts'),
    read('functions/secureBrokerPayoutOperations.ts'),
  ]);

  for (const source of [tenantLink, profileWorkflows]) {
    assert.match(source, /normalizeWorkflowState\("TENANT_LINK"/);
    assert.match(source, /assertWorkflowTransition\("TENANT_LINK"/);
  }
  assert.match(brokerSubmit, /assertCanonicalWorkflowState\("BROKER_KYC"/);
  assert.match(brokerSubmit, /"PENDING_REVIEW" : "CHANGES_REQUESTED"/);
  assert.match(brokerReview, /normalizeWorkflowState\([\s\S]*?"BROKER_KYC"/);
  assert.match(brokerReview, /assertWorkflowTransition\("BROKER_KYC"/);
  assert.match(profileWorkflows, /assertWorkflowTransition\("BROKER_KYC"/);
  assert.match(listing, /\["approved", "verified"\]\.includes/);
  assert.match(payout, /\["approved", "verified"\]\.includes/);
});

test('Phase 12 ticket/technician lifecycle writes canonical values and Firestore rejects legacy browser writes', async () => {
  const [normalizer, lifecycle, ticketStatus, tenantTickets, index, rules, normalizeRules, hardenRules] = await Promise.all([
    read('functions/ticketNormalization.ts'),
    read('functions/shared/maintenanceTicketLifecycle.js'),
    read('src/utils/ticketStatus.ts'),
    read('functions/tenantTicketOperations.ts'),
    read('functions/index.ts'),
    read('firestore.rules'),
    read('scripts/normalize-firestore-rules.mjs'),
    read('scripts/harden-firestore-rules.mjs'),
  ]);

  assert.match(normalizer, /return "EN_ROUTE"/);
  assert.doesNotMatch(normalizer, /return "ON_THE_WAY"/);
  assert.match(ticketStatus, /on_the_way: 'EN_ROUTE'/);
  assert.match(ticketStatus, /resolved: 'CLOSED'/);
  assert.match(lifecycle, /AUTO_ASSIGNED: "ASSIGNED"/);
  assert.match(lifecycle, /ON_THE_WAY: "EN_ROUTE"/);
  assert.match(lifecycle, /RESOLVED: "CLOSED"/);
  assert.match(tenantTickets, /status: "OPEN"/);
  assert.doesNotMatch(tenantTickets, /status: "EMERGENCY_SUBMITTED"/);
  assert.match(index, /status: "ASSIGNED"/);
  assert.match(index, /status: "WAITING_PARTS"/);

  assert.match(rules, /function canonicalTicketStatus\(value\)/);
  const dispatcher = rules.slice(rules.indexOf('function safeDispatcherTicketUpdate'), rules.indexOf('function safeTechnicianTicketUpdate'));
  assert.match(dispatcher, /'OPEN'/);
  assert.match(dispatcher, /'PENDING_ASSIGNMENT'/);
  assert.match(dispatcher, /'SCHEDULED'/);
  assert.match(dispatcher, /'ASSIGNED'/);
  assert.doesNotMatch(dispatcher, /'open'|'auto_assigned'|'AUTO_ASSIGNED'|'REASSIGNED'|'emergency_submitted'/);
  assert.match(normalizeRules, /data\.status == 'OPEN'/);
  assert.match(hardenRules, /data\.status == 'OPEN'/);
});

test('Phase 12 Firestore rules preserve canonical client-write boundaries', async () => {
  const rules = await read('firestore.rules');

  assert.match(rules, /data\.status == 'PENDING_ADMIN_REVIEW'/);
  assert.match(rules, /function ownerDraftCreate[\s\S]*data\.status == 'DRAFT'/);
  assert.match(rules, /function safeOwnerContractUpdate[\s\S]*request\.resource\.data\.status in \['DRAFT', 'PENDING_OWNER_SIGNATURE', 'SIGNED', 'PENDING_PAYMENT', 'CANCELLED'\]/);
  assert.match(rules, /match \/payment_transactions\/\{paymentId\}[\s\S]*allow create: if false;[\s\S]*allow update, delete: if false;/);
  assert.match(rules, /match \/broker_kyc_profiles\/\{brokerId\}[\s\S]*allow create, update, delete: if false;/);
  assert.match(rules, /match \/design_quotes\/\{quoteId\}[\s\S]*allow update, delete: if false;/);
  assert.match(rules, /function safeOwnerPropertyUpdate[\s\S]*'status'[\s\S]*'lifecycleStatus'[\s\S]*'onboardingState'/);
});

test('Phase 12 queries, filters and reporting normalize legacy reads into canonical states', async () => {
  const [adminPayments, tenantPayments, brokerPage, brokerAdmin, reports, recon, ledger] = await Promise.all([
    read('apps/admin-panel/src/pages/financials/PaymentApprovalsPage.tsx'),
    read('src/tenant/pages/TenantPaymentsPage.tsx'),
    read('src/broker/pages/BrokerProfilePage.tsx'),
    read('apps/admin-panel/src/pages/brokers/BrokerManagementPage.tsx'),
    read('functions/adminReports.ts'),
    read('apps/admin-panel/src/components/ops/RevenueReconciler.tsx'),
    read('functions/rentLedgerMirror.ts'),
  ]);

  assert.match(adminPayments, /legacyWorkflowAliases\('PAYMENT'\)/);
  assert.match(adminPayments, /normalizeWorkflowState\('PAYMENT'/);
  assert.match(tenantPayments, /normalizeWorkflowState\('PAYMENT'/);
  assert.match(brokerPage, /normalizeWorkflowState\('BROKER_KYC'/);
  assert.match(brokerAdmin, /normalizeWorkflowState\('BROKER_KYC'/);
  assert.match(reports, /normalizeWorkflowState\("PAYMENT"/);
  assert.match(reports, /normalizeWorkflowState\("TICKET"/);
  assert.match(recon, /normalizeWorkflowState\('PAYMENT'/);
  assert.match(ledger, /paymentStatus: normalizeWorkflowState\("PAYMENT"/);
});
