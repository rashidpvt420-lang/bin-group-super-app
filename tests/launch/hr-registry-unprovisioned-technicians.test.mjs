// The admin live map lists every technicians/* roster entry, but the HR Staff Registry only listed
// users with isStaff == true, so technicians created by a seed/script/legacy path (e.g. on the map
// but missing from HR) were silently omitted. The registry now shows them with a reason and lets
// Founder/Admin adopt eligible identities through an audited, MFA-gated callable.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const page = read('apps/admin-panel/src/pages/admin/HRManagementPage.tsx');
const panel = read('apps/admin-panel/src/pages/admin/UnprovisionedTechniciansPanel.tsx');
const lifecycle = read('functions/adminStaffLifecycle.ts');
const provisioning = read('functions/adminUserProvisioning.ts');
const completeness = read('apps/admin-panel/src/utils/hrReadCompleteness.ts');

test('registry read reports unprovisioned technicians instead of omitting them', () => {
  assert.ok(lifecycle.includes('unprovisionedTechnicians: gap.rows'));
  assert.ok(lifecycle.includes('db.collection("users").where("role", "==", "technician")'));
  assert.ok(lifecycle.includes('db.collection("technicians").limit(500)'));
  assert.ok(lifecycle.includes('const unavailable = gap.failed ? ["unprovisionedTechnicians"] : [];'), 'a failed gap read is reported, not hidden');
  assert.ok(completeness.includes("unprovisionedTechnicians: 'technicians missing from the staff registry'"));
  for (const reason of ['NOT_PROVISIONED_AS_STAFF', 'NO_USER_PROFILE', 'ROLE_MISMATCH']) assert.ok(lifecycle.includes(`"${reason}"`));
});

test('HR registry tab renders the gap and adoption is Founder/Admin only', () => {
  assert.ok(page.includes("setUnprovisionedTechnicians(Array.isArray(lifecycleResponse.data?.unprovisionedTechnicians) ? lifecycleResponse.data.unprovisionedTechnicians : []);"));
  assert.ok(page.includes('<UnprovisionedTechniciansPanel technicians={unprovisionedTechnicians} canAdopt={isProvisioningAdmin}'));
  assert.ok(panel.includes("httpsCallable(functions, 'adminAdoptTechnicianIntoStaffRegistry')({ uid: target.uid, reason: reason.trim() })"));
  assert.ok(panel.includes('canAdopt && tech.adoptable'));
  assert.ok(panel.includes('data-testid="hr-unprovisioned-technicians"'));
});

test('adoption is MFA-gated, audited and never invents HR data', () => {
  const body = provisioning.slice(provisioning.indexOf('export const adminAdoptTechnicianIntoStaffRegistry'));
  assert.ok(body.includes('await requireProvisioningAdmin(request);'));
  assert.ok(body.includes('await requirePrivilegedMfaSession(request.auth);'));
  assert.ok(body.includes('action: "ADMIN_ADOPT_TECHNICIAN_INTO_STAFF_REGISTRY"'));
  assert.ok(body.includes('employeeId: null, emiratesId: null'));
  assert.ok(!body.includes('salaryPackage'), 'no salary package is created');
  assert.ok(body.includes('if (user.isStaff === true) throw new HttpsError("already-exists"'));
  assert.ok(body.includes('claimsForAccess("technician", modules, permissions, suspended)'), 'role stays technician; suspension preserved');
  assert.ok(body.includes('await admin.auth().setCustomUserClaims(uid, previousClaims)'), 'claims restored if the write fails');
});
