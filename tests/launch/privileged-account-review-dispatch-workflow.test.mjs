import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../../.github/workflows/privileged-account-review-dispatch.yml', import.meta.url),
  'utf8',
);

test('privileged review dispatcher is an owner-only draft PR workflow', () => {
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /\.github\/privileged-account-review-dispatch-request/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /github\.event\.pull_request\.draft == true/);
  assert.match(workflow, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /github\.event\.pull_request\.user\.login == github\.repository_owner/);
  assert.match(workflow, /ops\/dispatch-privileged-review-workflow-/);
  assert.match(workflow, /Dispatch protected privileged account review workflow/);
  assert.doesNotMatch(workflow, /pull_request_target:/);
  assert.doesNotMatch(workflow, /environment: production/);
  assert.doesNotMatch(workflow, /id-token: write/);
  assert.doesNotMatch(workflow, /secrets\./);
});

test('privileged review dispatcher validates a canonical one-file no-mutation marker', () => {
  assert.match(workflow, /Request must change only \.github\/privileged-account-review-dispatch-request/);
  assert.match(workflow, /request=dispatch-protected-privileged-account-review/);
  assert.match(workflow, /mutation_allowed=false/);
  assert.match(workflow, /hard_launch_claim=false/);
  assert.match(workflow, /Privileged review dispatch marker is not canonical/);
});

test('privileged review dispatcher binds one protected dry-run to stable exact main', () => {
  assert.match(workflow, /Resolve stable current main and snapshot workflow runs/);
  assert.match(workflow, /privileged-account-cleanup-dry-run\.yml\/runs\?event=workflow_dispatch&branch=main&per_page=100/);
  assert.match(workflow, /privileged-account-cleanup-dry-run\.yml\/dispatches/);
  assert.equal((workflow.match(/privileged-account-cleanup-dry-run\.yml\/dispatches/g) || []).length, 1);
  assert.match(workflow, /expected_commit_sha:\$sha/);
  assert.match(workflow, /REVIEW_PRIVILEGED_ACCOUNT_CLEANUP_BIN_GROUP/);
  assert.match(workflow, /select\(\.head_sha == \$sha\)/);
  assert.match(workflow, /privileged-review-run-baseline\.txt/);
  assert.match(workflow, /no unique exact-main run could be correlated/);
  assert.match(workflow, /latest_main/);
  assert.match(workflow, /Mutation requested: false/);
  assert.match(workflow, /Hard-launch claim: false/);
});
