import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('owner Private HR command is exact-owner, exact-main, conditional-execute and fail-closed', async () => {
  const workflow = await read('.github/workflows/owner-private-hr-migration-command.yml');

  assert.match(workflow, /^name:\s*Owner Private HR Migration Command/m);
  assert.match(workflow, /^\s{2}issue_comment:/m);
  assert.match(workflow, /github\.event\.issue\.number == 434/);
  assert.match(workflow, /!github\.event\.issue\.pull_request/);
  assert.match(workflow, /github\.event\.comment\.user\.login == github\.repository_owner/);
  assert.match(workflow, /github\.event\.comment\.author_association == 'OWNER'/);
  assert.match(workflow, /github\.event\.comment\.body == '\/bin-launch migrate-private-hr'/);
  assert.match(workflow, /actions:\s*write/);
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /issues:\s*write/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);

  assert.match(workflow, /first_sha=.*commits\/main/);
  assert.match(workflow, /second_sha=.*commits\/main/);
  assert.match(workflow, /\[\[ "\$first_sha" == "\$second_sha" \]\]/);
  assert.match(workflow, /ref:\s*\$\{\{ steps\.release\.outputs\.sha \}\}/);
  assert.match(workflow, /private-hr-migration-dispatch-current-main\.yml\/dispatches/);
  assert.match(workflow, /REVIEW_PRIVATE_HR_MIGRATION_BIN_GROUP/);
  assert.match(workflow, /MIGRATE_PRIVATE_HR_BIN_GROUP_57C60/);

  assert.match(workflow, /\.schemaVersion == 2/);
  assert.match(workflow, /\.commitSha == \$sha/);
  assert.match(workflow, /\.workflowRunId == \$run/);
  assert.match(workflow, /\.mode == "DRY_RUN"/);
  assert.match(workflow, /\.mode == "EXECUTE"/);
  assert.match(workflow, /\.recordsRequiringMigration == \$expected/);
  assert.match(workflow, /\.migrated == \$expected/);
  assert.match(workflow, /\.verified == \$expected/);
  assert.match(workflow, /\.failureCount == 0/);
  assert.match(workflow, /\.recordsRequiringMigration == 0/);
  assert.match(workflow, /\.executionRequired == false/);
  assert.match(workflow, /SKIP_EXECUTE_PROCEED_TO_BANK_PILOT/);
  assert.match(workflow, /MIGRATION_EXECUTED_VERIFY_REPORT/);
  assert.match(workflow, /\.sensitiveValuesLogged == false/);
  assert.match(workflow, /\.rawIdentifiersLogged == false/);
  assert.match(workflow, /\.hardLaunchClaim == false/);

  const executeIndex = workflow.indexOf('dispatch_current_main execute MIGRATE_PRIVATE_HR_BIN_GROUP_57C60');
  const finalDryRunIndex = workflow.indexOf('final_record="$(dispatch_current_main dry-run REVIEW_PRIVATE_HR_MIGRATION_BIN_GROUP');
  assert.ok(executeIndex > 0 && finalDryRunIndex > executeIndex, 'final clean dry-run must happen after any protected execute run');
  assert.match(workflow, /latest_main=.*commits\/main/);
  assert.match(workflow, /\[\[ "\$latest_main" == "\$RELEASE_SHA" \]\]/);
});
