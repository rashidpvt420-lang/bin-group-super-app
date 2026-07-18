import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const expectAll = (source, patterns, label) => {
  for (const pattern of patterns) assert.match(source, pattern, `${label}: missing ${pattern}`);
};

test('Admin contract closure is App Check and MFA protected', async () => {
  const source = await read('functions/secureAdminContractOperations.ts');
  expectAll(source, [
    /export const adminCloseContract = onCall/,
    /enforceAppCheck: true/,
    /multiFactor\?\.enrolledFactors/,
    /sign_in_second_factor/,
    /Admin MFA enrollment is required/,
    /verified Admin second-factor sign-in is required/,
    /CLOSURE_REASONS/,
    /note\.length < 8/,
  ], 'Admin contract closure security');
});

test('Contract closure transaction closes dependent operational state', async () => {
  const source = await read('functions/secureAdminContractOperations.ts');
  expectAll(source, [
    /db\.runTransaction/,
    /transaction\.get\(contractRef\)/,
    /transaction\.get\(renewalQuery\)/,
    /transaction\.get\(propertyQuery\)/,
    /contractStatus: "CLOSED"/,
    /renewalStatus: "TERMINATED"/,
    /dispatchReady: false/,
    /text\(ownerProfile\.activeContractId, 180\) === contractId/,
    /dashboardUnlocked: false/,
    /dashboardLocked: true/,
    /action: "ADMIN_CLOSE_CONTRACT_WITH_MFA"/,
    /noteHash: sha256\(note\)/,
    /sensitiveValuesExcluded: true/,
  ], 'Contract closure transaction');
});

test('Admin contract UI is callable-only, bilingual and route-specific', async () => {
  const [page, app, navigation, audit] = await Promise.all([
    read('apps/admin-panel/src/pages/admin/AdminContractControlPage.tsx'),
    read('apps/admin-panel/src/App.tsx'),
    read('apps/admin-panel/src/components/Navigation.tsx'),
    read('tests/e2e/launch-audit-admin.spec.ts'),
  ]);

  expectAll(page, [
    /httpsCallable\(functions, 'adminCloseContract'\)/,
    /data-testid="admin-contract-control"/,
    /admin-contract-note/,
    /admin-contract-reason/,
    /[\u0600-\u06FF]/,
    /direction: isRTL \? 'rtl' : 'ltr'/,
  ], 'Admin contract UI');
  assert.doesNotMatch(page, /\bupdateDoc\s*\(/);
  assert.doesNotMatch(page, /\baddDoc\s*\(/);
  assert.doesNotMatch(page, /\bsetDoc\s*\(/);

  assert.match(app, /import AdminContractControlPage/);
  assert.match(app, /path="\/contracts" element=\{<ProtectedRoute adminOnly><AdminContractControlPage \/><\/ProtectedRoute>\}/);
  assert.doesNotMatch(app, /ContractTerminationPage/);
  assert.match(navigation, /path: '\/contracts'/);
  assert.match(audit, /toHaveURL\(adminUrl\('\/contracts'\)\)/);
  assert.match(audit, /getByTestId\('admin-contract-control'\)/);
});

test('Secure Admin contract callable is explicitly exported', async () => {
  const runtime = await read('functions/runtime.ts');
  assert.match(runtime, /export \* from "\.\/secureAdminContractOperations";/);
});
