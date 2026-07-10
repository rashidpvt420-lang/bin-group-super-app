import { existsSync, readFileSync } from 'node:fs';

const failures = [];
const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';
const assert = (condition, message) => { if (!condition) failures.push(message); };

const queue = read('apps/admin-panel/src/pages/financials/PaymentApprovalsPage.tsx');
const dashboard = read('apps/admin-panel/src/pages/dashboard/DashboardPage.tsx');
const approval = read('functions/paymentTransactionApproval.ts');
const stripe = read('functions/stripePayment.ts');
const finance = read('apps/admin-panel/src/pages/admin/ProfitabilityPage.tsx');
const adminApp = read('apps/admin-panel/src/App.tsx');

assert(queue.includes("where('adminApprovalRequired', '==', true)"), 'Admin payment queue must include paid records that still require Admin approval.');
assert(queue.includes("where('status', 'in', PENDING_PAYMENT_STATUSES)"), 'Admin payment queue must include manual pending statuses.');
assert(queue.includes("upper(row.verificationState) === 'AUTO_VERIFIED'"), 'Admin payment queue must distinguish Stripe auto-verification from final Admin approval.');
assert(queue.includes('dashboardUnlockApproved !== true') && queue.includes('adminApproved !== true'), 'Admin payment queue must remove already unlocked records.');
assert(queue.includes("httpsCallable(functions, 'adminApprovePayment')"), 'Admin payment approval must use the privileged callable.');
assert(queue.includes("httpsCallable(functions, 'adminRejectPayment')"), 'Admin payment rejection must use the privileged callable.');
assert(queue.includes('useLanguage') && queue.includes("lang === 'ar'"), 'Admin payment queue must be bilingual and RTL-aware.');

assert(dashboard.includes('countPaymentsAwaitingAdmin'), 'Admin dashboard must use the canonical payment-review counter.');
assert(dashboard.includes("where('adminApprovalRequired', '==', true)"), 'Admin dashboard must count Stripe-paid records awaiting Admin unlock.');
assert(!dashboard.includes("where('verificationState', '==', 'ADMIN_VERIFICATION_REQUIRED')"), 'Admin dashboard must not use the old single-state payment count.');

assert(approval.includes('payment.dashboardUnlockApproved === true') && approval.includes('payment.adminApproved === true'), 'Payment approval must be idempotent after owner unlock.');
assert(approval.includes('adminApprovalRequired: false'), 'Approve/reject callables must clear Admin approval requirement.');
assert(approval.includes('dashboardUnlockApproved: true'), 'Activation approval must explicitly approve dashboard unlock.');
assert(approval.includes('adminApproved: true'), 'Activation approval must record final Admin approval.');
assert(approval.includes('unlocksDashboard: true'), 'Activation approval must explicitly record dashboard unlock semantics.');
assert(approval.includes('activationState: "ACTIVE"'), 'Activation approval must set the payment activation state to ACTIVE.');
assert(approval.includes('activationState: "PAYMENT_REJECTED"'), 'Payment rejection must preserve an explicit locked rejection state.');
assert(stripe.includes('adminApprovalRequired: true') && stripe.includes('unlocksDashboard: false'), 'Stripe verification must remain separate from final Admin approval.');

assert(adminApp.includes('path="/financials" element={<AdminOnly><ProfitabilityPage /></AdminOnly>}'), 'Admin /financials must use the canonical live profitability page.');
assert(adminApp.includes('path="/profitability" element={<Navigate to="/financials" replace />}'), 'Legacy profitability route must redirect to /financials.');
assert(!existsSync('apps/admin-panel/src/pages/financials/ProfitabilityDashboardPage.tsx'), 'Duplicate financial dashboard alias must not return.');
assert(finance.includes("collectionName: 'payment_transactions'"), 'Live finance must include canonical payment_transactions.');
assert(finance.includes("collectionName: 'payments'"), 'Live finance must include legacy payment records during migration.');
assert(finance.includes('uniquePayments'), 'Live finance must deduplicate mirrored payment records.');
assert(finance.includes("collectionName: 'expenses'") && finance.includes("collectionName: 'invoices'") && finance.includes("collectionName: 'contracts'") && finance.includes("collectionName: 'properties'"), 'Live finance must derive metrics from actual ledgers.');
assert(!/Princess Tower|Marina Gate|Index Tower|Gate Tower|2450000|2520000|profitMargin:\s*55|churnRate:\s*1\.2/.test(finance), 'Live finance must not contain sample portfolios or assumed profitability metrics.');
assert(finance.includes('useLanguage') && finance.includes("lang === 'ar'"), 'Live finance must be bilingual and RTL-aware.');

if (failures.length) {
  console.error('\nPayment and finance workflow verification failed:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Payment and finance workflow verification passed: Stripe/manual review, Admin unlock, idempotency, and live ledger calculations are canonical.');
