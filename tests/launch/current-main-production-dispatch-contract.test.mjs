import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const workflowPath = '.github/workflows/firebase-production-dispatch-current-main.yml';

test('production dispatcher binds a stable current main before one protected dispatch', async () => {
  const source = await read(workflowPath);

  assert.match(source, /name: START HERE - Firebase Production Deploy/);
  assert.match(source, /for attempt in 1 2 3 4 5/);
  assert.match(source, /main_before=.*commits\/main/);
  assert.match(source, /main_after=.*commits\/main/);
  assert.match(source, /main_before.*==.*main_after/);
  assert.match(source, /expected_commit_sha:\$sha/);
  assert.equal((source.match(/firebase-production-deploy\.yml\/dispatches/g) || []).length, 1);
});

test('automated dispatcher binds delegated Founder actor to the exact open Owner request PR', async () => {
  const source = await read(workflowPath);

  assert.match(source, /^\s+authorization_actor:/m);
  assert.match(source, /^\s+authorization_source_pr:/m);
  assert.match(source, /GITHUB_ACTOR.*github-actions\[bot\]/);
  assert.match(source, /repos\/\$REPOSITORY\/pulls\/\$AUTHORIZATION_SOURCE_PR_INPUT/);
  assert.match(source, /\.user\.login/);
  assert.match(source, /AUTHORIZATION_ACTOR_INPUT.*REPOSITORY_OWNER/);
  assert.match(source, /Dispatch protected bank pilot workflow/);
  assert.match(source, /authorization_actor:\$authorizationActor/);
  assert.doesNotMatch(source, /authorization_actor:env\.GITHUB_ACTOR/);
  assert.doesNotMatch(source, /authorized-founder@protected\.invalid/);
  assert.match(source, /Manual dispatch cannot supply delegated Founder provenance/);
});

test('operator form cannot mistype incident attestation or manually misreport the latest deployment result', async () => {
  const source = await read(workflowPath);
  const inputSection = source.slice(source.indexOf('    inputs:'), source.indexOf('\npermissions:'));

  assert.doesNotMatch(inputSection, /^\s+incident_attestation:/m);
  assert.doesNotMatch(inputSection, /^\s+incident_last_deployment_failed:/m);
  assert.doesNotMatch(inputSection, /^\s+incident_last_deployment_failed_at:/m);
  assert.match(source, /latest_conclusion.*failure\|cancelled\|timed_out/);
  assert.match(source, /incident_failed='true'/);
  assert.match(source, /mandatory 30-minute cooling period/);
});

test('dispatcher correlates the accepted dispatch by exact SHA and baseline run IDs', async () => {
  const source = await read(workflowPath);

  assert.match(source, /baseline_ids=.*workflow_runs\[\]\.id/);
  assert.match(source, /for poll in \$\(seq 1 60\)/);
  assert.match(source, /select\(\.head_sha == \$sha\)/);
  assert.match(source, /\$old \| index\(\$id\)/);
  assert.doesNotMatch(source, /\.actor\.login == \$actor/);
  assert.doesNotMatch(source, /Could not resolve the dispatched production run; retrying/);
  assert.match(source, /No duplicate dispatch was attempted/);
});

test('dispatcher cancels the exact dispatched run when main advances after dispatch', async () => {
  const source = await read(workflowPath);

  assert.match(source, /current_main=.*commits\/main/);
  assert.match(source, /current_main.*!=.*main_sha/);
  assert.match(source, /actions\/runs\/\$run_id\/cancel/);
  assert.match(source, /run_sha.*==.*main_sha/);
});

test('dispatcher keeps incident, rollback and public-mode validation fail closed', async () => {
  const source = await read(workflowPath);

  assert.match(source, /incident_active_json must be a valid JSON array/);
  assert.match(source, /A rollback reason is required when the rollback hold is enabled/);
  assert.match(source, /Public mode requires a numeric hard-clearance workflow run ID/);
  assert.match(source, /Public mode requires a valid live Stripe checkout session ID/);
  assert.match(source, /Public mode requires a valid Stripe webhook event ID/);
  assert.match(source, /Bank-pilot mode requires all public-only evidence fields to remain blank/);
});

test('dispatcher slurps deployment payload JSON instead of parsing one raw line at a time', async () => {
  const source = await read(workflowPath);

  assert.equal((source.match(/printf '%s' "\$DEPLOYMENT_PAYLOAD_JSON" \| jq -Rsce/g) || []).length, 2);
  assert.doesNotMatch(source, /jq -Rce '\n\s+def decode_payload:/);
});

test('dispatcher remains GitHub-only and never implements Firebase deployment', async () => {
  const source = await read(workflowPath);

  assert.match(source, /actions:\s*write/);
  assert.doesNotMatch(source, /firebase-tools/);
  assert.doesNotMatch(source, /deploy-firebase-production\.mjs/);
  assert.doesNotMatch(source, /workload_identity_provider/);
  assert.doesNotMatch(source, /service_account/);
});
