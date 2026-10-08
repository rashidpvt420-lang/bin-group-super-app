import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Phase 3 preserves one canonical service-mode truth from Owner selection through server quote and inspection', () => {
  const store = read('src/store/onboardingStore.ts');
  const quote = read('functions/ownerOnboardingQuote.ts');
  const inspection = read('functions/ownerInspectionCompletion.ts');
  const contracts = read('src/owner/pages/OwnerContractsResolvedPage.tsx');

  for (const token of ['FM_ONLY', 'PM_ONLY', 'BOTH']) {
    assert.match(store, new RegExp(token));
    assert.match(quote, new RegExp(token));
    assert.match(contracts, new RegExp(token));
  }
  assert.match(inspection, /fmInScope/);
  assert.match(inspection, /pmInScope/);
  assert.match(inspection, /combined|both|hybrid/i);
});

test('Phase 3 activation chain is inspection first and Cash/Cheque only under current production policy', () => {
  const marketing = read('src/pages/public/PublicMarketingPage.tsx');
  const paymentSummary = read('src/components/onboarding/PaymentSummaryStep.tsx');
  const providerTruth = read('packages/shared/src/config/providerLaunchTruth.ts');
  const approval = read('functions/paymentTransactionApproval.ts');

  assert.match(marketing, /property submission → BIN GROUP review → site inspection → final quotation → contract → payment → activation/);
  assert.match(paymentSummary, /type PaymentMethod = 'CASH' \| 'CHEQUE'/);
  assert.doesNotMatch(paymentSummary, /BANK_TRANSFER|STRIPE|Secure Card Payment/);
  assert.match(providerTruth, /approvedMethods: Object\.freeze\(\['CASH', 'CHEQUE'/);
  assert.match(providerTruth, /stripeEnabled: false/);
  assert.match(providerTruth, /bankTransferEnabled: false/);
  assert.match(approval, /requirePrivilegedMfaSession/);
  assert.match(approval, /paymentVerified/);
  assert.match(approval, /mobilization|mobilisation/i);
});

test('Phase 3 Technician chain binds GPS, offline replay, arrival notifications and before/after evidence', () => {
  const detail = read('src/technician/pages/TechnicianJobDetailPage.tsx');
  const live = read('src/utils/liveTracking.ts');
  const gpsBackend = read('functions/technicianLiveLocation.ts');
  const before = read('functions/technicianBeforeWorkEvidence.ts');
  const after = read('functions/technicianAfterWorkEvidence.ts');
  const offlineEvidence = read('src/technician/utils/offlineEvidenceQueue.ts');
  const notifications = read('functions/index.ts');

  assert.match(detail, /QUEUE_KEY = 'bin_offline_queue'/);
  assert.match(detail, /ARRIVAL_MAX_GPS_ACCURACY_METERS = 100/);
  assert.match(live, /updateTechnicianLiveLocation/);
  assert.match(live, /pendingStops/);
  assert.match(gpsBackend, /enforceAppCheck: true/);
  assert.match(before, /submitTechnicianBeforeWorkEvidence = onCall/);
  assert.match(before, /enforceAppCheck: true/);
  assert.match(after, /submitTechnicianAfterWorkEvidence = onCall/);
  assert.match(after, /enforceAppCheck: true/);
  assert.match(offlineEvidence, /submitTechnicianBeforeWorkEvidence/);
  assert.match(offlineEvidence, /submitTechnicianAfterWorkEvidence/);
  assert.match(notifications, /Technician Arrived/);
  assert.match(notifications, /Work Completed/);
});

test('Phase 3 AI and BIN Connect clients remain behind protected server authority', () => {
  const sovereign = read('src/components/SovereignAIChat.tsx');
  const design = read('src/pages/DesignStudioPage.tsx');
  const designBackend = read('functions/aiDesignStudio.ts');
  const binClient = read('src/components/BinConnectChatBox.tsx');
  const binBackend = read('functions/binConnectOperations.ts');

  assert.match(sovereign, /httpsCallable\(functions, 'runSovereignAI'\)/);
  assert.match(design, /httpsCallable\(functions, 'submitAIDesignRequest'\)/);
  assert.match(designBackend, /submitAIDesignRequest = onCall/);
  assert.match(designBackend, /enforceAppCheck: true/);
  assert.match(binClient, /httpsCallable\(functions, 'createBinConnectThread'\)/);
  assert.match(binBackend, /createBinConnectThread = onCall/);
  assert.match(binBackend, /audit_logs/);
});

test('Phase 3 Firebase authority keeps privileged operations behind App Check, MFA, rules and immutable evidence paths', () => {
  const runtime = read('functions/runtime.ts');
  const adminOps = read('functions/adminOperationalMutations.ts');
  const dispatch = read('functions/ticketDispatchOperations.ts');
  const firestoreRules = read('firestore.rules');
  const storageRules = read('storage.rules');

  assert.match(runtime, /adminOperationalMutations/);
  assert.match(adminOps, /enforceAppCheck: true/);
  assert.match(adminOps, /requirePrivilegedMfaSession/);
  assert.match(dispatch, /requirePrivilegedMfaSession/);
  assert.match(firestoreRules, /audit_logs/);
  assert.match(storageRules, /maintenanceTickets/);
  assert.match(storageRules, /proofPhotos|technician/i);
});

test('Phase 3 public security and privacy wording cannot claim disabled payment providers or universal 10-year hashing', () => {
  const security = read('src/pages/public/PublicSecurityPage.tsx');
  const privacy = read('public/privacy-policy.html');
  const providerTruth = read('packages/shared/src/config/providerLaunchTruth.ts');

  assert.match(providerTruth, /cardPaymentsEnabled: false/);
  assert.match(security, /Cash or Cheque evidence only/);
  assert.match(security, /Card\/Stripe and bank-transfer activation are disabled/);
  assert.doesNotMatch(security, /Payment processing is handled by PCI-DSS compliant providers \(Stripe\/Network International\)/);
  assert.doesNotMatch(security, /stored for 10 years/);
  assert.match(privacy, /Card processing is not enabled for current Owner activation/);
  assert.doesNotMatch(privacy, /Payment card data is processed by Stripe and never stored on our servers/);
  assert.match(privacy, /configured retention class/);
});

test('Phase 3 remains separate from hard-clearance and public-launch authority', () => {
  const prWorkflow = read('.github/workflows/pr-validation.yml');
  assert.doesNotMatch(prWorkflow, /hard-launch:authorize|launch:hard-approve/);
});
