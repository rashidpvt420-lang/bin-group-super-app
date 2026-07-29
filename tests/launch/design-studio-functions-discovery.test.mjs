import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const importTimeStorageUsers = [
  'functions/aiDesignStudio.ts',
  'functions/titleDeedOcrV2.ts',
];

test('import-time Storage users do not depend on implicit default bucket during Functions discovery', () => {
  for (const file of importTimeStorageUsers) {
    const source = readFileSync(file, 'utf8');

    assert.match(source, /const STORAGE_BUCKET = "bin-group-57c60\.firebasestorage\.app";/, `${file} must bind the production bucket name`);
    assert.match(source, /admin\.storage\(\)\.bucket\(STORAGE_BUCKET\)/, `${file} must use the explicit bucket constant`);
    assert.doesNotMatch(source, /admin\.storage\(\)\.bucket\(\)/, `${file} must not rely on Admin SDK default bucket configuration`);
  }
});
