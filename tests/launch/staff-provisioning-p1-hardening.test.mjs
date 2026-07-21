import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [backend, ui, packageJson, firestoreHardener, storageHardener] = await Promise.all([
  readFile(new URL('../../functions/adminUserProvisioning.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../apps/admin-panel/src/pages/admin/StaffAccessPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../../scripts/harden-private-hr-authority.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../scripts/harden-private-hr-storage.mjs', import.meta.url), 'utf8'),
]);

function block(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  assert.ok(start >= 0, `missing block start: ${startToken}`);
  const end = source.indexOf(endToken, start);
  assert.ok(end > start, `missing block end: ${endToken}`);
  return source.slice(start, end);
}

test('Admin Staff Access UI has no ghost-account or client-password path', () => {
  assert.doesNotMatch(ui, /\bsetDoc\b|\bupdateDoc\b|\bdeleteDoc\b|\bserverTimestamp\b/);
  assert.doesNotMatch(ui, /Math\.random|tempPassword|initialPassword|manual(?:ly)? create.*Auth/i);
  assert.doesNotMatch(ui, /value:\s*['"]admin['"]/);
  assert.match(ui, /httpsCallable\(functions, 'adminCreateUser'\)/);
  assert.match(ui, /httpsCallable\(functions, 'adminUpdateStaffAccess'\)/);
  assert.match(ui, /httpsCallable\(functions, 'adminSetStaffStatus'\)/);
});

test('role selection is least privilege and matches server module ceilings', () => {
  assert.match(ui, /ROLE_ALLOWED_MODULES/);
  assert.match(ui, /selectableModules/);
  assert.match(ui, /Technicians use the Technician portal and receive no Admin-panel modules/);
  assert.match(backend, /ROLE_ALLOWED_MODULES/);
  assert.match(backend, /permissions are server-derived from the selected modules/);
  assert.match(backend, /Module \$\{moduleKey\} is not allowed for role \$\{role\}/);
  assert.doesNotMatch(backend, /normalizePermissions\([^)]*rawPermissions/);
});

test('existing customer or privileged identities cannot be converted into staff', () => {
  assert.match(backend, /assertNoExistingIdentity/);
  assert.match(backend, /An authentication identity already exists for this email/);
  assert.match(backend, /A profile already exists for this email/);
  assert.doesNotMatch(backend, /Existing staff account updated and a fresh secure invitation/);
  assert.doesNotMatch(backend, /createdAuthUser\s*=\s*false/);
});

test('sensitive employment data is absent from operational and scheduling profiles', () => {
  const operational = block(backend, 'const operationalProfile = {', 'const scheduleProfile = {');
  const schedule = block(backend, 'const scheduleProfile = {', 'const privateHrProfile = {');
  const technician = block(backend, 'if (role === "technician") {', 'tx.create(invitationRef');

  for (const publicBlock of [operational, schedule, technician]) {
    assert.doesNotMatch(publicBlock, /emiratesId|employeeId|salaryPackage|basicSalary|housingAllowance|transportAllowance|foodAllowance|otherAllowance|salaryGrade/);
  }

  const privateHr = block(backend, 'const privateHrProfile = {', 'await db.runTransaction');
  assert.match(privateHr, /emiratesId/);
  assert.match(privateHr, /employeeId/);
  assert.match(privateHr, /salaryPackage/);
  assert.match(privateHr, /PRIVATE_HR_SERVER_ONLY/);
  assert.match(backend, /db\.collection\("private_hr_profiles"\)/);
});

test('direct Firestore profile edits cannot grant claims', () => {
  const trigger = backend.slice(backend.indexOf('export const syncStaffCustomClaims'));
  assert.match(trigger, /afterStatus !== "SUSPENDED"/);
  assert.match(trigger, /suspended:\s*true/);
  assert.doesNotMatch(trigger, /permissionsForModules|normalizeModules|primaryRole:\s*role|modules,|staffModules:\s*modules/);
});

test('private HR Firestore and Storage boundaries are canonical pipeline steps', () => {
  const scripts = JSON.parse(packageJson).scripts;
  assert.equal(scripts['harden:private-hr-firestore'], 'node scripts/harden-private-hr-authority.mjs');
  assert.equal(scripts['harden:private-hr-storage'], 'node scripts/harden-private-hr-storage.mjs');
  assert.match(scripts['prepare:rules'], /harden:final-firestore-authority.*harden:private-hr-firestore.*harden:private-hr-storage/);

  assert.match(firestoreHardener, /match \/private_hr_profiles\/\{profileId\}/);
  assert.match(firestoreHardener, /allow read, write: if false/);
  assert.match(firestoreHardener, /'private_hr_profiles'/);

  assert.match(storageHardener, /match \/privateHrDocuments\/\{staffId\}\/\{allPaths=\*\*\}/);
  assert.match(storageHardener, /allow read, write: if false/);
  const hrHelper = block(storageHardener, 'const hardenedHrRole', 'if (source.includes');
  assert.doesNotMatch(hrHelper, /finance_admin|finance_staff|account_manager/);
});

test('suspension disables Auth and revokes all refresh tokens', () => {
  const statusCallable = block(backend, 'export const adminSetStaffStatus', '// Fail-safe only');
  assert.match(statusCallable, /updateUser\(uid, \{ disabled: suspended \}\)/);
  assert.match(statusCallable, /revokeRefreshTokens\(uid\)/);
  assert.match(statusCallable, /ADMIN_SUSPEND_STAFF_USER/);
  assert.match(statusCallable, /ADMIN_RESTORE_STAFF_USER/);
  assert.match(statusCallable, /setCustomUserClaims\(uid, previousClaims\)/);
});
