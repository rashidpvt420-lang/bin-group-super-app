import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const staffPage = readFileSync('apps/admin-panel/src/pages/admin/StaffAccessPage.tsx', 'utf8');
const backend = readFileSync('functions/adminUserProvisioning.ts', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const hrPrivacyHardener = readFileSync('scripts/harden-hr-privacy-rules.mjs', 'utf8');

test('Staff Access UI is callable-only and fail-closed', () => {
  assert.match(staffPage, /httpsCallable\(functions, 'adminCreateUser'\)/);
  assert.doesNotMatch(staffPage, /setDoc\(/);
  assert.doesNotMatch(staffPage, /doc\(collection\(db, 'users'\)\)/);
  assert.doesNotMatch(staffPage, /Math\.random/);
  assert.doesNotMatch(staffPage, /tempPassword/);
  assert.doesNotMatch(staffPage, /value: 'admin'/);
  assert.match(staffPage, /provisioning failures create no fallback record/i);
});

test('staff provisioning backend rejects unsafe identity conversion and binds modules', () => {
  assert.match(backend, /CUSTOMER_ROLES/);
  assert.match(backend, /already belongs to a non-staff or privileged identity/);
  assert.match(backend, /previousClaims/);
  assert.match(backend, /setCustomUserClaims\(uid, \{/);
  assert.match(backend, /staffModules: modules/);
  assert.match(backend, /permissions/);
  assert.match(backend, /admin: false/);
  assert.doesNotMatch(backend, /payload\.tempPassword/);
  assert.doesNotMatch(backend, /payload\.initialPassword/);
});

test('private HR data is kept out of operational staff and technician records', () => {
  assert.match(backend, /privateHrRecord: true/);
  assert.match(backend, /operationalFieldDeletes\(\)/);
  assert.match(backend, /tx\.set\(db\.collection\("users"\)\.doc\(uid\), \{[\s\S]*operationalFieldDeletes\(\)/);
  assert.match(backend, /tx\.set\(db\.collection\("technicians"\)\.doc\(uid\), \{[\s\S]*operationalFieldDeletes\(\)/);
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
