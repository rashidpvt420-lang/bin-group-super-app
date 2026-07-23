import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('START HERE correlates the downstream run by baseline exclusion and exact SHA, not actor identity', async () => {
  const source = await read('.github/workflows/firebase-production-dispatch-current-main.yml');

  assert.match(source, /before_ids=/);
  assert.match(source, /\$before \| index\(\(\$run\.id \| tostring\)\)\) == null/);
  assert.match(source, /\$run\.head_sha == \$sha/);
  assert.match(source, /\$run\.event == "workflow_dispatch"/);
  assert.match(source, /\$run\.head_branch == "main"/);
  assert.doesNotMatch(source, /\.actor\.login == \$actor/);
  assert.match(source, /main_after_dispatch/);
  assert.match(source, /actions\/runs\/\$run_id\/cancel/);
});

test('START HERE cannot accept an unrelated recent or pre-existing workflow run', async () => {
  const source = await read('.github/workflows/firebase-production-dispatch-current-main.yml');
  const resolverSection = source.match(/selected_run=''[\s\S]*?if \[\[ -z "\$selected_run" \]\]/)?.[0] || '';

  assert.match(resolverSection, /\$run\.head_sha == \$sha/);
  assert.match(resolverSection, /\$run\.event == "workflow_dispatch"/);
  assert.match(resolverSection, /\$run\.head_branch == "main"/);
  assert.match(resolverSection, /\$before \| index\(\(\$run\.id \| tostring\)\)\) == null/);
  assert.match(resolverSection, /sort_by\(\.created_at, \.id\)/);
});

test('START HERE does not redispatch when GitHub run discovery is delayed', async () => {
  const source = await read('.github/workflows/firebase-production-dispatch-current-main.yml');

  assert.equal((source.match(/firebase-production-deploy\.yml\/dispatches/g) || []).length, 1);
  assert.match(source, /no new exact-SHA Firebase Production Deploy run appeared within 120 seconds/i);
  assert.match(source, /No second deployment was dispatched/);
});
