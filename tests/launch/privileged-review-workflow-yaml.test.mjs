import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../../.github/workflows/privileged-account-review-request.yml', import.meta.url),
  'utf8',
);

test('protected review workflow keeps all jobs and production protection', () => {
  assert.match(source, /^name: Privileged Account Review Request$/m);
  assert.match(source, /^  review:$/m);
  assert.match(source, /^  announce_play_certificate:$/m);
  assert.match(source, /^  export_play_certificate:$/m);
  assert.match(source, /^    environment: production$/m);
  assert.match(source, /mutationPerformed == false/);
  assert.match(source, /hardLaunchClaim == false/);
});

test('multiline issue bodies remain inside YAML run block scalars', () => {
  const lines = source.split('\n');
  let blockCount = 0;
  let inBody = false;

  for (const [index, line] of lines.entries()) {
    if (!inBody && /^\s{10,}body="## /.test(line)) {
      inBody = true;
      blockCount += 1;
      continue;
    }
    if (!inBody) continue;

    const indentation = line.length - line.trimStart().length;
    assert.ok(
      indentation >= 10,
      `multiline body escaped the run block scalar at line ${index + 1}`,
    );

    if (line.includes('Hard-launch claim:') && line.trimEnd().endsWith('"')) {
      inBody = false;
    }
  }

  assert.equal(inBody, false, 'multiline issue body must terminate inside its run block');
  assert.equal(blockCount, 4, 'all four protected workflow issue bodies must be checked');
});
