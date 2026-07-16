import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const hardener = path.join(root, 'scripts/harden-final-firestore-authority.mjs');

test('final Firestore authority hardener is status-aware, explicit and idempotent', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'bin-final-firestore-authority-'));
  try {
    const target = path.join(directory, 'firestore.rules');
    writeFileSync(target, readFileSync(path.join(root, 'firestore.rules')));

    const first = spawnSync(process.execPath, [hardener], { cwd: directory, encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr || first.stdout);

    const rules = readFileSync(target, 'utf8');
    assert.match(rules, /function profileAllowsAccess\(data\)/);
    assert.match(rules, /data\.get\('status', ''\) in \[/);
    assert.match(rules, /function hasDispatchAuthorityClaimOnly\(\)/);
    assert.match(rules, /return hasDispatchAuthorityClaimOnly\(\) && isNotSuspended\(\);/);
    assert.match(rules, /match \/fcmTokens\/\{tokenId\} \{/);
    assert.match(rules, /match \/deviceReadiness\/\{readinessId\} \{/);
    assert.match(rules, /match \/\{subcollection\}\/\{document=\*\*\} \{\n\s*allow read, write: if false;/);
    assert.match(rules, /tenantOwns\(resource\.data\) &&\n\s*isNotSuspended\(\) &&/);
    assert.match(rules, /techOwns\(resource\.data\) &&\n\s*isNotSuspended\(\) &&\n\s*isApprovedTechnician\(\) &&/);
    assert.doesNotMatch(
      rules,
      /get\(\/databases\/\$\(database\)\/documents\/users\/\$\(request\.auth\.uid\)\)\.data\.get\('suspended', false\) != true/,
    );

    const beforeSecond = readFileSync(target);
    const second = spawnSync(process.execPath, [hardener], { cwd: directory, encoding: 'utf8' });
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.deepEqual(readFileSync(target), beforeSecond);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
