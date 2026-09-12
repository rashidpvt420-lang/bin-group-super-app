import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const provisioning = fs.readFileSync('functions/adminUserProvisioning.ts', 'utf8');
const staffAccess = fs.readFileSync('apps/admin-panel/src/pages/admin/StaffAccessPage.tsx', 'utf8');
const hrCommand = fs.readFileSync('apps/admin-panel/src/pages/admin/HRManagementPage.tsx', 'utf8');

const repairStart = provisioning.indexOf('export const adminRepairIncompleteTechnicianProfile');
const repairEnd = provisioning.indexOf('export const adminCreateUser', repairStart);
assert.ok(repairStart >= 0 && repairEnd > repairStart, 'protected Technician repair callable must have stable source boundaries');
const repairCallable = provisioning.slice(repairStart, repairEnd);

const assessmentStart = provisioning.indexOf('function technicianRepairAssessment');
const assessmentEnd = provisioning.indexOf('export const adminRepairIncompleteTechnicianProfile', assessmentStart);
assert.ok(assessmentStart >= 0 && assessmentEnd > assessmentStart, 'Technician repair assessment must have stable source boundaries');
const assessment = provisioning.slice(assessmentStart, assessmentEnd);

test('Technician profile repair is Founder/Admin and App Check protected', () => {
  assert.match(repairCallable, /onCall\(\{[^}]*region:\s*["']europe-west3["'][^}]*enforceAppCheck:\s*true/);
  assert.match(repairCallable, /requireProvisioningAdmin\(request\)/);
  assert.match(provisioning, /REPAIR_INCOMPLETE_TECHNICIAN_PROFILE_BIN_GROUP/);
  assert.match(repairCallable, /execute\s*&&\s*confirmation\s*!==\s*TECHNICIAN_PROFILE_REPAIR_CONFIRMATION/);
  assert.match(repairCallable, /payload\.email\s*!==\s*undefined/);
  assert.match(repairCallable, /identity, role and claims are server-derived/);
});

test('repair preserves Firebase Auth UID and custom claims', () => {
  assert.match(repairCallable, /admin\.auth\(\)\.getUser\(uid\)/);
  assert.match(repairCallable, /authUidPreserved:\s*true/);
  assert.match(repairCallable, /authClaimsPreserved:\s*true/);
  assert.doesNotMatch(repairCallable, /setCustomUserClaims\s*\(/);
  assert.doesNotMatch(repairCallable, /updateUser\s*\(/);
  assert.doesNotMatch(repairCallable, /deleteUser\s*\(/);
});

test('repair fails closed for privileged, conflicting, verified, active or over-permissioned identities', () => {
  assert.match(assessment, /hasPrivilegedTargetClaims\(claims\)/);
  assert.match(assessment, /duplicateIds\.length\s*>\s*0/);
  assert.match(assessment, /authUser\.emailVerified/);
  assert.match(assessment, /status\s*!==\s*["']INVITED["']/);
  assert.match(assessment, /access\.active\s*===\s*true/);
  assert.match(assessment, /technician\.available\s*===\s*true/);
  assert.match(assessment, /claims\.suspended\s*!==\s*true/);
  assert.match(assessment, /hasGrantedPermissions/);
  assert.match(assessment, /unexpected Admin modules or permissions/);
});

test('all canonical Technician documents and the audit event repair atomically', () => {
  assert.match(repairCallable, /db\.runTransaction\(async\s*\(tx\)\s*=>/);
  for (const ref of ['userRef', 'accessRef', 'hrRef', 'privateRef', 'technicianRef']) {
    assert.match(repairCallable, new RegExp(`tx\\.get\\(${ref}\\)`));
    assert.match(repairCallable, new RegExp(`tx\\.set\\(${ref}`));
  }
  assert.match(repairCallable, /tx\.get\(duplicateQuery\)/);
  assert.match(repairCallable, /tx\.create\(db\.collection\(["']audit_logs["']\)\.doc\(\)/);
  assert.match(repairCallable, /ADMIN_REPAIR_INCOMPLETE_TECHNICIAN_PROFILE/);
  assert.match(repairCallable, /repairedComponents:\s*assessment\.missingComponents/);
});

test('same canonical profile is idempotent and does not create a second audit write', () => {
  assert.match(repairCallable, /if\s*\(!assessment\.repairRequired\)\s*\{\s*return\s*\{\s*repaired:\s*false/);
  assert.match(repairCallable, /repairRequired:\s*false/);
  assert.match(repairCallable, /invitationQueued:\s*false/);
});

test('private HR repair persists only the email hash and never queues credentials or mail', () => {
  const privateWriteStart = repairCallable.indexOf('tx.set(privateRef');
  const privateWriteEnd = repairCallable.indexOf('tx.set(technicianRef', privateWriteStart);
  assert.ok(privateWriteStart >= 0 && privateWriteEnd > privateWriteStart);
  const privateWrite = repairCallable.slice(privateWriteStart, privateWriteEnd);
  assert.match(privateWrite, /emailHash:\s*assessment\.emailHash/);
  assert.doesNotMatch(privateWrite, /\bemail\s*:/);
  assert.doesNotMatch(repairCallable, /generateEmailVerificationLink|generatePasswordResetLink|collection\(["']mail["']\)/);
  assert.doesNotMatch(repairCallable, /passwordResetLink|verificationLink|initialPassword|tempPassword/);
});

test('HR Staff Access uses an explicit review then execute repair flow', () => {
  assert.match(staffAccess, /adminRepairIncompleteTechnicianProfile/);
  assert.match(staffAccess, /repairProfile\(\{\s*uid:\s*member\.id,\s*execute:\s*false\s*\}\)/);
  assert.match(staffAccess, /window\.confirm\s*\(/);
  assert.match(staffAccess, /execute:\s*true/);
  assert.match(staffAccess, /confirmation:\s*TECHNICIAN_PROFILE_REPAIR_CONFIRMATION/);
  assert.match(staffAccess, /Auth UID and custom claims will be preserved/);
  assert.match(staffAccess, /No invitation is sent by this repair/);
  assert.match(staffAccess, /window\.dispatchEvent\(new Event\(STAFF_LIFECYCLE_CHANGED_EVENT\)\)/);
  assert.match(hrCommand, /window\.addEventListener\(["']bin-group:staff-lifecycle-changed["'],\s*refreshLifecycle\)/);
  assert.match(hrCommand, /window\.removeEventListener\(["']bin-group:staff-lifecycle-changed["'],\s*refreshLifecycle\)/);
  assert.match(hrCommand, /<StaffAccessPage\s*\/>/);
});
