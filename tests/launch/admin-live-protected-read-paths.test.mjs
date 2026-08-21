import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Admin launch configuration uses a protected server snapshot and the canonical Phase 1 payment policy', async () => {
  const [settings, commandCenter] = await Promise.all([
    read('apps/admin-panel/src/pages/settings/SettingsPage.tsx'),
    read('functions/adminCommandCenter.ts'),
  ]);

  assert.match(settings, /adminGetLaunchConfigurationSummary/);
  assert.doesNotMatch(settings, /onSnapshot\s*\(/);
  assert.doesNotMatch(settings, /doc\(db,\s*\.\.\.LAUNCH_SUMMARY_PATH\)/);
  assert.match(settings, /phase1-manual/);
  assert.match(settings, /CASH/);
  assert.match(settings, /CHEQUE/);
  assert.doesNotMatch(settings, /stripeLiveMode/);
  assert.match(settings, /bankTransferEnabled/);
  assert.match(settings, /stripeEnabled/);

  assert.match(commandCenter, /export const adminGetLaunchConfigurationSummary/);
  assert.match(commandCenter, /system_health/);
  assert.match(commandCenter, /admin_summaries/);
  assert.match(commandCenter, /system_payment_config/);
  assert.match(commandCenter, /actor\.customClaims/);
  assert.match(commandCenter, /enforceAppCheck:\s*true/);
});

test('Admin HR and Technician registry reads do not depend on browser access to the users collection', async () => {
  const [hr, technicians] = await Promise.all([
    read('apps/admin-panel/src/pages/admin/HRManagementPage.tsx'),
    read('apps/admin-panel/src/pages/technicians/TechniciansManagementPage.tsx'),
  ]);

  assert.match(hr, /adminGetHrCommandSnapshot/);
  assert.doesNotMatch(hr, /onSnapshot\s*\(query\(collection\(db,\s*['"]users['"]/);

  assert.match(technicians, /adminGetHrCommandSnapshot/);
  assert.match(technicians, /getIdToken\(true\)/);
  assert.doesNotMatch(technicians, /collection\(db,\s*['"]users['"]\)/);
  assert.doesNotMatch(technicians, /onSnapshot\s*\(/);
});
