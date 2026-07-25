import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const workflow = await read('.github/workflows/live-business-failure-diagnostics.yml');
const runner = await read('scripts/run-live-business-failure-diagnostics.mjs');
const lifecycle = await read('scripts/e2e-admin-lifecycle.mjs');

test('live business diagnostics are owner-only, exact-deployment-bound, and non-launching', () => {
  assert.match(workflow, /^name: Live Business Failure Diagnostics$/m);
  assert.match(workflow, /\.github\/live-business-diagnostics-request/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /DEPLOYMENT_ENVIRONMENT: production/);
  assert.match(workflow, /draft=.*pull_request\.draft/);
  assert.match(workflow, /requester.*GITHUB_REPOSITORY_OWNER/);
  assert.match(workflow, /Diagnose live business evidence failures/);
  assert.match(workflow, /ops\/diagnose-live-business-/);
  assert.match(workflow, /Request must change only \.github\/live-business-diagnostics-request/);
  assert.match(workflow, /diagnose-live-business-evidence/);
  assert.match(workflow, /\.name == "Firebase Production Deploy"/);
  assert.match(workflow, /Run current-commit production deployment evidence/);
  assert.match(workflow, /Run current-commit five-role business evidence/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /git diff --quiet/);
  assert.match(workflow, /manage-e2e-admin-mfa-test\.mjs/);
  assert.match(workflow, /business-admin\.spec\.ts/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /Close completed diagnostic request without merge/);
  assert.doesNotMatch(workflow, /firebase deploy|run_public_release_gate|hard-launch:decision/);
});

test('diagnostic runner targets failed profiles, provisions real MFA, redacts identities, and always cleans up', () => {
  assert.match(runner, /tests\/e2e\/business-admin\.spec\.ts/);
  assert.match(runner, /tests\/e2e\/business-tenant\.spec\.ts/);
  assert.match(runner, /tests\/e2e\/business-technician\.spec\.ts/);
  assert.doesNotMatch(runner, /business-owner|business-broker|business-global/);
  assert.match(runner, /manage-e2e-admin-mfa-test\.mjs', \['--mode', 'prepare'\]/);
  assert.match(runner, /manage-e2e-admin-mfa-test\.mjs', \['--mode', 'cleanup'\]/);
  assert.match(runner, /<redacted-email>/);
  assert.match(runner, /<redacted-api-key>/);
  assert.match(runner, /<redacted-test-phone>/);
  assert.match(runner, /post-business-diagnostic/);
  assert.match(runner, /ephemeralAdminMfaPrepared/);
  assert.match(runner, /ephemeralAdminRetired/);
  assert.match(runner, /ephemeralAdminMfaConfigRemoved/);
  assert.match(runner, /sensitiveValuesExcluded: true/);
  assert.match(runner, /hardLaunchClaim: false/);
});

test('ephemeral lifecycle authorizes only the exact protected diagnostic phase', () => {
  assert.match(lifecycle, /Live Business Failure Diagnostics/);
  assert.match(lifecycle, /new Set\(\['post-business-diagnostic'\]\)/);
  assert.match(lifecycle, /GITHUB_EVENT_NAME !== 'pull_request'/);
  assert.match(lifecycle, /DIAGNOSTIC_DEPLOYED_SHA/);
  assert.match(lifecycle, /E2E_ADMIN_EMAIL must never equal the canonical Founder email/);
  assert.doesNotMatch(lifecycle, /post-business-diagnostic', 'predeploy/);
});
