import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../../.github/workflows/live-evidence-dispatch.yml', import.meta.url),
  'utf8',
);

test('live-evidence dispatcher is owner-only, draft-only, exact-title, and credential-free', () => {
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /github\.event\.pull_request\.draft == true/);
  assert.match(workflow, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /github\.event\.pull_request\.user\.login == github\.repository_owner/);
  assert.match(workflow, /ops\/dispatch-live-evidence-workflow-/);
  assert.match(workflow, /Dispatch protected live-evidence workflow/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /concurrency:\s*[\s\S]*group: live-evidence-dispatch\s/);
  assert.doesNotMatch(workflow, /group: live-evidence-dispatch-\$\{\{\s*github\.event\.pull_request\.number\s*\}\}/);
  assert.doesNotMatch(workflow, /pull_request_target:/);
  assert.doesNotMatch(workflow, /environment: production/);
  assert.doesNotMatch(workflow, /id-token: write/);
  assert.doesNotMatch(workflow, /secrets\./);
});

test('live-evidence marker is one file and keeps hard launch disabled', () => {
  assert.match(workflow, /Request must change only \.github\/live-evidence-dispatch-request/);
  assert.match(workflow, /request.*dispatch-protected-live-evidence/s);
  assert.match(workflow, /production_deploy_run_id=/);
  assert.match(workflow, /expected_commit_sha=/);
  assert.match(workflow, /incident_evidence_refs=/);
  assert.match(workflow, /hard_launch_claim.*false/s);
  assert.match(workflow, /\[\[ "\$deploy_run_id" != '0' \]\]/);
});

test('live-evidence requires exact-main successful bank-pilot deploy provenance', () => {
  assert.match(workflow, /Firebase Production Deploy/);
  assert.match(workflow, /\.github\/workflows\/firebase-production-deploy\.yml/);
  assert.match(workflow, /\.event' <<<"\$run_json"\)" == 'workflow_dispatch'/);
  assert.match(workflow, /\.head_sha' <<<"\$run_json"\)" == "\$RELEASE_SHA"/);
  assert.match(workflow, /production-deployment-\$RELEASE_SHA/);
  assert.match(workflow, /Request expected_commit_sha .* does not match current main/);
});

test('live-evidence dispatches only live-evidence mode and correlates exact run', () => {
  assert.match(workflow, /live-role-smoke\.yml\/dispatches/);
  assert.equal((workflow.match(/live-role-smoke\.yml\/dispatches/g) || []).length, 1);
  assert.match(workflow, /mode:"live-evidence"/);
  assert.match(workflow, /expected_commit_sha:\$sha/);
  assert.match(workflow, /production_deploy_run_id:\$deploy/);
  assert.match(workflow, /live-evidence-run-baseline\.txt/);
  assert.match(workflow, /no unique exact-main run could be correlated/);
  assert.match(workflow, /live-evidence-dispatch-evidence\.json/);
  assert.match(workflow, /hardLaunchClaim:false/);
  assert.match(workflow, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02\s+# v4/);
  assert.doesNotMatch(workflow, /mode:"hard-clearance"/);
  assert.doesNotMatch(workflow, /live-evidence-dispatch-evidence[\s\S]*password/i);
  assert.doesNotMatch(workflow, /live-evidence-dispatch-evidence[\s\S]*privateKey/i);
});
