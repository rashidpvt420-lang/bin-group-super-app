import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('checked-in Firestore rules retain Phase 2 identity and launch-evidence authority', async () => {
  const rules = await read('firestore.rules');

  assert.match(rules, /match \/property_identity_registry\/\{identityHash\}/);
  assert.match(rules, /allow read, create, update, delete: if false/);
  assert.match(rules, /'property_identity_registry'/);

  for (const collection of ['launch_evidence', 'signed_in_smoke_checks']) {
    const marker = `match /${collection}/{`;
    const start = rules.indexOf(marker);
    assert.ok(start >= 0, `missing ${collection} rule`);
    const block = rules.slice(start, start + 900);
    assert.match(block, /source', ''\) != 'github-actions'/);
    assert.match(block, /executionGenerated', false\) != true/);
    assert.match(block, /hardLaunchClaim', false\) != true/);
    assert.match(block, /allow update, delete: if false/);
  }
});
