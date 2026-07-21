import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const [backend, page, policy, protectedRoute, navigation, privateHrHardener, packageJson] = await Promise.all([
  read('functions/adminUserProvisioning.ts'),
  read('apps/admin-panel/src/pages/admin/StaffAccessPage.tsx'),
  read('apps/admin-panel/src/security/staffAccessPolicy.ts'),
  read('apps/admin-panel/src/components/ProtectedRoute.tsx'),
  read('apps/admin-panel/src/components/Navigation.tsx'),
  read('scripts/harden-hr-privacy-rules.mjs'),
  read('package.json'),
]);

test('staff and technician provisioning queues secure first-login invitations', () => {
  assert.match(backend, /generateEmailVerificationLink\s*\(/);
  assert.match(backend, /generatePasswordResetLink\s*\(/);
  assert.match(backend, /db\.collection\("mail"\)\.doc\(\)/);
  assert.match(backend, /staff-account-invitation-v1/);
  assert.match(backend, /delivery:\s*\{\s*state:\s*"QUEUED"\s*\}/);
  assert.match(backend, /role === "technician"[\s\S]*login\?role=technician/);
  assert.match(backend, /bin-group-admin-panel\.web\.app/);
  assert.match(backend, /createdAuthUser && !queueInvitation/);
});

test('Admin Staff Access is fail-closed with no ghost record or browser password', () => {
  assert.match(page, /httpsCallable\(functions, 'adminCreateUser'\)/);
  assert.match(page, /modules:\s*formData\.role === 'technician' \? \[\] : formData\.modules/);
  assert.match(page, /sendInvitation:\s*!editMode/);
  assert.match(page, /provisioning failures create no fallback record/i);
  assert.doesNotMatch(page, /\bsetDoc\s*\(/);
  assert.doesNotMatch(page, /Math\.random\s*\(/);
  assert.doesNotMatch(page, /tempPassword|Temporary Password|create Firebase Auth manually|PENDING_LOGIN/);
  assert.doesNotMatch(policy, /value:\s*'admin'/);
});

test('backend rejects identity conversion and restores existing claims on failure', () => {
  assert.match(backend, /existingIsStaff/);
  assert.match(backend, /PRIVILEGED_ADMIN_ROLES\.has\(existingRole\)/);
  assert.match(backend, /"already-exists"/);
  assert.match(backend, /customer and Founder\/Admin accounts cannot be converted here/i);
  assert.match(backend, /previousClaims/);
  assert.match(backend, /setCustomUserClaims\(uid, previousClaims\)/);
  assert.match(backend, /deleteUser\(uid\)/);
  assert.match(backend, /password:\s*generatedPassword\(\)/);
  assert.match(backend, /randomBytes\(24\)\.toString\("base64url"\)/);
  assert.doesNotMatch(backend, /payload\.(tempPassword|initialPassword|password)/);
});

test('selected modules and derived permissions are canonical across claims and registries', () => {
  assert.match(backend, /const modules = normalizeModules\(payload\.modules, role\)/);
  assert.match(backend, /const permissions = permissionsForModules\(modules\)/);
  assert.match(backend, /const customClaims = \{[\s\S]*modules,[\s\S]*permissions,/);
  assert.match(backend, /staffModules:\s*modules/);
  assert.match(backend, /db\.collection\("staffAccess"\)[\s\S]*modules,[\s\S]*permissions,/);
  assert.match(policy, /moduleForAdminPath/);
  assert.match(policy, /canAccessAdminPath/);
  assert.match(policy, /FULL_ADMIN_ROLES = new Set\(\['admin', 'super_admin', 'ceo'\]\)/);
  assert.match(protectedRoute, /canAccessAdminPath\(user, location\.pathname\)/);
  assert.doesNotMatch(protectedRoute, /user\?\.isAdmin/);
  assert.match(navigation, /primaryMenu\.filter\(\(item\) => canAccessAdminPath\(user, item\.path\)\)/);
  assert.match(navigation, /managementMenu\.filter\(\(item\) => canAccessAdminPath\(user, item\.path\)\)/);
});

test('salary and Emirates ID remain in private HR records only', () => {
  const userWriteStart = backend.indexOf('tx.set(db.collection("users").doc(uid)');
  const accessWriteStart = backend.indexOf('tx.set(db.collection("staffAccess").doc(uid)', userWriteStart);
  const userWrite = backend.slice(userWriteStart, accessWriteStart);
  assert.ok(userWriteStart >= 0 && accessWriteStart > userWriteStart);
  assert.doesNotMatch(userWrite, /salaryPackage|emiratesId|employeeId/);

  const technicianWriteStart = backend.indexOf('tx.set(db.collection("technicians").doc(uid)');
  const invitationWriteStart = backend.indexOf('if (invitationRef && invitationMessage)', technicianWriteStart);
  const technicianWrite = backend.slice(technicianWriteStart, invitationWriteStart);
  assert.ok(technicianWriteStart >= 0 && invitationWriteStart > technicianWriteStart);
  assert.doesNotMatch(technicianWrite, /salaryPackage|emiratesId|employeeId/);

  assert.match(backend, /const privateHrProfile = \{[\s\S]*employeeId:[\s\S]*emiratesId:[\s\S]*salaryPackage,/);
  assert.match(backend, /db\.collection\("hrProfiles"\)\.doc\(uid\), privateHrProfile/);
  assert.match(privateHrHardener, /allow read: if isHrManagerTier\(\) \|\| \(signedIn\(\) && request\.auth\.uid == profileId\);/);
  const hardenedStart = privateHrHardener.indexOf('const hardened =');
  const hardenedEnd = privateHrHardener.indexOf('`;', hardenedStart);
  const hardenedRuleBlock = privateHrHardener.slice(hardenedStart, hardenedEnd);
  assert.ok(hardenedStart >= 0 && hardenedEnd > hardenedStart);
  assert.doesNotMatch(hardenedRuleBlock, /isOps\(\)|isFinance\(\)|staffCanRead/);
  assert.match(packageJson, /"harden:hr-privacy": "node scripts\/harden-hr-privacy-rules\.mjs"/);
  assert.match(packageJson, /npm run harden:hr-privacy && npm run harden:final-firestore-authority/);
});

test('invitation audit records provenance without bearer links or private HR values', () => {
  assert.match(backend, /ADMIN_CREATE_STAFF_USER/);
  assert.match(backend, /invitationMailId:\s*invitationRef\?\.id \|\| null/);
  const auditStart = backend.indexOf('action: createdAuthUser ? "ADMIN_CREATE_STAFF_USER"');
  const auditEnd = backend.indexOf('createdAt: now,', auditStart);
  const auditBlock = backend.slice(auditStart, auditEnd);
  assert.doesNotMatch(auditBlock, /passwordResetLink|emailVerificationLink|emiratesId|salaryPackage/);
});
