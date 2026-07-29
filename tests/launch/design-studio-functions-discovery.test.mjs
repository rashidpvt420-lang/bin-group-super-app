import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('AI Design Studio does not depend on implicit default Storage bucket during Functions discovery', () => {
  const source = readFileSync('functions/aiDesignStudio.ts', 'utf8');

  assert.match(source, /const STORAGE_BUCKET = "bin-group-57c60\.firebasestorage\.app";/);
  assert.match(source, /admin\.storage\(\)\.bucket\(STORAGE_BUCKET\)/);
  assert.doesNotMatch(source, /admin\.storage\(\)\.bucket\(\)/);
});
