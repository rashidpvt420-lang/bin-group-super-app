import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const prepareHooks = await readFile(new URL('../../scripts/prepare-hooks.mjs', import.meta.url), 'utf8');
const helper = await readFile(new URL('../../scripts/prepare-playwright-chromium.mjs', import.meta.url), 'utf8');
const evidenceRunner = await readFile(new URL('../../scripts/run-critical-evidence.mjs', import.meta.url), 'utf8');

test('Live Role Smoke intercepts only Playwright install --with-deps chromium', () => {
  assert.match(prepareHooks, /process\.env\.GITHUB_WORKFLOW !== 'Live Role Smoke Tests'/);
  assert.match(prepareHooks, /args\[0\] === 'install' && args\.includes\('--with-deps'\) && args\.includes\('chromium'\)/);
  assert.match(prepareHooks, /prepare-playwright-chromium\.mjs/);
  assert.match(prepareHooks, /spawnSync\(process\.execPath, commandArgs/);
});

test('Chromium preparation is bounded and records one reusable job marker', () => {
  assert.match(helper, /BROWSER_INSTALL_TIMEOUT_MS = 120_000/);
  assert.match(helper, /DEPENDENCY_FALLBACK_TIMEOUT_MS = 180_000/);
  assert.match(helper, /PROBE_TIMEOUT_MS = 20_000/);
  assert.match(helper, /\['install', 'chromium'\]/);
  assert.match(helper, /\['install-deps', 'chromium'\]/);
  assert.match(helper, /bin-group-playwright-chromium-ready/);
  assert.match(helper, /existsSync\(marker\) && await probeChromium\(\)/);
  assert.match(helper, /spawnSync\(process\.execPath, \[cli, \.\.\.args\]/);
  assert.match(helper, /timeout,/);
});

test('evidence runner retains its required suites while repeated dependency installs are neutralized by the Live Smoke shim', () => {
  assert.match(evidenceRunner, /const allBusiness = \['adminCredentialLogin', 'businessOwner', 'businessTenant', 'businessTechnician', 'businessBroker', 'businessGlobal'\]/);
  assert.match(evidenceRunner, /\[\.\.\.allBusiness, 'launchAuditLive'\]/);
  assert.match(evidenceRunner, /playwright', 'install', '--with-deps', 'chromium'/);
  assert.doesNotMatch(helper, /while\s*\(true\)|for\s*\(;;\)/);
});
