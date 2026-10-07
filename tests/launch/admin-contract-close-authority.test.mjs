import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Admin contract closure surfaces use the protected server callable only', async () => {
  const [control, transactions, backend, runtime] = await Promise.all([
    read('apps/admin-panel/src/pages/admin/ContractTerminationPage.tsx'),
    read('apps/admin-panel/src/pages/financials/TransactionsPage.tsx'),
    read('functions/secureAdminContractOperations.ts'),
    read('functions/runtime.ts'),
  ]);

  for (const source of [control, transactions]) {
    assert.match(source, /httpsCallable\(functions, 'adminCloseContract'\)/);
    assert.doesNotMatch(source, /\bupdateDoc\s*\(/);
    assert.doesNotMatch(source, /\baddDoc\s*\(/);
  }

  assert.match(backend, /export const adminCloseContract = onCall/);
  assert.match(backend, /enforceAppCheck: true/);
  assert.match(backend, /sign_in_second_factor/);
  assert.match(backend, /multiFactor/);
  assert.match(backend, /ADMIN_CLOSE_CONTRACT_WITH_MFA/);
  assert.match(backend, /collection\("audit_logs"\)/);
  assert.match(backend, /collection\("notifications"\)/);
  assert.match(backend, /dispatchReady: false/);
  assert.match(runtime, /export \* from "\.\/secureAdminContractOperations"/);
});

test('Financial contract closure UI does not claim unsupported archive or settlement evidence', async () => {
  const source = await read('apps/admin-panel/src/pages/financials/TransactionsPage.tsx');
  assert.doesNotMatch(source, /settlementAmount/);
  assert.doesNotMatch(source, /archived_contracts/);
  assert.doesNotMatch(source, /terminated and archived successfully/i);
  assert.match(source, /server audit evidence/);
  assert.match(source, /terminationReason\.trim\(\)\.length < 8/);
});
