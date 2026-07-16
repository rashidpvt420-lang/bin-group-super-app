import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const hardener = path.join(root, 'scripts/harden-suspension-access-rules.mjs');

test('suspension hardening matches production status fields and is idempotent', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'bin-suspension-rules-'));
  try {
    mkdirSync(directory, { recursive: true });
    const target = path.join(directory, 'firestore.rules');
    writeFileSync(target, readFileSync(path.join(root, 'firestore.rules')));

    const first = spawnSync(process.execPath, [hardener], { cwd: directory, encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr || first.stdout);

    const rules = readFileSync(target, 'utf8');
    assert.match(rules, /function profileAllowsAccess\(data\)/);
    assert.match(rules, /data\.get\('status', ''\) in \[/);
    for (const status of ['suspended', 'SUSPENDED', 'disabled', 'DISABLED', 'rejected', 'REJECTED']) {
      assert.match(rules, new RegExp(`'${status}'`));
    }
    assert.match(rules, /allow list: if isNotSuspended\(\) && \(/);
    assert.match(rules, /match \/\{subcollection\}\/\{document=\*\*\} \{/);
    assert.doesNotMatch(
      rules,
      /allow read: if \(signedIn\(\) && request\.auth\.uid == userId\) \|\| canReadUserDirectory\(\);/,
    );

    const beforeSecond = readFileSync(target);
    const second = spawnSync(process.execPath, [hardener], { cwd: directory, encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.deepEqual(readFileSync(target), beforeSecond);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
