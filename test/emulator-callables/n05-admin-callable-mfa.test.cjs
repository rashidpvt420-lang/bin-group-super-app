'use strict';
// N-05 regression: privileged callables authorised Admin/HR/Finance/Ops sessions on claims alone.
// A non-enrolled, bridged (custom-token) or non-MFA Admin session could run payroll, HR, dispatch,
// dispute resolution, access-code reveal, reports and owner-inspection evidence callables.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, lib, createUser, clearFirestore, call } = require('./_setup.cjs');

const runtime = lib('runtimeAll.js');
const COVERED = [
  'adminGeneratePayrollBatch', 'adminSettlePayrollRecord',
  'adminGetHrOperations', 'adminRecordStaffAttendance', 'adminCreateStaffLeaveRequest', 'adminReviewStaffLeaveRequest', 'adminRegisterHrDocumentMetadata',
  'adminGetStaffLifecycle', 'adminGetStaffDetails', 'adminGetTechnicianOperationsDirectory', 'adminUpdateStaffProfile', 'adminUpdateStaffOnboarding', 'adminOffboardStaff', 'adminResendStaffInvitation',
  'adminAssignTechnician', 'adminResolveTicketDispute', 'adminUpdateEmergencyTicket', 'adminProcessWhatsAppIntake',
  'adminRevealScheduledServiceAccessCode', 'adminManageScheduledServiceAvailability', 'adminUpdateScheduledService',
  'adminResolveTenantUnitLink', 'adminResolveTenantCorrectionRequest', 'listAdminTenantCorrectionRequests',
  'getAdminReports', 'adminGetLaunchConfigurationSummary',
  'adminRecordOwnerMobilizationPaymentEvidence', 'adminRecordOwnerPropertyInspectionEvidence', 'adminCompleteOwnerPortfolioInspections',
  'adminCreateOwnerPortfolioPropertyInspection', 'adminLinkOwnerPropertyInspection',
  'adminRepairOrphanLinkage', 'adminRepairPropertyGeo',
  'adminApproveContractActivation', 'adminRejectContractActivation',
  'adminRecordTechnicianCredentials',
];
const MFA_ERROR = /multi-factor \(MFA\) session is required/;
const CLAIMS = { role: 'super_admin', admin: true, super_admin: true, superAdmin: true };

let noMfa;
let withMfa;
let disabledMfa;
test.before(async () => {
  noMfa = await createUser('admin_n05_nomfa', CLAIMS);
  withMfa = await createUser('admin_n05_mfa', CLAIMS, { tokenExtra: { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } } });
  disabledMfa = await createUser('admin_n05_disabled', CLAIMS, { tokenExtra: { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } } });
  await admin.auth().updateUser('admin_n05_disabled', { disabled: true });
});
test.beforeEach(clearFirestore);

async function outcome(name, actor) {
  try {
    await call(runtime[name], actor, {});
    return { ok: true };
  } catch (error) {
    return { ok: false, code: error?.code, message: String(error?.message || '') };
  }
}

for (const name of COVERED) {
  test(`${name} rejects an Admin session without a second factor`, async () => {
    assert.equal(typeof runtime[name]?.run, 'function', `${name} must be exported`);
    const result = await outcome(name, noMfa);
    assert.equal(result.ok, false, `${name} must not succeed without MFA`);
    assert.equal(result.code, 'permission-denied', `${name}: ${result.code} ${result.message}`);
    assert.match(result.message, MFA_ERROR, `${name}: ${result.message}`);
  });

  test(`${name} passes the MFA gate for an MFA session (then applies its own validation)`, async () => {
    const result = await outcome(name, withMfa);
    assert.doesNotMatch(result.message || '', MFA_ERROR, `${name}: ${result.message}`);
  });
}

test('an MFA token for a disabled Admin account is still refused', async () => {
  const result = await outcome('getAdminReports', disabledMfa);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'permission-denied');
});
