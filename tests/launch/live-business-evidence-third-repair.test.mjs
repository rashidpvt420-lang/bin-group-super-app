import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('ticket normalization preserves the canonical lifecycle vocabulary', async () => {
  const [normalizer, lifecycle] = await Promise.all([
    read('functions/ticketNormalization.ts'),
    read('functions/index.ts'),
  ]);

  assert.match(normalizer, /return "ASSIGNED"/);
  assert.match(normalizer, /return "ON_THE_WAY"/);
  assert.match(normalizer, /return "ARRIVED"/);
  assert.doesNotMatch(normalizer, /return "assigned"/);
  assert.doesNotMatch(normalizer, /return "on_the_way"/);
  assert.match(lifecycle, /ON_THE_WAY: \["ARRIVED"\]/);
});

test('assignment receipt and delivery share current push-token eligibility', async () => {
  const [assignment, delivery] = await Promise.all([
    read('functions/technicianDispatchNotifications.ts'),
    read('functions/notificationDelivery.ts'),
  ]);

  for (const source of [assignment, delivery]) {
    assert.match(source, /CURRENT_PUSH_TOKEN_MAX_AGE_MS/);
    assert.match(source, /data\.active === false|data\.active !== false/);
    assert.match(source, /permission.*granted/);
    assert.match(source, /lastRegisteredAt/);
  }
  assert.match(assignment, /tokenSnapshot\.docs\.some\(isCurrentRegisteredPushToken\)/);
  assert.match(delivery, /registeredAtMs < Date\.now\(\) - CURRENT_PUSH_TOKEN_MAX_AGE_MS/);
});

test('Admin and Owner evidence targets exact production UI controls and routes', async () => {
  const [adminSpec, ownerSpec] = await Promise.all([
    read('tests/e2e/business-admin.spec.ts'),
    read('tests/e2e/business-owner.spec.ts'),
  ]);

  assert.match(adminSpec, /\[role="option"\]\[data-value="\$\{roleValue\}"\]/);
  assert.doesNotMatch(adminSpec, /getByRole\('option', \{ name: \/Technician\/i \}\)/);
  assert.match(ownerSpec, /page\.goto\('\/owner\/dashboard\/full'/);
  assert.match(ownerSpec, /toHaveURL\(\/\\\/owner\\\/dashboard\\\/full\/\)/);
});

test('Tenant and Technician evidence resumes from server-authored lifecycle state', async () => {
  const [tenantSpec, technicianSpec] = await Promise.all([
    read('tests/e2e/business-tenant.spec.ts'),
    read('tests/e2e/business-technician.spec.ts'),
  ]);

  for (const source of [tenantSpec, technicianSpec]) {
    assert.match(source, /let lifecycleStatus/);
    assert.match(source, /lifecycleStatus === 'ACCEPTED'/);
    assert.match(source, /lifecycleStatus === 'ON_THE_WAY'/);
    assert.match(source, /lifecycleStatus = 'ARRIVED'/);
  }
});
