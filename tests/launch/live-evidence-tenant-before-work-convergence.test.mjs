import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const prepareHooks = readFileSync('scripts/prepare-hooks.mjs', 'utf8');
const hardener = readFileSync('scripts/harden-tenant-before-work-convergence.mjs', 'utf8');
const tenantSuite = readFileSync('tests/e2e/business-tenant.spec.ts', 'utf8');

test('Live Role Smoke installs Tenant before-work convergence hardening only in protected live-evidence replay', () => {
  assert.match(prepareHooks, /GITHUB_WORKFLOW !== 'Live Role Smoke Tests'/);
  assert.match(prepareHooks, /GITHUB_JOB !== 'live-evidence'/);
  assert.match(prepareHooks, /PAYMENT_POLICY \|\| ''\)\.toLowerCase\(\) !== 'phase1-manual'/);
  assert.match(prepareHooks, /scripts\/harden-tenant-before-work-convergence\.mjs/);
});

test('Tenant convergence hardening keeps durable Firestore proof as authority and fails on real upload errors', () => {
  assert.match(hardener, /technician-before-work-error/);
  assert.match(hardener, /technicianBeforePhotoUrl/);
  assert.match(hardener, /technicianBeforePhotos/);
  assert.match(hardener, /Tenant cross-role before-work evidence must persist before Start Work\./);
  assert.match(hardener, /reloadTechnicianMission\(page, ticketId\)/);
  assert.match(hardener, /technician-before-work-evidence/);

  const errorIndex = hardener.indexOf("beforeWorkError.isVisible");
  const persistenceIndex = hardener.indexOf('beforeWorkPersisted = Boolean');
  const reloadIndex = hardener.indexOf('reloadTechnicianMission(page, ticketId)');
  assert.ok(errorIndex >= 0, 'real upload-error diagnostic must exist');
  assert.ok(persistenceIndex > errorIndex, 'durable proof polling must follow real upload-error detection');
  assert.ok(reloadIndex > persistenceIndex, 'mission reload may happen only after durable proof exists');
});

test('Tenant source still exposes the exact before-work evidence contract that the replay hardener strengthens', () => {
  assert.match(tenantSuite, /technician-before-work-file/);
  assert.match(tenantSuite, /technician-before-work-success/);
  assert.match(tenantSuite, /Technician before-work evidence must persist before Start Work\./);
  assert.match(tenantSuite, /technician-start-work/);
});
