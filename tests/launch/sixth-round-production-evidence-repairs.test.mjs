import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(new URL('../..', import.meta.url).pathname);
const read = (relativePath) => readFileSync(path.join(root, relativePath), 'utf8');

test('all protected business evidence specs compile before deployment', () => {
  const cli = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');
  const specs = [
    'tests/e2e/business-admin.spec.ts',
    'tests/e2e/business-owner.spec.ts',
    'tests/e2e/business-tenant.spec.ts',
    'tests/e2e/business-technician.spec.ts',
    'tests/e2e/business-broker.spec.ts',
    'tests/e2e/business-global.spec.ts',
  ];
  const result = spawnSync(
    process.execPath,
    [cli, 'test', ...specs, '--list', '--project=chromium-desktop'],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 120_000,
      env: { ...process.env, CI: 'true' },
    },
  );
  assert.equal(
    result.status,
    0,
    `Protected business evidence specs failed Playwright compilation.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`,
  );
  for (const spec of specs) {
    assert.match(result.stdout, new RegExp(spec.split('/').at(-1).replaceAll('.', '\\.'), 'i'));
  }
});

test('Admin property and payment approval dialogs use distinct identifiers', () => {
  const source = read('tests/e2e/business-admin.spec.ts');
  assert.match(source, /const propertyApprovalBrowserDialog = await approvalDialogPromise/);
  assert.match(source, /const approvalDialog = page\.getByRole\('dialog', \{ name: \/Confirm Payment & Unlock Owner\/i \}\)/);
  assert.equal((source.match(/const approvalDialog\s*=/g) || []).length, 1);
});

test('assigned Technician direct mission reads have a narrow fail-closed rule', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /function canGetAssignedTechnicianTicket\(data\)/);
  assert.match(rules, /claimedRole\(\) in \['technician', 'tech'\]/);
  assert.match(rules, /techOwns\(data\)/);
  assert.match(rules, /match \/maintenanceTickets\/\{ticketId\}[\s\S]*?allow get: if canGetAssignedTechnicianTicket\(resource\.data\)/);
});

test('Technician Start Work requires persisted Technician-owned before-work evidence', () => {
  const page = read('src/technician/pages/TechnicianJobDetailPage.tsx');
  assert.match(page, /const hasTechnicianBeforeProof = Boolean\(ticket\?\.technicianBeforePhotoUrl\)/);
  assert.match(page, /data-testid="technician-start-work"/);
  assert.match(page, /status !== 'ARRIVED' \|\| !hasTechnicianBeforeProof \|\| !ppeChecked \|\| !safetyChecked/);
  assert.match(page, /data-testid="technician-start-work-proof-required"/);
});

test('Tenant cross-role evidence uploads the mandatory before-work photo before Start Work', () => {
  const source = read('tests/e2e/business-tenant.spec.ts');
  const uploadIndex = source.indexOf("const beforeWorkInput = page.getByTestId('technician-before-work-file')");
  const startIndex = source.indexOf("button:has-text(\"Start Work\")");
  assert.ok(uploadIndex >= 0, 'Tenant cross-role proof must locate the Technician before-work input.');
  assert.ok(startIndex > uploadIndex, 'Before-work evidence must be uploaded before Start Work is attempted.');
  assert.match(source, /technician-before-work-success/);
  assert.match(source, /Technician before-work evidence must persist before Start Work/);
});

test('protected Technician fixture canonicalizes Auth claims before browser login', () => {
  const source = read('tests/e2e/business-technician.spec.ts');
  assert.match(source, /setCustomUserClaims\(technicianUid/);
  assert.match(source, /role: 'technician'/);
  assert.match(source, /primaryRole: 'technician'/);
  assert.match(source, /suspended: false/);
});
