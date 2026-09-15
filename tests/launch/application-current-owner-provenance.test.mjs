import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../scripts/run-frozen-release-evidence.mjs', import.meta.url), 'utf8');

test('application evidence provenance recognizes only reviewed exact owner command forms', () => {
  assert.match(
    source,
    /`\/bin-launch evidence application-all \$\{controlSha\} \$\{releaseSha\} \$\{deployRunId\}`/,
  );
  assert.match(
    source,
    /`\/bin-launch evidence application-current \$\{controlSha\} \$\{releaseSha\} \$\{deployRunId\}`/,
  );
  assert.match(source, /comment\?\.user\?\.login === CANONICAL_FOUNDER_LOGIN/);
  assert.match(source, /comment\?\.author_association === 'OWNER'/);
  assert.match(source, /expectedBodies\.has\(String\(comment\?\.body \|\| ''\)\.trim\(\)\)/);
  assert.match(source, /createdMs >= runCreatedMs - 10 \* 60 \* 1000/);
  assert.match(source, /createdMs <= runCreatedMs \+ 2 \* 60 \* 1000/);
  assert.doesNotMatch(source, /startsWith\([^\n]*application-(?:all|current)/);
});
