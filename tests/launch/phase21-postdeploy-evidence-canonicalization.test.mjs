import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  patchOwnerEvidence,
  patchTenantEvidence,
  patchTechnicianEvidence,
} from '../../scripts/patch-phase21-postdeploy-evidence.mjs';

const read = (path) => readFileSync(path, 'utf8');

test('Phase 21 postdeploy repair supplies the Admin-verified Owner pricing payload', () => {
  const patched = patchOwnerEvidence(read('scripts/run-owner-inspection-first-production-evidence.mjs'));
  assert.match(patched, /pricingVerification: \{/);
  assert.match(patched, /units: property\.units/);
  assert.match(patched, /sqft: property\.sqft/);
  assert.match(patched, /propertyAge: property\.age/);
  assert.match(patched, /emirate: property\.emirate/);
  assert.match(patched, /annualRent: property\.annualRent/);
  assert.match(patched, /annualRevenue: property\.annualRevenue/);
});

test('Phase 21 postdeploy repair treats EN_ROUTE as the canonical persisted Technician travel state', () => {
  const tenant = patchTenantEvidence(read('tests/e2e/business-tenant.spec.ts'));
  const technician = patchTechnicianEvidence(read('tests/e2e/business-technician.spec.ts'));

  assert.match(tenant, /canonical EN_ROUTE in production Firestore/);
  assert.match(tenant, /toBe\('EN_ROUTE'\)/);
  assert.match(tenant, /lifecycleStatus === 'EN_ROUTE'/);
  assert.doesNotMatch(tenant, /canonical ON_THE_WAY/);

  assert.match(technician, /toBe\('EN_ROUTE'\)/);
  assert.match(technician, /lifecycleStatus === 'EN_ROUTE'/);
  assert.match(technician, /fixtureTicket\(gpsDeniedTicketId, 'EN_ROUTE', true\)/);
  assert.match(technician, /fixtureTicket\(gpsPoorTicketId, 'EN_ROUTE', true\)/);
  assert.doesNotMatch(technician, /toBe\('ON_THE_WAY'\)/);
});

test('Phase 21 postdeploy repair is wired into both exact-main production evidence paths', () => {
  const runner = read('scripts/run-protected-business-evidence.mjs');
  const hooks = read('scripts/prepare-hooks.mjs');
  assert.match(runner, /run\('scripts\/patch-phase21-postdeploy-evidence\.mjs'\)/);
  assert.match(hooks, /scripts\/patch-phase21-postdeploy-evidence\.mjs/);
});
