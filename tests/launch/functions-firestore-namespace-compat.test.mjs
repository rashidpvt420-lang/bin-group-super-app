import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

test('Functions files explicitly import the FirebaseFirestore type namespace', () => {
  // Include new source files before commit, so local validation matches CI.
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', 'functions/*.ts'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .filter((file) => /FirebaseFirestore\./.test(readFileSync(file, 'utf8')));

  assert.ok(files.length > 20, 'expected to find the legacy Firestore namespace call sites');
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    assert.match(
      source,
      /import type \* as FirebaseFirestore from ["']firebase-admin\/firestore["'];/,
      `${file} uses FirebaseFirestore.* without an explicit type-only import`,
    );
    assert.doesNotMatch(source, /declare global\s*\{\s*namespace FirebaseFirestore/s, `${file} must not reintroduce an ambient namespace shim`);
  }
});
