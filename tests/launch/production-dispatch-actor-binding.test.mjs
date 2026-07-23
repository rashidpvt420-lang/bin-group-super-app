import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const workflowPath = '.github/workflows/firebase-production-dispatch-current-main.yml';

test('START HERE resolves only a newly created downstream run on the exact SHA', async () => {
  const source = await read(workflowPath);

  assert.match(source, /baseline_ids=.*\.workflow_runs\[\]\.id/);
  assert.match(source, /select\(\.head_sha == \$sha\)/);
  assert.match(source, /select\(\(\.id as \$id \| \(\$old \| index\(\$id\)\)\) == null\)/);
  assert.match(source, /--arg sha "\$main_sha"/);
  assert.match(source, /run_sha.*==.*main_sha/);
  assert.doesNotMatch(source, /\.actor\.login/);
});

test('START HERE dispatches once and never creates duplicates when run discovery is delayed', async () => {
  const source = await read(workflowPath);

  assert.equal((source.match(/firebase-production-deploy\.yml\/dispatches/g) || []).length, 1);
  assert.match(source, /for poll in \$\(seq 1 60\)/);
  assert.match(source, /no new exact-SHA run was observable after 120 seconds/i);
  assert.match(source, /No duplicate dispatch was attempted/);
});

test('START HERE cancels a resolved run when main advances after dispatch', async () => {
  const source = await read(workflowPath);

  assert.match(source, /current_main.*!=.*main_sha/);
  assert.match(source, /actions\/runs\/\$run_id\/cancel/);
});
