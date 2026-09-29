// N-05 CI gate: privileged callables must enforce a server-side second factor, and Firestore
// Admin-tier rules must require firebase.sign_in_second_factor.
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

const COVERED = {
  'functions/hrAutomation.ts': ['adminGeneratePayrollBatch', 'adminSettlePayrollRecord'],
  'functions/adminHrOperations.ts': ['adminGetHrOperations', 'adminRecordStaffAttendance', 'adminCreateStaffLeaveRequest', 'adminReviewStaffLeaveRequest', 'adminRegisterHrDocumentMetadata'],
  'functions/adminStaffLifecycle.ts': ['adminGetStaffLifecycle', 'adminGetStaffDetails', 'adminGetTechnicianOperationsDirectory', 'adminUpdateStaffProfile', 'adminUpdateStaffOnboarding', 'adminOffboardStaff', 'adminResendStaffInvitation'],
  'functions/secureAdminTechnicianAssignment.ts': ['adminAssignTechnician'],
  'functions/ticketDispatchOperations.ts': ['adminAssignTechnician', 'adminResolveTicketDispute', 'adminUpdateEmergencyTicket', 'adminProcessWhatsAppIntake'],
  'functions/scheduledServices.ts': ['adminRevealScheduledServiceAccessCode'],
  'functions/scheduledServiceAvailability.ts': ['adminManageScheduledServiceAvailability', 'adminUpdateScheduledService'],
  'functions/secureTenantUnitLinkOperations.ts': ['adminResolveTenantUnitLink'],
  'functions/profileP1Workflows.ts': ['adminResolveTenantUnitLink', 'adminRepairOrphanLinkage', 'adminRepairPropertyGeo'],
  'functions/tenantCorrectionOperations.ts': ['adminResolveTenantCorrectionRequest', 'listAdminTenantCorrectionRequests'],
  'functions/adminReports.ts': ['getAdminReports'],
  'functions/adminLaunchConfiguration.ts': ['adminGetLaunchConfigurationSummary'],
  'functions/inspectionFirstOwnerOnboarding.ts': ['adminRecordOwnerMobilizationPaymentEvidence'],
  'functions/ownerInspectionCompletion.ts': ['adminRecordOwnerPropertyInspectionEvidence', 'adminCompleteOwnerPortfolioInspections'],
  'functions/ownerInspectionAdminLink.ts': ['adminCreateOwnerPortfolioPropertyInspection', 'adminLinkOwnerPropertyInspection'],
  'functions/contractActivation.ts': ['adminApproveContractActivation', 'adminRejectContractActivation'],
  'functions/paymentTransactionApproval.ts': ['adminApprovePayment', 'adminRejectPayment'],
};

// Admin-named exports whose files have no MFA check, with the reason they are exempt.
const EXEMPT = {
  mintAdminBridgeToken: 'N-30: unused bridge; its custom tokens carry no second factor and are now refused by MFA gates and rules',
  adminCompleteOwnerPortfolioInspections: 'canonical wrapper delegates to the MFA-gated ownerInspectionCompletion handler',
  syncAdminSummary: 'Firestore trigger, not a callable',
};
const MFA_MARKERS = /requirePrivilegedMfaSession|sign_in_second_factor|requireMfa|Mfa[A-Z]\w*\(/;

test('each covered privileged callable calls requirePrivilegedMfaSession before doing work', async () => {
  for (const [file, names] of Object.entries(COVERED)) {
    const source = await read(file);
    for (const name of names) {
      const start = source.search(new RegExp(`export const ${name}\\b`));
      assert.ok(start >= 0, `${file}: ${name} missing`);
      const head = source.slice(start, start + 700);
      assert.match(head, /await requirePrivilegedMfaSession\(request\.auth\);/, `${file}: ${name} must enforce server-side MFA`);
    }
  }
});

test('no new admin-named callable ships without a server-side MFA check', async () => {
  const files = (await readdir(new URL('functions/', root))).filter((name) => name.endsWith('.ts'));
  const missing = [];
  for (const file of files) {
    const source = await read(`functions/${file}`);
    if (MFA_MARKERS.test(source)) continue;
    for (const match of source.matchAll(/^export const (admin\w+|\w+Admin\w*)\b/gm)) {
      if (!EXEMPT[match[1]]) missing.push(`${file}: ${match[1]}`);
    }
  }
  assert.deepEqual(missing, [], `admin callables without MFA: ${missing.join(', ')}`);
});

test('the shared MFA helper requires a second factor and a live, enabled account', async () => {
  const helper = await read('functions/adminMfaSession.ts');
  assert.match(helper, /token\.firebase\?\.sign_in_second_factor/);
  assert.match(helper, /token\.email_verified !== true/);
  assert.match(helper, /admin\.auth\(\)\.getUser/);
  assert.match(helper, /user\.disabled/);
});

test('Firestore Admin-tier rules require a second factor', async () => {
  const rules = await read('firestore.rules');
  assert.match(rules, /function hasAdminSecondFactor\(\) \{[\s\S]*?sign_in_second_factor[\s\S]*?\n    \}/);
  assert.match(rules, /function hasAdminClaim\(\) \{\n      return signedIn\(\) && hasAdminSecondFactor\(\) && \(/);
});
