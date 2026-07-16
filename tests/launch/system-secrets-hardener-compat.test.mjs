import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const hardener = path.join(root, 'scripts/harden-system-secrets-rules.mjs');

function runHardener(source) {
  const directory = mkdtempSync(path.join(tmpdir(), 'bin-system-secret-rules-'));
  try {
    const target = path.join(directory, 'firestore.rules');
    writeFileSync(target, source);
    const result = spawnSync(process.execPath, [hardener], { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return readFileSync(target, 'utf8');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const header = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function hasAdminClaim() { return request.auth != null; }
`;
const footer = `
  }
}
`;

test('system-secret hardener migrates the legacy unrestricted catch-all', () => {
  const legacy = `${header}
    match /{document=**} {
      allow read: if hasAdminClaim();
      allow create: if hasAdminClaim();
      allow update: if hasAdminClaim();
      allow delete: if hasAdminClaim();
    }
${footer}`;
  const hardened = runHardener(legacy);
  assert.match(hardened, /match \/system_secrets\/\{secretId\} \{\n\s*allow read, write: if false;/);
  assert.match(hardened, /allow read: if collection != 'system_secrets' && hasAdminClaim\(\);/);
  assert.match(hardened, /allow create: if collection != 'system_secrets' && hasAdminClaim\(\);/);
  assert.doesNotMatch(hardened, /match \/\{document=\*\*\}/);
});

test('system-secret hardener preserves the stronger list-style catch-all', () => {
  const source = `${header}
    match /system_secrets/{secretId} {
      allow read, write: if false;
    }

    match /{collection}/{document=**} {
      allow read: if !(collection in ['system_secrets', 'users']) && hasAdminClaim();
      allow create: if !(
        collection in [
          'system_secrets',
          'users'
        ]
      ) && hasAdminClaim();
      allow update, delete: if !(
        collection in [
          'system_secrets',
          'users'
        ]
      ) && hasAdminClaim();
    }
${footer}`;
  const hardened = runHardener(source);
  assert.equal(hardened, source);
});
