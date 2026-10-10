import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const tenant = readFileSync(new URL('../../tests/e2e/business-tenant.spec.ts', import.meta.url), 'utf8');
test('Tenant cross-role evidence retries GPS timeout without faking ARRIVED', () => {
  assert.match(tenant, /async function confirmTechnicianArrivalWithFreshGps/);
  assert.match(tenant, /attempt <= 2/);
  assert.match(tenant, /page\.context\(\)\.setGeolocation/);
  assert.match(tenant, /GPS timed out/);
  assert.match(tenant, /if \(lastStatus === 'ARRIVED'\) return/);
  assert.match(tenant, /!\['EN_ROUTE', 'ON_THE_WAY'\]\.includes\(lastStatus\)/);
  assert.match(tenant, /await reloadTechnicianMission\(page, ticketId\)/);
  assert.match(tenant, /without Firestore ARRIVED/);
  assert.match(tenant, /confirmTechnicianArrivalWithFreshGps\(page, ticketId, coordinates\)/);
  assert.doesNotMatch(tenant, /db\.collection\('maintenanceTickets'\)\.doc\(ticketId\)\.update\(\{\s*status:\s*'ARRIVED'/);
});
