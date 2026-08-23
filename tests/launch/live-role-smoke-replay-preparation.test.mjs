#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const prepareHooks = readFileSync(path.join(root, 'scripts/prepare-hooks.mjs'), 'utf8').replace(/\r\n/g, '\n');
const liveWorkflow = readFileSync(path.join(root, '.github/workflows/live-role-smoke.yml'), 'utf8').replace(/\r\n/g, '\n');
const adminSpec = readFileSync(path.join(root, 'tests/e2e/business-admin.spec.ts'), 'utf8').replace(/\r\n/g, '\n');

test('Live Role Smoke live-evidence applies the protected replay preparation before evidence execution', () => {
  assert.match(prepareHooks, /GITHUB_WORKFLOW !== 'Live Role Smoke Tests'/);
  assert.match(prepareHooks, /GITHUB_JOB !== 'live-evidence'/);
  assert.match(prepareHooks, /GITHUB_REF !== 'refs\/heads\/main'/);
  assert.match(prepareHooks, /DEPLOYMENT_ENVIRONMENT=production/);
  assert.match(prepareHooks, /PAYMENT_POLICY=phase1-manual/);
  assert.match(prepareHooks, /E2E_STRICT_LIVE=true/);
  assert.match(prepareHooks, /scripts\/apply-five-role-business-evidence-fixes\.mjs/);
  assert.match(prepareHooks, /scripts\/patch-protected-admin-staff-access-interaction\.mjs/);
  assert.match(prepareHooks, /scripts\/harden-repeated-business-evidence\.mjs/);
  assert.match(liveWorkflow, /node scripts\/run-critical-evidence\.mjs --suite all-required/);
});

test('the repair preserves launch-critical Admin coverage instead of masking the timeout', () => {
  assert.match(adminSpec, /test\.setTimeout\(720_000\)/);
  assert.match(adminSpec, /real MFA session proves Admin hard-launch responsibilities end to end/);
  assert.match(adminSpec, /admin-open-secure-staff-access/);
  assert.doesNotMatch(prepareHooks, /test\.setTimeout\(/);
  assert.doesNotMatch(prepareHooks, /skip\(|test\.skip|describe\.skip/);
});
