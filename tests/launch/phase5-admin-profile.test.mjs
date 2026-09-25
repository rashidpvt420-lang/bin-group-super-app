import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Phase 5 Admin surface inventory remains protected', async () => {
  const app = await read('apps/admin-panel/src/App.tsx');
  const requiredRoutes = [
    '/dashboard', '/owners', '/tenants', '/unit-links', '/tickets', '/technicians',
    '/payments', '/broker', '/document-vault', '/audit', '/reports', '/settings',
    '/profile', '/mfa-recovery', '/contracts', '/ops/public-launch-command',
    '/ops/technicians', '/ops/rfq', '/ops/vendors', '/ops/data-governance',
  ];
  for (const route of requiredRoutes) {
    assert.ok(app.includes(`path="${route}"`) || app.includes(`path='${route}'`), `Missing Admin route ${route}`);
  }
  assert.match(app, /<ProtectedRoute/);
});

test('Admin authentication requires claim authority and MFA without profile or email bootstrap privilege', async () => {
  const [authContext, protectedRoute, policy] = await Promise.all([
    read('apps/admin-panel/src/context/AuthContext.tsx'),
    read('apps/admin-panel/src/components/ProtectedRoute.tsx'),
    read('apps/admin-panel/src/security/staffAccessPolicy.ts'),
  ]);
  assert.match(authContext, /getIdTokenResult/);
  assert.match(authContext, /sign_in_second_factor/);
  assert.match(authContext, /getIdToken\(true\)/);
  assert.match(authContext, /ADMIN_AUTH_IDENTITY_CHANGED_DURING_CALLABLE_RETRY|identity/i);
  assert.doesNotMatch(authContext, /ceo@bin-groups\.com[\s\S]{0,240}(grant|admin\s*=\s*true|role:\s*['"]admin)/i);
  assert.match(protectedRoute, /mfa/i);
  assert.match(policy, /canAccessAdminPath/);
});

test('legacy local Admin grant and automatic claim repair entrypoints are retired fail-closed', async () => {
  const [repair, grant, publicRole, bridge] = await Promise.all([
    read('scripts/repair-admin-claims.mjs'),
    read('scripts/grant-admin.mjs'),
    read('functions/publicRoleAssignment.ts'),
    read('functions/adminBridgeAuth.ts'),
  ]);
  assert.match(repair, /REFUSED/);
  assert.match(repair, /process\.exit\(1\)/);
  assert.doesNotMatch(repair, /setCustomUserClaims/);
  assert.match(grant, /REFUSED/);
  assert.match(grant, /process\.exit\(1\)/);
  assert.doesNotMatch(grant, /setCustomUserClaims|createUser\(/);
  assert.match(publicRole, /PUBLIC_ROLES = new Set\(\["owner", "tenant", "technician", "broker"\]\)/);
  assert.doesNotMatch(publicRole, /PUBLIC_ROLES[\s\S]{0,120}["']admin["']/);
  assert.match(bridge, /enforceAppCheck:\s*true/);
  assert.match(bridge, /createCustomToken\(authContext\.uid\)/);
  assert.doesNotMatch(bridge, /createCustomToken\([^)]*,/);
});

test('Admin mutations are server-authorized with Firebase identity, MFA, App Check and audit evidence', async () => {
  const [authority, runtime, firebase] = await Promise.all([
    read('functions/adminAuthorizedFirestoreMutation.ts'),
    read('functions/runtime.ts'),
    read('apps/admin-panel/src/lib/firebase.ts'),
  ]);
  assert.match(runtime, /adminAuthorizedFirestoreMutation/);
  assert.match(authority, /enforceAppCheck:\s*true/);
  assert.match(authority, /admin\.auth\(\)\.getUser\(auth\.uid\)/);
  assert.match(authority, /emailVerified/);
  assert.match(authority, /multiFactor\?\.enrolledFactors/);
  assert.match(authority, /sign_in_second_factor/);
  assert.match(authority, /ADMIN_SERVER_AUTHORIZED_MUTATION/);
  assert.match(authority, /batch\.create\(db\.collection\("audit_logs"\)\.doc\(\)/);
  assert.match(authority, /PRIVILEGE_FIELDS/);
  assert.match(firebase, /adminAuthorizedFirestoreMutation/);
  assert.match(firebase, /const setDoc:[\s\S]*runAdminMutation/);
  assert.match(firebase, /const updateDoc:[\s\S]*runAdminMutation/);
  assert.match(firebase, /const deleteDoc:[\s\S]*runAdminMutation/);
  assert.match(firebase, /const writeBatch:[\s\S]*runAdminMutation/);
});

test('launch evidence is immutable browser-side and manual server evidence cannot impersonate CI proof', async () => {
  const [authority, rules] = await Promise.all([
    read('functions/adminAuthorizedFirestoreMutation.ts'),
    read('firestore.rules'),
  ]);
  assert.match(authority, /parsed\.root === "launch_evidence" \|\| parsed\.root === "signed_in_smoke_checks"/);
  assert.match(authority, /Canonical founder MFA authority is required for launch evidence/);
  assert.match(authority, /source[\s\S]*github-actions/);
  assert.match(authority, /executionGenerated === true/);
  assert.match(authority, /hardLaunchClaim === true/);
  assert.match(authority, /\^\[a-f0-9\]\{40\}\$/);
  assert.match(rules, /match \/launch_evidence\/\{evidenceId\}[\s\S]*allow create, update, delete: if false/);
  assert.match(rules, /match \/signed_in_smoke_checks\/\{checkId\}[\s\S]*allow create, update, delete: if false/);
});

test('Admin browser cannot directly mutate identity, contracts or canonical properties', async () => {
  const rules = await read('firestore.rules');
  assert.match(rules, /match \/users\/\{userId\}[\s\S]*allow create: if safeUserBootstrapCreate\(request\.resource\.data, userId\)[\s\S]*allow update: if isNotSuspended\(\) && safeUserSelfUpdate\(userId\)[\s\S]*allow delete: if false/);
  assert.match(rules, /match \/tenants\/\{tenantId\}[\s\S]*allow create, update, delete: if false/);
  assert.match(rules, /match \/contracts\/\{contractId\}[\s\S]*allow create: if ownerContractDraftCreate\(request\.resource\.data\)[\s\S]*allow update: if safeOwnerContractUpdate\(\)[\s\S]*allow delete: if false/);
  assert.match(rules, /match \/properties\/\{propertyId\}[\s\S]*allow create: if isNotSuspended\(\) && safeOwnerPropertyCreate\(request\.resource\.data\)[\s\S]*allow update: if isNotSuspended\(\) && safeOwnerPropertyUpdate\(\)[\s\S]*allow delete: if false/);
});

test('canonical Admin geo verification and contract closure use dedicated protected callables', async () => {
  const [geoPage, authority, contractPage, contractFn] = await Promise.all([
    read('apps/admin-panel/src/pages/admin/GeoRepairCommandCenter.tsx'),
    read('functions/adminAuthorizedFirestoreMutation.ts'),
    read('apps/admin-panel/src/pages/admin/ContractTerminationPage.tsx'),
    read('functions/secureAdminContractOperations.ts'),
  ]);
  assert.match(geoPage, /adminRepairPropertyGeo/);
  assert.doesNotMatch(geoPage, /writeBatch\(/);
  assert.match(authority, /export const adminRepairPropertyGeo = onCall/);
  assert.match(authority, /ADMIN_PROPERTY_GEO_REPAIRED/);
  assert.match(authority, /dispatchReady: property\.dispatchReady === true/);
  assert.match(contractPage, /adminCloseContract/);
  assert.doesNotMatch(contractPage, /updateDoc\(doc\(db, 'contracts'/);
  assert.match(contractFn, /enforceAppCheck:\s*true/);
  assert.match(contractFn, /requireMfaAdmin/);
  assert.match(contractFn, /audit_logs/);
});
