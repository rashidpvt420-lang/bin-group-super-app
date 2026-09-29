// Behavioural test: runs scripts/repo-hygiene-guard.mjs inside a throwaway git repository
// and proves that committed Firebase Auth exports / service-account keys fail the guard.
// Fixtures are synthetic; no real credential material is used.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const guardSource = path.resolve('scripts/repo-hygiene-guard.mjs');

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hygiene-'));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.copyFileSync(guardSource, path.join(dir, 'scripts', 'repo-hygiene-guard.mjs'));
  fs.writeFileSync(path.join(dir, 'firebase.json'), '{"hosting":{"public":"dist"}}\n');
  fs.writeFileSync(path.join(dir, 'capacitor.config.ts'), "export default { webDir: 'dist' };\n");
  execFileSync('git', ['init', '-q'], { cwd: dir });
  return dir;
}

function track(dir, rel, content) {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.writeFileSync(path.join(dir, rel), content);
  execFileSync('git', ['add', '-f', rel], { cwd: dir });
}

function runGuard(dir) {
  return spawnSync(process.execPath, ['scripts/repo-hygiene-guard.mjs'], { cwd: dir, encoding: 'utf8' });
}

const fakeAuthExport = JSON.stringify({
  users: [{ localId: 'synthetic-uid', email: 'synthetic@example.invalid', passwordHash: 'c3ludGhldGljLWhhc2g=', salt: 'c3ludGhldGlj' }],
}, null, 2);

test('clean repository passes the guard', () => {
  const dir = makeRepo();
  track(dir, 'src/app.json', '{"name":"ok"}\n');
  const result = runGuard(dir);
  assert.equal(result.status, 0, result.stderr);
});

test('users_temp.json is forbidden by name', () => {
  const dir = makeRepo();
  track(dir, 'users_temp.json', '{"users":[]}\n');
  const result = runGuard(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Firebase Auth user export/);
});

test('an Auth export under any name is detected by content', () => {
  const dir = makeRepo();
  track(dir, 'data/qa-accounts.json', fakeAuthExport);
  const result = runGuard(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /data\/qa-accounts\.json: Firebase Auth user export \(password hashes\/salts\) detected/);
  assert.match(result.stderr, /does not remove it from git history/);
});

test('auth-export and service-account file names are forbidden', () => {
  const dir = makeRepo();
  track(dir, 'exports/firebase-auth-export-2026.json', '{}\n');
  track(dir, 'config/prod-service-account.json', '{}\n');
  const result = runGuard(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /firebase-auth-export-2026\.json/);
  assert.match(result.stderr, /prod-service-account\.json/);
});

test('inline service-account private key is detected by content', () => {
  const dir = makeRepo();
  track(dir, 'config/key.json', JSON.stringify({ type: 'service_account', private_key: '-----BEGIN PRIVATE KEY-----\nSYNTHETIC\n-----END PRIVATE KEY-----\n' }));
  const result = runGuard(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /service-account private key detected/);
});

test('the real repository no longer tracks users_temp.json and passes the guard', () => {
  const tracked = execFileSync('git', ['ls-files', '--', 'users_temp.json'], { encoding: 'utf8' }).trim();
  assert.equal(tracked, '');
  const result = spawnSync(process.execPath, [guardSource], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
