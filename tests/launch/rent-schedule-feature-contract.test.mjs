import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(p, 'utf8');

test('rent schedule functions are exported and Phase 1 stays Cash/Cheque only', async () => {
  const [all, mod] = await Promise.all([read('functions/runtimeAll.ts'), read('functions/rentSchedule.ts')]);
  assert.match(all, /export \{ ownerSetRentSchedule, sendRentDueReminders, onRentPaymentDecision \} from '\.\/rentSchedule'/);
  assert.match(mod, /schedule: "0 9 \* \* \*", timeZone: "Asia\/Dubai"/);
  assert.match(mod, /enforceAppCheck: true/);
  assert.doesNotMatch(mod, /stripe/i);
  assert.match(mod, /RENT_REMINDER_OFFSETS = \[7, 1, 0, -1, -7\]/);
});

test('rent_installments and rent_receipts are server-written only', async () => {
  const rules = await read('firestore.rules');
  for (const c of ['rent_installments', 'rent_receipts']) {
    const block = rules.slice(rules.indexOf(`match /${c}/`), rules.indexOf(`match /${c}/`) + 400);
    assert.match(block, /allow create, update, delete: if false;/, c);
    assert.match(block, /resource\.data\.get\('tenantUid', null\) == request\.auth\.uid/, c);
  }
});

test('tenant payments page shows the schedule and links proof to an installment', async () => {
  const [page, panel] = await Promise.all([read('src/tenant/pages/TenantPaymentsPage.tsx'), read('src/tenant/components/TenantRentSchedulePanel.tsx')]);
  assert.match(page, /<TenantRentSchedulePanel/);
  assert.match(page, /installmentId: payingInstallment\.id/);
  assert.match(panel, /where\('tenantUid', '==', uid\)/);
  assert.match(panel, /could not be loaded/);
});

test('owner units page opens the rent schedule dialog for units with a tenant', async () => {
  const [page, dialog] = await Promise.all([read('src/owner/pages/OwnerUnitRegistryPage.tsx'), read('src/owner/components/OwnerRentScheduleDialog.tsx')]);
  assert.match(page, /<OwnerRentScheduleDialog open/);
  assert.match(page, /tenantUid \|\| \(unit as any\)\.tenantId/);
  assert.match(dialog, /httpsCallable\(functions, 'ownerSetRentSchedule'\)/);
  assert.match(dialog, /Cash or cheque only/);
});
