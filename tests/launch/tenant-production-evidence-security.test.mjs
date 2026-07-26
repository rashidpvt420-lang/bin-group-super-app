import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('completion email ignores client-written ticket email fields', () => {
  const source = read('functions/tenantTicketReview.ts');
  assert.match(source, /verifiedTenantEmail\(tenantId\)/);
  assert.match(source, /account\.emailVerified/);
  assert.match(source, /account\.disabled/);
  assert.match(source, /recipientSource: "firebase_auth_verified_email"/);
  assert.doesNotMatch(source, /after\.tenantEmail/);
  assert.doesNotMatch(source, /after\.requesterEmail/);
  assert.doesNotMatch(source, /after\.reporterEmail/);
});

test('unassigned-residence evidence never vacates a production unit', () => {
  const source = read('tests/e2e/business-tenant.spec.ts');
  assert.match(source, /createRecoveryTenant/);
  assert.match(source, /Temporary unassigned Tenant fixture/);
  assert.match(source, /without mutating an occupied unit/);
  assert.match(source, /expect\(String\(occupiedData\.tenantUid/);
  assert.doesNotMatch(source, /FieldValue\.delete\(\)/);
  assert.doesNotMatch(source, /occupancyStatus:\s*['"]vacant['"]/);
});
