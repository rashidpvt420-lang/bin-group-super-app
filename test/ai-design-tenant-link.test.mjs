import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chooseTenantLink, propertyOwnerId } from '../functions/designTenantLink.ts';
import { designErrorMessage } from '../src/lib/designStudioErrors.ts';

const stale = { unit: { id: 'QGflWEtPzMPSCBYHinDW' }, property: { id: 'klnHFsz6vUUX68oLi7Gt', status: 'REJECTED' } };
const live = { unit: { id: 'u_live' }, property: { id: 'p_live', status: 'ACTIVE', ownerId: 'owner-1' } };

test('tenant link skips rejected / ownerless properties instead of failing', () => {
  assert.equal(chooseTenantLink([stale, live]).unit.id, 'u_live');
  assert.equal(chooseTenantLink([stale]), null);
  assert.equal(chooseTenantLink([{ unit: { id: 'x' }, property: null }]), null);
  assert.equal(chooseTenantLink([{ unit: { id: 'x' }, property: { status: 'active' } }]), null);
});

test('profile unit is preferred only when it is itself a verified link', () => {
  const other = { unit: { id: 'u_other' }, property: { status: 'active', ownerUid: 'owner-2' } };
  assert.equal(chooseTenantLink([live, other], 'u_other').unit.id, 'u_other');
  assert.equal(chooseTenantLink([live, other], 'not_linked').unit.id, 'u_live');
  assert.equal(propertyOwnerId({}, { ownerId: 'unit-owner' }), 'unit-owner');
});

test('server resolves tenant via all verified links, not limit(1)', () => {
  const src = readFileSync('functions/aiDesignStudio.ts', 'utf8');
  const fn = src.slice(src.indexOf('async function resolveTenantContext('), src.indexOf('async function resolveTenantContext(') + 4000);
  assert.ok(!/limit\(1\)/.test(fn));
  assert.match(fn, /chooseTenantLink\(/);
  assert.match(src, /tenant_owner_missing/);
  assert.match(src, /tenant_unit_missing/);
});

test('tenant link errors are plain language', () => {
  const msg = "Your unit is not linked to an active property with an owner yet, so we can't send designs for approval. Ask your property owner or BIN Group to fix the link.";
  assert.equal(designErrorMessage({ code: 'functions/failed-precondition', message: msg, details: { reason: 'tenant_owner_missing' } }), msg);
  assert.doesNotMatch(designErrorMessage({ code: 'functions/failed-precondition', message: 'The canonical property owner could not be resolved.' }), /canonical/);
});

test('design studio copy is plain and status is readable', () => {
  const page = readFileSync('src/pages/DesignStudioPage.tsx', 'utf8');
  assert.match(page, /Upload a photo of your room\. We'll create design ideas and a price, then send them to your owner for approval\./);
  for (const jargon of ['protected backend', 'resolves property authority', 'canonical', 'App Check-protected callable']) assert.ok(!page.includes(jargon), jargon);
  assert.match(page, /designStatusLabel\(renderStatus/);
  assert.match(page, /design-submit-error/);
});
