import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const staffPage = readFileSync('apps/admin-panel/src/pages/admin/StaffAccessPage.tsx', 'utf8');
const backend = readFileSync('functions/adminUserProvisioning.ts', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const hrPrivacyHardener = readFileSync('scripts/harden-hr-privacy-rules.mjs', 'utf8');

test('Staff Access UI is callable-only and fail-closed', () => {
  assert.match(staffPage, /httpsCallable\(functions, 'adminCreateUser'\)/);
  assert.match(staffPage, /httpsCallable\(functions, 'adminUpdateStaffAccess'\)/);
  assert.match(staffPage, /httpsCallable\(functions, 'adminSetStaffStatus'\)/);
  assert.doesNotMatch(staffPage, /setDoc\(/);
  assert.doesNotMatch(staffPage, /doc\(collection\(db, 'users'\)\)/);
  assert.doesNotMatch(staffPage, /Math\.random/);
  assert.doesNotMatch(staffPage, /tempPassword/);
  assert.doesNotMatch(staffPage, /value: 'admin'/);
  assert.match(staffPage, /failed request creates no fallback record/i);
});

test('staff provisioning backend rejects unsafe identity conversion and binds modules', () => {
  assert.match(backend, /const STAFF_ROLES/);
  assert.match(backend, /const PRIVILEGED_ADMIN_ROLES/);
  assert.match(backend, /async function assertNoExistingIdentity\(email: string\)/);
  assert.match(backend, /getUserByEmail\(email\)/);
  assert.match(backend, /Customer identities cannot be converted through Staff Access/);
  assert.match(backend, /Privileged or customer identities cannot be managed from Staff Access/);
  assert.match(backend, /previousClaims/);
  assert.match(backend, /claimsForAccess\(role, modules, permissions, false\)/);
  assert.match(backend, /setCustomUserClaims\(uid, claimsForAccess/);
  assert.match(backend, /staffModules: modules/);
  assert.match(backend, /permissions/);
  assert.match(backend, /admin: false/);
  assert.doesNotMatch(backend, /payload\.tempPassword/);
  assert.doesNotMatch(backend, /payload\.initialPassword/);
});

test('identity uniqueness is enforced before Auth creation and registries are create-only', () => {
  const uniquenessCheck = backend.indexOf('await assertNoExistingIdentity(email);');
  const authCreation = backend.indexOf('admin.auth().createUser', uniquenessCheck);
  assert.ok(uniquenessCheck >= 0, 'identity uniqueness check must be present');
  assert.ok(authCreation > uniquenessCheck, 'identity uniqueness must be verified before Firebase Auth creation');

  assert.match(backend, /tx\.create\(db\.collection\("users"\)\.doc\(uid\), operationalProfile\)/);
  assert.match(backend, /tx\.create\(db\.collection\("staffAccess"\)\.doc\(uid\)/);
  assert.match(backend, /tx\.create\(db\.collection\("hrProfiles"\)\.doc\(uid\), scheduleProfile\)/);
  assert.match(backend, /tx\.create\(db\.collection\("private_hr_profiles"\)\.doc\(uid\), privateHrProfile\)/);
  assert.doesNotMatch(backend, /tx\.set\(db\.collection\("users"\)\.doc\(uid\)/);
});

test('private HR data is kept out of operational staff and technician records', () => {
  assert.match(backend, /const privateHrProfile = \{/);
  assert.match(backend, /db\.collection\("private_hr_profiles"\)\.doc\(uid\)/);
  assert.match(backend, /emailHash: hashValue\(email\)/);
  assert.match(backend, /salaryPackage/);
  assert.match(backend, /accessClassification: "PRIVATE_HR_SERVER_ONLY"/);
  assert.match(backend, /privateHrSeparated: true/);

  const operationalStart = backend.indexOf('const operationalProfile = {');
  const operationalEnd = backend.indexOf('    };', operationalStart);
  assert.ok(operationalStart >= 0 && operationalEnd > operationalStart, 'operational profile block must be present');
  const operationalProfile = backend.slice(operationalStart, operationalEnd);
  assert.doesNotMatch(operationalProfile, /employeeId|emiratesId|basicSalary|housingAllowance|transportAllowance|foodAllowance|salaryPackage/);
});

test('HR profile privacy hardening is part of rules preparation', () => {
  assert.equal(packageJson.scripts['harden:hr-privacy'], 'node scripts/harden-hr-privacy-rules.mjs');
  assert.match(packageJson.scripts['prepare:rules'], /harden:hr-privacy/);
  assert.match(hrPrivacyHardener, /allow read: if isHrManagerTier\(\) \|\| \(signedIn\(\) && request\.auth\.uid == profileId\);/);
  const hardenedStart = hrPrivacyHardener.indexOf('const hardened =');
  const hardenedEnd = hrPrivacyHardener.indexOf('`;', hardenedStart);
  const hardenedRuleBlock = hrPrivacyHardener.slice(hardenedStart, hardenedEnd);
  assert.ok(hardenedStart >= 0 && hardenedEnd > hardenedStart);
  assert.doesNotMatch(hardenedRuleBlock, /isOps\(\)|isFinance\(\)|staffCanRead/);
});
