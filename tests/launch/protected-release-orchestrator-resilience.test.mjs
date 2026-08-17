import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../../.github/workflows/founder-release-orchestrator-one-shot.yml', import.meta.url),
  'utf8',
);

test('protected release retries GitHub reads before failing closed', () => {
  assert.match(workflow, /gh_get\(\) \{/);
  assert.match(workflow, /for attempt in 1 2 3 4 5; do/);
  assert.match(workflow, /GitHub API remained unavailable for required read/);
  assert.match(workflow, /current_json="\$\(gh_get "repos\/\$REPOSITORY\/commits\/main"\)"/);
});

test('protected release treats dispatch POST failures as ambiguous and correlates before retrying', () => {
  assert.match(workflow, /dispatch_and_locate\(\) \{/);
  assert.match(workflow, /for dispatch_attempt in 1 2 3; do/);
  assert.match(workflow, /dispatch POST attempt \$dispatch_attempt was inconclusive; checking for an exact-SHA run before any retry/);
  assert.match(workflow, /if find_new_exact_sha_run "\$observed_workflow" "\$baseline"; then/);
  assert.match(workflow, /if \[\[ "\$post_accepted" == "true" \]\]; then\s*fail "\$label dispatch was accepted but no exact-SHA run appeared; refusing a duplicate POST\."/);
});

test('every protected downstream dispatch uses retry-safe correlation', () => {
  assert.match(
    workflow,
    /dispatch_and_locate \\\s*firebase-production-dispatch-current-main\.yml \\\s*firebase-production-deploy\.yml/,
  );
  assert.match(
    workflow,
    /dispatch_and_locate \\\s*live-role-smoke\.yml \\\s*live-role-smoke\.yml/,
  );
  assert.match(
    workflow,
    /dispatch_and_locate \\\s*android-store-release\.yml \\\s*android-store-release\.yml/,
  );
  assert.match(workflow, /run_json="\$\(gh_get "repos\/\$REPOSITORY\/actions\/runs\/\$run_id"\)"/);
});
