// Audit Nov 2026 (D-01..D-04) static guards. Behaviour is covered by the emulator suites:
// payment-approval-finance-roles, owner-services-suspended, finance-tier-role-assignment and
// owner-spending-limits under test/emulator-callables/.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('D-02: approved owner payment terms are fixed server constants', () => {
  const ledger = read('functions/ownerPaymentLedger.ts');
  assert.match(ledger, /export const OWNER_MOBILIZATION_DUE_DAYS = 7;/);
  assert.match(ledger, /export const RETURNED_CHEQUE_FEE_AED = 500;/);
  assert.match(ledger, /export const OWNER_SUSPENSION_NOTICE_DAYS = 15;/);
  assert.match(ledger, /vatTreatment: "NOT_APPLIED"/);
  const limits = read('functions/ownerSpendingLimits.ts');
  assert.match(limits, /export const FIXED_OWNER_APPROVAL_LIMIT_AED = 1000;/);
  assert.match(limits, /export const EMERGENCY_SPEND_LIMIT_AED = 2500;/);
  assert.match(limits, /export const EMERGENCY_OWNER_NOTIFY_HOURS = 24;/);
  assert.match(limits, /perJobLimitAed: FIXED_OWNER_APPROVAL_LIMIT_AED, perJobLimitFixed: true/);
  assert.doesNotMatch(code(limits), /perJobLimitAed: Math\.round\(limit/);
});

test('D-02: owner agreement prints the fixed AED 1,000 limit and the AED 2,500 / 24h emergency allowance (EN/AR)', () => {
  const pdf = read('functions/pdfEngine.ts');
  assert.match(pdf, /9G\. Fixed approval limit/);
  assert.match(pdf, /9ز\. حد الموافقة الثابت/);
  assert.match(pdf, /FIXED_OWNER_APPROVAL_LIMIT_AED\.toLocaleString/);
  assert.match(pdf, /EMERGENCY_OWNER_NOTIFY_HOURS/);
});

test('D-02: emergency allowance needs an emergency ticket and notifies the owner', () => {
  const rfq = read('functions/secureAdminProcurementTrust.ts');
  assert.match(rfq, /spendApprovalGate\(estimateBandAed, emergency\)/);
  assert.match(rfq, /The emergency allowance applies only to an emergency ticket\./);
  assert.match(rfq, /type: "EMERGENCY_SPEND_NOTICE"/);
});

test('D-03: owner suspension defaults to services-only (no account lock) and emergencies pass', () => {
  const ops = read('functions/adminOwnerOperations.ts');
  const start = ops.indexOf('export const adminSuspendOwner');
  const servicesBranch = ops.slice(start, ops.indexOf('const currentStatus', start));
  assert.match(servicesBranch, /s\(request\.data\?\.mode, "SERVICES"\)/);
  assert.match(servicesBranch, /serviceSuspended: true/);
  assert.doesNotMatch(servicesBranch, /updateUser\(/);
  assert.doesNotMatch(servicesBranch, /setCustomUserClaims\(/);
  const gate = read('functions/propertyServiceEntitlement.ts');
  assert.match(gate, /assertOwnerServiceRequestAllowed\(owner, emergency\)/);
  assert.match(gate, /OWNER_SERVICES_SUSPENDED/);
  assert.match(read('functions/ownerMaintenanceOperations.ts'), /\{ emergency: priority === "emergency" \}/);
  assert.match(read('functions/tenantTicketOperations.ts'), /\{ emergency: emergencyRequest \}/);
  // The owner browser cannot clear its own services-suspended flag.
  assert.match(read('firestore.rules'), /'serviceSuspended',\s*'serviceSuspension'/);
});

test('D-04: finance tiers are provisionable only by a Super Admin / CEO with MFA, audit logged', () => {
  const prov = read('functions/adminUserProvisioning.ts');
  assert.match(prov, /"finance_manager",/);
  assert.match(prov, /"finance_controller",/);
  assert.match(prov, /"payroll_admin",/);
  assert.match(prov, /const FINANCE_TIER_ASSIGNER_ROLES = new Set\(\["super_admin", "ceo"\]\)/);
  assert.equal((prov.match(/await requireFinanceTierAssigner\(request\)/g) || []).length, 3);
  assert.match(prov, /financeTierAssignment,/);
  const lifecycle = read('functions/adminStaffLifecycle.ts');
  assert.match(lifecycle, /"finance_manager", "finance_controller", "payroll_admin"/);
});
