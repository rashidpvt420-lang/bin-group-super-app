import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('START HERE resolves downstream runs from founder or GitHub Actions actor and exact SHA', async () => {
  const source = await read('.github/workflows/firebase-production-dispatch-current-main.yml');

  assert.match(source, /\.actor\.login == \$actor or \.actor\.login == "github-actions\[bot\]"/);
  assert.match(source, /\.head_sha == \$sha/);
  assert.match(source, /--arg sha "\$main_sha"/);
  assert.match(source, /run_sha.*==.*main_sha/);
  assert.match(source, /actions\/runs\/\$run_id\/cancel/);
});

test('START HERE cannot accept an unrelated recent workflow run', async () => {
  const source = await read('.github/workflows/firebase-production-dispatch-current-main.yml');
  const runLookupBlocks = source.match(/select\([^\n]+\.head_sha == \$sha[^\n]+\)/g) || [];

  assert.equal(runLookupBlocks.length, 2, 'run ID and run SHA lookups must both require the expected head SHA');
  for (const lookup of runLookupBlocks) {
    assert.match(lookup, /\.created_at >= \$started/);
    assert.match(lookup, /github-actions\[bot\]/);
  }
});
