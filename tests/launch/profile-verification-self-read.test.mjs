import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repoRoot = process.cwd();

test('rules normalization keeps an authenticated account able to read its own profile status', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'bin-profile-self-read-'));

  try {
    copyFileSync(join(repoRoot, 'firestore.rules'), join(tempDir, 'firestore.rules'));
    copyFileSync(
      join(repoRoot, 'scripts', 'normalize-firestore-rules.mjs'),
      join(tempDir, 'normalize-firestore-rules.mjs'),
    );

    const result = spawnSync(process.execPath, ['normalize-firestore-rules.mjs'], {
      cwd: tempDir,
      encoding: 'utf8',
    });

    assert.equal(
      result.status,
      0,
      `normalizer failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );

    const rules = readFileSync(join(tempDir, 'firestore.rules'), 'utf8');
    const usersStart = rules.indexOf('    match /users/{userId} {');
    const usersEnd = rules.indexOf('\n    match /', usersStart + 1);

    assert.ok(usersStart >= 0, 'users rule block is missing');
    const usersBlock = rules.slice(usersStart, usersEnd > usersStart ? usersEnd : rules.length);

    assert.match(
      usersBlock,
      /allow get: if request\.auth != null && \(\s*request\.auth\.uid == userId \|\|/,
      'a signed-in account must be able to read its own users/{uid} profile even when the profile contains a blocked status',
    );
    assert.doesNotMatch(
      usersBlock,
      /request\.auth\.uid == userId && \(resource == null \|\| profileAllowsAccess\(resource\.data\)\)/,
      'self profile reads must not depend on profileAllowsAccess, otherwise blocked status is hidden from the client',
    );
    assert.match(
      usersBlock,
      /signedIn\(\) &&\s*request\.auth\.uid != userId &&\s*isNotSuspended\(\)/,
      'non-self user reads must remain suspension-gated',
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
