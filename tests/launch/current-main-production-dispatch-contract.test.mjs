import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const workflowPath = '.github/workflows/firebase-production-dispatch-current-main.yml';

test('production dispatcher atomically binds current main and correlates one new exact-SHA run', async () => {
  const source = await read(workflowPath);

  assert.match(source, /name: START HERE - Firebase Production Deploy/);
  assert.match(source, /for attempt in 1 2 3 4 5/);
  assert.match(source, /main_before=.*commits\/main/);
  assert.match(source, /main_before.*!=.*stable_sha/);
  assert.match(source, /expected_commit_sha:\$sha/);
  assert.match(source, /firebase-production-deploy\.yml\/dispatches/);
  assert.match(source, /gh api --paginate --slurp/);
  assert.match(source, /before_ids=/);
  assert.match(source, /\$before \| index\(\(\$run\.id \| tostring\)\)/);
  assert.match(source, /\$run\.head_sha == \$sha/);
  assert.match(source, /main_after_dispatch/);
  assert.match(source, /actions\/runs\/\$run_id\/cancel/);
  assert.equal(
    (source.match(/firebase-production-deploy\.yml\/dispatches/g) || []).length,
    1,
    'the wrapper must dispatch at most one protected deployment per run',
  );
  assert.match(source, /No second deployment was dispatched/);
});

test('operator form cannot mistype incident attestation or manually misreport the latest deployment result', async () => {
  const source = await read(workflowPath);
  const inputSection = source.slice(source.indexOf('    inputs:'), source.indexOf('\npermissions:'));

  assert.doesNotMatch(inputSection, /^\s+incident_attestation:/m);
  assert.doesNotMatch(inputSection, /^\s+incident_last_deployment_failed:/m);
  assert.doesNotMatch(inputSection, /^\s+incident_last_deployment_failed_at:/m);

  assert.match(source, /latest_conclusion.*==.*failure/);
  assert.match(source, /incident_failed='true'/);
  assert.match(source, /incident_attestation='ATTEST_PRODUCTION_INCIDENT_STATE_CLEAR'/);
  assert.match(source, /incident_attestation='ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS'/);
  assert.match(source, /--arg incidentAttestation "\$incident_attestation"/);
  assert.match(source, /--arg incidentFailed "\$incident_failed"/);
  assert.match(source, /--arg incidentFailedAt "\$resolved_failed_at"/);
});

test('dispatcher derives failed-state recovery from protected workflow history and preserves cooldown', async () => {
  const source = await read(workflowPath);

  assert.match(source, /status=completed&per_page=50/);
  assert.match(source, /sort_by\(\.created_at\) \| last/);
  assert.match(source, /latest_created_at/);
  assert.match(source, /latest_updated_at/);
  assert.match(source, /mandatory 30-minute cooling period/);
  assert.match(source, /GITHUB_PRODUCTION_RUN_\$latest_run_id/);
  assert.doesNotMatch(source, /supplied failure timestamp/i);
});

test('dispatcher keeps incident, rollback and public-mode validation fail closed', async () => {
  const source = await read(workflowPath);

  assert.match(source, /incident_active_json must be a valid JSON array/);
  assert.match(source, /A rollback reason is required when the rollback hold is enabled/);
  assert.match(source, /Public mode requires a numeric hard-clearance workflow run ID/);
  assert.match(source, /Public mode requires a valid live Stripe checkout session ID/);
  assert.match(source, /Public mode requires a valid Stripe webhook event ID/);
  assert.match(source, /Bank-pilot mode requires all public-only evidence fields to remain blank/);
  assert.match(source, /ADMIN_MFA_BOOTSTRAP_HOSTING is permitted only in bank-pilot mode/);
});

test('protected run resolver accepts only a newly observed exact-main workflow-dispatch run', async () => {
  const source = await read(workflowPath);
  const resolverSection = source.match(/before_runs='?[\s\S]*?Protected Firebase Production Deploy run \$run_id/)?.[0] || '';

  assert.match(resolverSection, /\$run\.event == "workflow_dispatch"/);
  assert.match(resolverSection, /\$run\.head_branch == "main"/);
  assert.match(resolverSection, /\$run\.head_sha == \$sha/);
  assert.match(resolverSection, /\$before \| index\(\(\$run\.id \| tostring\)\)\) == null/);
  assert.match(resolverSection, /sort_by\(\.created_at, \.id\)/);
  assert.match(resolverSection, /first \/\/ empty/);
  assert.doesNotMatch(resolverSection, /\.actor\.login/);
  assert.doesNotMatch(resolverSection, /created_at >= \$started/);
});

test('dispatcher remains GitHub-only and never implements Firebase deployment', async () => {
  const source = await read(workflowPath);

  assert.match(source, /actions:\s*write/);
  assert.doesNotMatch(source, /firebase-tools/);
  assert.doesNotMatch(source, /deploy-firebase-production\.mjs/);
  assert.doesNotMatch(source, /workload_identity_provider/);
  assert.doesNotMatch(source, /service_account/);
});
