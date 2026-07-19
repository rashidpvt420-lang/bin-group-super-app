import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('current-main dispatcher has GitHub-only permissions and no cloud credential bindings', async () => {
  const source = await readFile(new URL('../../.github/workflows/firebase-production-dispatch-current-main.yml', import.meta.url), 'utf8');
  assert.match(source, /permissions:\r?\n\s+contents: read\r?\n\s+actions: write/);
  assert.doesNotMatch(source, /id-token:\s*write/);
  assert.doesNotMatch(source, /workload_identity_provider/);
  assert.doesNotMatch(source, /service_account/);
});
