import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('production dispatch wrapper atomically binds current main and retries races', async () => {
  const source = await read('.github/workflows/firebase-production-dispatch-current-main.yml');
  assert.match(source, /name: START HERE - Firebase Production Deploy/);
  assert.match(source, /for attempt in 1 2 3 4 5/);
  assert.match(source, /main_before=.*commits\/main/);
  assert.match(source, /main_before.*!=.*main_sha/);
  assert.match(source, /expected_commit_sha:\$sha/);
  assert.match(source, /firebase-production-deploy\.yml\/dispatches/);
  assert.match(source, /actions\/workflows\/firebase-production-deploy\.yml\/runs/);
  assert.match(source, /run_sha.*==.*main_sha/);
  assert.match(source, /actions\/runs\/\$run_id\/cancel/);
  assert.match(source, /Dispatch race detected/);
  assert.match(source, /ADMIN_MFA_BOOTSTRAP_HOSTING/);
});

test('production dispatch wrapper uses non-contradictory incident defaults and requires explicit attestation', async () => {
  const source = await read('.github/workflows/firebase-production-dispatch-current-main.yml');
  const attestationBlock = source.match(/incident_attestation:[\s\S]*?incident_active_json:/)?.[0] || '';
  const failedBlock = source.match(/incident_last_deployment_failed:[\s\S]*?incident_last_deployment_failed_at:/)?.[0] || '';

  assert.match(attestationBlock, /required: true/);
  assert.doesNotMatch(attestationBlock, /default:/);
  assert.match(failedBlock, /default: false/);
  assert.match(source, /Clear incident_last_deployment_failed_at when the latest deployment is not marked failed/);
});

test('production dispatch wrapper validates all public-only evidence before dispatch', async () => {
  const source = await read('.github/workflows/firebase-production-dispatch-current-main.yml');
  assert.match(source, /Public mode requires a numeric hard-clearance workflow run ID/);
  assert.match(source, /Public mode requires a valid live Stripe checkout session ID/);
  assert.match(source, /Public mode requires a valid Stripe webhook event ID/);
  assert.match(source, /Bank-pilot mode requires all public-only evidence fields to remain blank/);
  assert.match(source, /ADMIN_MFA_BOOTSTRAP_HOSTING is permitted only in bank-pilot mode/);
});

test('production dispatch wrapper verifies the latest completed deployment before accepting failed-state recovery', async () => {
  const source = await read('.github/workflows/firebase-production-dispatch-current-main.yml');
  assert.match(source, /status=completed&per_page=50/);
  assert.match(source, /sort_by\(\.created_at\) \| last/);
  assert.match(source, /latest_conclusion/);
  assert.match(source, /latest completed Firebase Production Deploy run .* concluded/);
  assert.match(source, /supplied failure timestamp does not match the latest completed failed Firebase Production Deploy run/);
  assert.match(source, /incident_last_deployment_failed_at cannot be in the future/);
  assert.match(source, /mandatory 30-minute cooling period/);
  assert.match(source, /--arg incidentFailedAt "\$resolved_failed_at"/);
});

test('production dispatch resolves the protected run only for the exact SHA and accepted dispatcher actor', async () => {
  const source = await read('.github/workflows/firebase-production-dispatch-current-main.yml');
  const exactSelection = /select\(\(\.actor\.login == \$actor or \.actor\.login == "github-actions\[bot\]"\) and \.head_sha == \$sha and \.created_at >= \$started\)/g;

  assert.equal((source.match(exactSelection) || []).length, 2);
  assert.equal((source.match(/--arg sha "\$main_sha"/g) || []).length, 2);
  assert.doesNotMatch(source, /select\(\.actor\.login == \$actor and \.created_at >= \$started\)/);
});

test('wrapper remains GitHub-only and does not implement Firebase deployment', async () => {
  const source = await read('.github/workflows/firebase-production-dispatch-current-main.yml');
  assert.match(source, /actions:\s*write/);
  assert.doesNotMatch(source, /firebase-tools/);
  assert.doesNotMatch(source, /deploy-firebase-production\.mjs/);
  assert.doesNotMatch(source, /workload_identity_provider/);
  assert.doesNotMatch(source, /service_account/);
});
