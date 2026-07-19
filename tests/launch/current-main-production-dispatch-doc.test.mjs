import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('current-main dispatch documentation preserves protected deployment authority', async () => {
  const source = await readFile(new URL('../../docs/CURRENT_MAIN_PRODUCTION_DISPATCH.md', import.meta.url), 'utf8');
  assert.match(source, /Start Firebase Production Deploy/);
  assert.match(source, /exact-SHA comparison/);
  assert.match(source, /never deploys Firebase directly/);
  assert.match(source, /Admin MFA\/recovery preflight/);
});
