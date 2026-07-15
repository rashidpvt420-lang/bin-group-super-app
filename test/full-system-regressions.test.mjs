import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('new server-authoritative callables are exported and used by browser clients', () => {
  const runtime = read('functions/runtime.ts');
  const tenantPayments = read('src/tenant/pages/TenantPaymentsPage.tsx');
  const designPayment = read('src/pages/DesignRequestDetailPage.tsx');
  const payroll = read('apps/admin-panel/src/pages/financials/PayrollManagementPage.tsx');

  for (const moduleName of ['paymentEvidence', 'ticketDispatchOperations', 'tenantTicketOperations', 'aiUsageQuota', 'hrAutomation']) {
    assert.match(runtime, new RegExp(`export \\* from ["']\\./${moduleName}["'];`));
  }
  assert.match(tenantPayments, /httpsCallable\(functions,\s*['"]submitTenantPaymentProof['"]\)/);
  assert.match(designPayment, /httpsCallable\(functions,\s*['"]createDesignPaymentRequest['"]\)/);
  assert.match(designPayment, /httpsCallable\(functions,\s*['"]createStripeCheckoutSession['"]\)/);
  assert.match(payroll, /['"]adminGeneratePayrollBatch['"]/);
  assert.match(payroll, /['"]adminSettlePayrollRecord['"]/);
  assert.doesNotMatch(payroll, /collection\(db,\s*['"]transactions['"]\)/);
});

test('owner dashboard activation requires every server-confirmed invariant', () => {
  const policy = read('src/owner/activationPolicy.ts');
  const route = read('src/components/ProtectedRoute.tsx');
  const dashboard = read('src/owner/pages/OwnerDashboardResolvedPage.tsx');

  assert.match(policy, /normalized\(profile\.status\)\s*===\s*['"]active['"]/);
  for (const field of ['adminApproved', 'paymentVerified', 'dashboardUnlocked']) {
    assert.match(policy, new RegExp(`profile\\.${field}\\s*===\\s*true`));
  }
  assert.match(policy, /profile\.dashboardLocked\s*!==\s*true/);
  assert.match(policy, /profile\.activeContractId/);
  assert.match(route, /isOwnerRecoveryPath/);
  assert.match(route, /profile_incomplete['"]\s*&&\s*!isOwnerRecoveryPath/);
  assert.match(dashboard, /isOwnerProfileActivated/);
  assert.match(dashboard, /isOwnerContractActivated/);
});

test('technician privacy is dispatch-first with explicit denied and listener-error states', () => {
  const rules = read('firestore.rules');
  const dashboard = read('src/technician/pages/TechnicianDashboardPage.tsx');
  const jobs = read('src/technician/pages/TechnicianJobsPage.tsx');
  const detail = read('src/technician/pages/TechnicianJobDetailPage.tsx');

  assert.doesNotMatch(rules, /function openMissionPoolRead\(|function safeOpenMissionClaim\(/);
  assert.match(rules, /allow read: if participantCanRead\(resource\.data\) \|\| canDispatchJobs\(\);/);
  assert.doesNotMatch(dashboard, /assignedTechnicianId['"],\s*['"]==['"],\s*null/);
  assert.doesNotMatch(dashboard, /CLAIM MISSION|Available Mission Pool/);
  assert.match(jobs, /setLoadError/);
  assert.match(detail, /Only the assigned technician can view this job/);
  assert.match(detail, /\[['"]ASSIGNED['"],\s*['"]AUTO_ASSIGNED['"]\]\.includes\(status\)/);
});

test('admin financial reporting uses only verified canonical payment transactions', () => {
  const cfo = read('apps/admin-panel/src/pages/admin/ProfitabilityPage.tsx');
  const ops = read('apps/admin-panel/src/components/ops/PublicLaunchOpsPanel.tsx');
  const reports = read('functions/adminReports.ts');

  assert.match(cfo, /collection\(db,\s*['"]payment_transactions['"]\)/);
  assert.doesNotMatch(cfo, /collection\(db,\s*['"]payments['"]\)/);
  assert.match(cfo, /paymentVerified\s*===\s*true/);
  assert.match(cfo, /Not available/);
  assert.match(ops, /collection\(db,\s*['"]payment_transactions['"]\)/);
  assert.doesNotMatch(ops, /collection\(db,\s*['"]payments['"]\)/);
  assert.match(reports, /readCollection\(services\.db,\s*["']payment_transactions["']/);
  assert.doesNotMatch(reports, /readCollection\(services\.db,\s*["']payments["']/);
  assert.doesNotMatch(reports, /readCollection\(services\.db,\s*["']invoices["']/);
});

test('property uniqueness is callable-only, coarse and rate limited', () => {
  const callable = read('functions/clientTelemetry.ts');
  const mainRegistry = read('src/utils/PublicSecurityRegistry.ts');
  const sharedRegistry = read('packages/shared/src/utils/PublicSecurityRegistry.ts');

  assert.match(callable, /PROPERTY_CHECK_LIMIT\s*=\s*20/);
  assert.match(callable, /collection\(["']public_rate_limits["']\)/);
  assert.match(callable, /enforceAppCheck:\s*true/);
  assert.match(callable, /return \{ available:/);
  for (const client of [mainRegistry, sharedRegistry]) {
    assert.match(client, /httpsCallable[\s\S]*checkPropertyUniqueness/);
    assert.doesNotMatch(client, /active_contracts|onboarding_leads/);
  }
});

test('broker attribution is matched from negotiation and remains server authoritative', () => {
  const queue = read('apps/admin-panel/src/pages/ops/AdminBrokerAttributionQueuePage.tsx');
  const backend = read('functions/brokerCommissions.ts');

  assert.match(queue, /where\(['"]status['"],\s*['"]==['"],\s*['"]negotiation['"]\)/);
  assert.match(queue, /adminMatchBrokerAttribution/);
  assert.match(backend, /leadStatus\s*!==\s*["']negotiation["']/);
  assert.match(backend, /Contract is already attributed to another broker/);
  assert.match(backend, /commissionId:\s*commission\.commissionId/);
});

test('Stripe, OTP, IoT, notifications and AI retain fail-closed controls', () => {
  const stripe = read('functions/stripePayment.ts');
  const otp = read('functions/contractSignatureOtp.ts');
  const approval = read('functions/paymentTransactionApproval.ts');
  const ownerOperations = read('functions/adminOwnerOperations.ts');
  const iot = read('functions/index.ts');
  const notifications = read('functions/notificationDelivery.ts');
  const aiQuota = read('functions/aiUsageQuota.ts');

  assert.match(stripe, /stripe_webhook_events/);
  assert.match(stripe, /response\.status\(503\).*retry:\s*true/s);
  assert.match(stripe, /checkoutAttempt/);
  assert.match(stripe, /idempotencyKey/);
  assert.match(otp, /if \(consumedFor\)/);
  assert.match(approval, /hasDurableOtpSignatureEvidence/);
  assert.match(approval, /signatureState\?\.ownerSignatureName/);
  assert.match(approval, /evidence\.consumedFor/);
  assert.match(approval, /Boolean\(evidence\.consumedAt\)/);
  assert.match(ownerOperations, /ownerSigned:\s*true,\s*signatureName,/);
  assert.match(ownerOperations, /\.\.\.\(authUser\.customClaims \|\| \{\}\),\s*suspended:\s*false/s);
  assert.match(iot, /x-iot-gateway-token/);
  assert.match(iot, /iot_devices/);
  assert.match(iot, /if \(eventSnap\.exists\)[\s\S]{0,100}duplicate = true/);
  assert.match(iot, /transaction\.create\(eventRef/);
  assert.match(iot, /eventId,\s*duplicate,/);
  assert.match(notifications, /enforceAppCheck:\s*true/);
  assert.match(notifications, /notification_dispatch_claims/);
  assert.match(aiQuota, /DAILY_CAPABILITY_LIMITS/);
  assert.match(aiQuota, /resource-exhausted/);
});

test('tenant physical access and service tickets are server authoritative', () => {
  const qr = read('functions/qrSecurity.ts');
  const tenantTickets = read('functions/tenantTicketOperations.ts');
  const rules = read('firestore.rules');
  const gatePage = read('src/tenant/pages/TenantGatePassPage.tsx');
  const parkingPage = read('src/tenant/pages/TenantVisitorParkingPage.tsx');
  const emergencyPage = read('src/tenant/pages/TenantEmergencyPage.tsx');
  const scheduledPage = read('src/tenant/pages/TenantScheduledServicePage.tsx');
  const aiPage = read('src/tenant/pages/TenantAIConciergePage.tsx');

  assert.match(qr, /assertTenantResidence/);
  assert.match(qr, /timingSafeEqual/);
  assert.match(qr, /issuedByFunction:\s*"generateSignedQrPass"/);
  assert.match(rules, /match \/gatePasses\/\{passId\}[\s\S]{0,300}allow create, update, delete: if false;/);
  assert.match(rules, /match \/visitorParkingRequests\/\{requestId\}[\s\S]{0,250}allow create: if false;/);
  assert.doesNotMatch(gatePage, /addDoc\(collection\(db,\s*['"]gatePasses['"]/);
  assert.doesNotMatch(parkingPage, /addDoc\(collection\(db,\s*['"]visitorParkingRequests['"]/);
  assert.match(tenantTickets, /export const createTenantServiceTicket/);
  assert.match(tenantTickets, /preferredDate < dubaiDateKey\(\)/);
  assert.match(aiPage, /HIGH:\s*['"]urgent['"]/);
  assert.match(aiPage, /URGENT:\s*['"]emergency['"]/);
  for (const page of [emergencyPage, scheduledPage, aiPage]) {
    assert.match(page, /createTenantServiceTicket/);
    assert.doesNotMatch(page, /addDoc\(collection\(db,\s*['"]maintenanceTickets['"]/);
  }
});

test('rent approval revalidates immutable Storage receipt evidence', () => {
  const ownerWriter = read('functions/ownerFinancialOperations.ts');
  const approval = read('functions/paymentTransactionApproval.ts');
  const ownerUi = read('src/owner/components/OwnerMoneySnapshotSection.tsx');
  for (const source of [ownerWriter, approval]) {
    assert.match(source, /assertStoredOwnerPaymentReceipt/);
  }
  assert.match(ownerUi, /receiptHash:\s*referenceFileHash/);
  assert.match(ownerUi, /evidenceType:\s*['"]owner_payment_receipt['"]/);
});

test('runtimeAll does not re-export functions already exported by runtime', () => {
  const runtimeAll = read('functions/runtimeAll.ts');
  assert.doesNotMatch(runtimeAll, /adminCreateUser|syncStaffCustomClaims/);
  assert.doesNotMatch(runtimeAll, /listOwnerHandoverInspections|updateOwnerHandoverInspection/);
  assert.doesNotMatch(runtimeAll, /submitTenantMoveInspection/);
});
