import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const staffPage = readFileSync('apps/admin-panel/src/pages/admin/StaffAccessPage.tsx', 'utf8');
const backend = readFileSync('functions/adminUserProvisioning.ts', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const hrPrivacyHardener = readFileSync('scripts/harden-hr-privacy-rules.mjs', 'utf8');
const privateHrHardener = readFileSync('scripts/harden-private-hr-authority.mjs', 'utf8');

function sourceBlock(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  assert.ok(start >= 0, `missing ${startToken}`);
  const end = source.indexOf(endToken, start);
  assert.ok(end > start, `missing ${endToken}`);
  return source.slice(start, end);
}

test('Staff Access UI is callable-only and fail-closed', () => {
  assert.match(staffPage, /httpsCallable\(functions, 'adminCreateUser'\)/);
  assert.match(staffPage, /httpsCallable\(functions, 'adminUpdateStaffAccess'\)/);
  assert.match(staffPage, /httpsCallable\(functions, 'adminSetStaffStatus'\)/);
  assert.doesNotMatch(staffPage, /setDoc\(|updateDoc\(|deleteDoc\(/, 'UI must not mutate staff records directly');
  assert.doesNotMatch(staffPage, /Math\.random|tempPassword|initialPassword/, 'UI must not generate or transmit passwords');
  assert.doesNotMatch(staffPage, /value: 'admin'/, 'General Staff Access must not offer privileged Admin creation');
  assert.match(staffPage, /a failed request creates no fallback record/i);
});

test('staff provisioning rejects every existing identity and binds server-derived modules', () => {
  assert.match(backend, /assertNoExistingIdentity/);
  assert.match(backend, /An authentication identity already exists for this email/);
  assert.match(backend, /A profile already exists for this email/);
  assert.match(backend, /ROLE_ALLOWED_MODULES/);
  assert.match(backend, /permissionsForModules/);
  assert.match(backend, /staffModules: modules/);
  assert.match(backend, /admin: false/);
  assert.match(backend, /Client-supplied passwords are prohibited/);
  assert.match(backend, /setCustomUserClaims\(uid, previousClaims\)/);
});

test('private HR data is kept out of operational staff and technician records', () => {
  const operational = sourceBlock(backend, 'const operationalProfile = {', 'const scheduleProfile = {');
  const schedule = sourceBlock(backend, 'const scheduleProfile = {', 'const privateHrProfile = {');
  const privateHr = sourceBlock(backend, 'const privateHrProfile = {', 'await db.runTransaction');

  for (const publicBlock of [operational, schedule]) {
    assert.doesNotMatch(publicBlock, /emiratesId|employeeId|salaryPackage|basicSalary|housingAllowance|salaryGrade/);
  }
  assert.match(privateHr, /emiratesId/);
  assert.match(privateHr, /employeeId/);
  assert.match(privateHr, /salaryPackage/);
  assert.match(privateHr, /PRIVATE_HR_SERVER_ONLY/);
  assert.match(backend, /db\.collection\("private_hr_profiles"\)/);
});

test('HR profile and private HR authority hardening are part of rules preparation', () => {
  assert.equal(packageJson.scripts['harden:hr-privacy'], 'node scripts/harden-hr-privacy-rules.mjs');
  assert.equal(packageJson.scripts['harden:private-hr-firestore'], 'node scripts/harden-private-hr-authority.mjs');
  assert.match(packageJson.scripts['prepare:rules'], /harden:hr-privacy.*harden:final-firestore-authority.*harden:private-hr-firestore/);

  const hardenedDefinition = sourceBlock(hrPrivacyHardener, 'const hardened =', 'if (source.includes');
  assert.match(hardenedDefinition, /allow read: if isHrManagerTier\(\) \|\| \(signedIn\(\) && request\.auth\.uid == profileId\);/);
  assert.doesNotMatch(hardenedDefinition, /isFinance\(\)|isOps\(\)|staffCanRead/);
  assert.match(privateHrHardener, /match \/private_hr_profiles\/\{profileId\}/);
  assert.match(privateHrHardener, /allow read, write: if false/);
});
