import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Owner inspection-first submission embeds concrete timestamps in array values', async () => {
  const source = await read('functions/inspectionFirstOwnerOnboarding.ts');
  const submitStart = source.indexOf('export const submitOwnerInspectionFirstOnboarding');
  const nextCallable = source.indexOf('export const', submitStart + 1);
  const submission = source.slice(submitStart, nextCallable > submitStart ? nextCallable : undefined);

  assert.ok(submitStart >= 0, 'Owner submission callable must exist');
  assert.match(submission, /const now = admin\.firestore\.Timestamp\.now\(\);/);
  assert.match(submission, /properties: normalizedProperties/);
  assert.doesNotMatch(submission, /const now = ts\(\);/);
});

test('technician assignment records a truthful initial push state', async () => {
  const source = await read('functions/technicianDispatchNotifications.ts');

  assert.match(source, /collection\("fcmTokens"\)\.limit\(1\)\.get\(\)/);
  assert.match(source, /const hasRegisteredPushToken = tokenSnapshot\.docs\.some/);
  assert.match(source, /pushDeliveryState: "PENDING_TRIGGER"/);
  assert.match(source, /pushTokenCount: 0/);
  assert.match(source, /pushDeliveryState: "NO_REGISTERED_TOKEN"/);
  assert.match(source, /\.\.\.initialPushReceipt/);
});

test('Admin staff role is accessible and MFA is generated at challenge time', async () => {
  const [page, spec] = await Promise.all([
    read('apps/admin-panel/src/pages/admin/StaffAccessPage.tsx'),
    read('tests/e2e/business-admin.spec.ts'),
  ]);

  assert.match(page, /<InputLabel id="staff-role-label"[^>]*>Role<\/InputLabel>/);
  assert.match(page, /id="staff-role-select" labelId="staff-role-label" data-testid="staff-role-select"/);
  assert.match(spec, /function currentAdminMfaCode\(\)/);
  assert.match(spec, /Math\.floor\(Date\.now\(\) \/ 30_000\)/);
  assert.match(spec, /fill\(currentAdminMfaCode\(\)\)/);
  assert.match(spec, /getByTestId\('staff-role-select'\)\.click\(\{ timeout: 15_000 \}\)/);
});

test('Technician evidence waits for canonical server lifecycle state between actions', async () => {
  const spec = await read('tests/e2e/business-tenant.spec.ts');

  assert.match(spec, /Technician acceptance must reach production Firestore before the next UI action/);
  assert.match(spec, /\.toBe\('ACCEPTED'\)/);
  assert.match(spec, /Technician Start Trip must persist canonical ON_THE_WAY in production Firestore/);
  assert.match(spec, /\.toBe\('ON_THE_WAY'\)/);
  assert.match(spec, /Technician arrival must reach production Firestore before safety evidence is entered/);
  assert.match(spec, /\.toBe\('ARRIVED'\)/);
});
