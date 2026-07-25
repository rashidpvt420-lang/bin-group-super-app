import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../../.github/workflows/close-protected-operation-request.yml', import.meta.url),
  'utf8',
);

test('protected operation closer is success-only and restricted to same-repository PR dispatchers', () => {
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /Dispatch Protected Privileged Account Review/);
  assert.match(workflow, /Dispatch Protected Privileged Account Cleanup/);
  assert.match(workflow, /Dispatch Protected Bank Pilot/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /github\.event\.workflow_run\.event == 'pull_request'/);
  assert.match(workflow, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(workflow, /actions: read/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /pull-requests: write/);
  assert.doesNotMatch(workflow, /actions: write/);
  assert.doesNotMatch(workflow, /id-token: write/);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.doesNotMatch(workflow, /actions\/checkout/);
});

test('protected operation closer maps exact workflow, branch, title, and marker contracts', () => {
  assert.match(workflow, /Dispatch protected privileged account review workflow/);
  assert.match(workflow, /ops\/dispatch-privileged-review-workflow-/);
  assert.match(workflow, /\.github\/privileged-account-review-dispatch-request/);
  assert.match(workflow, /Dispatch protected privileged account cleanup workflow/);
  assert.match(workflow, /ops\/dispatch-privileged-cleanup-workflow-/);
  assert.match(workflow, /\.github\/privileged-account-cleanup-dispatch-request/);
  assert.match(workflow, /Dispatch protected bank pilot workflow/);
  assert.match(workflow, /ops\/dispatch-bank-pilot-workflow-/);
  assert.match(workflow, /\.github\/bank-pilot-dispatch-request/);
  assert.match(workflow, /Unrecognized protected dispatcher/);
});

test('protected operation closer independently revalidates the dispatcher run', () => {
  assert.match(workflow, /SOURCE_WORKFLOW_ID/);
  assert.match(workflow, /repos\/\$REPOSITORY\/actions\/runs\/\$SOURCE_RUN_ID/);
  assert.match(workflow, /\.workflow_id == \$workflow_id/);
  assert.match(workflow, /\.event == "pull_request"/);
  assert.match(workflow, /\.status == "completed"/);
  assert.match(workflow, /\.conclusion == "success"/);
  assert.match(workflow, /\.head_repository\.full_name == \$repository/);
  assert.match(workflow, /Completed dispatcher run no longer matches/);
});

test('protected operation closer validates exactly one owner draft PR and one marker file', () => {
  assert.match(workflow, /-f state=all/);
  assert.match(workflow, /-f base=main/);
  assert.match(workflow, /-f head="\$REPOSITORY_OWNER:\$HEAD_BRANCH"/);
  assert.match(workflow, /Expected exactly one protected request PR/);
  assert.match(workflow, /\.\[0\]\.draft == true/);
  assert.match(workflow, /\.\[0\]\.user\.login == \$owner/);
  assert.match(workflow, /\.\[0\]\.head\.repo\.full_name == \$repository/);
  assert.match(workflow, /\.\[0\]\.head\.sha == \$sha/);
  assert.match(workflow, /\.\[0\]\.base\.ref == "main"/);
  assert.match(workflow, /\.\[0\]\.title == \$title/);
  assert.match(workflow, /pulls\/\$pr_number\/files/);
  assert.match(workflow, /"\$\{#files\[@\]\}" -eq 1/);
  assert.match(workflow, /"\$\{files\[0\]\}" == "\$EXPECTED_MARKER"/);
});

test('protected operation closer refuses merged requests and proves closed-without-merge state', () => {
  assert.match(workflow, /Protected operation request PR #\$pr_number was merged/);
  assert.match(workflow, /--method PATCH "repos\/\$REPOSITORY\/pulls\/\$REQUEST_PR" -f state=closed/);
  assert.match(workflow, /\.state == "closed" and \.merged_at == null/);
  assert.match(workflow, /Merged: `false`/);
  assert.match(workflow, /Hard-launch claim: `false`/);
});
