// Behavioural test: runs scripts/repo-hygiene-guard.mjs inside a throwaway git repository
// and proves that committed Firebase Auth exports / service-account keys fail the guard.
// Fixtures are synthetic; no real credential material is used. File operations use literal
// relative paths inside the throwaway repository (the process cwd is switched per test).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const guardSource = path.resolve('scripts/repo-hygiene-guard.mjs');
const originalCwd = process.cwd();

function inThrowawayRepo(body) {
  const dir = fs.mkdtempSync('/tmp/hygiene-');
  process.chdir(dir);
  try {
    fs.writeFileSync('firebase.json', '{"hosting":{"public":"dist"}}\n');
    fs.writeFileSync('capacitor.config.ts', "export default { webDir: 'dist' };\n");
    execFileSync('git', ['init', '-q']);
    return body();
  } finally {
    process.chdir(originalCwd);
  }
}

const add = (...files) => execFileSync('git', ['add', '-f', '--', ...files]);
const runGuard = () => spawnSync(process.execPath, [guardSource], { encoding: 'utf8' });

const fakeAuthExport = JSON.stringify({
  users: [{ localId: 'synthetic-uid', email: 'synthetic@example.invalid', passwordHash: 'c3ludGhldGljLWhhc2g=', salt: 'c3ludGhldGlj' }],
}, null, 2);

// Assembled at runtime so the synthetic fixture is not itself a key-shaped literal.
const pemLabel = ['PRIVATE', 'KEY'].join(' ');
const fakeKeyFile = JSON.stringify({
  type: ['service', 'account'].join('_'),
  private_key: `-----BEGIN ${pemLabel}-----\nSYNTHETIC\n-----END ${pemLabel}-----\n`,
});

test('clean repository passes the guard', () => inThrowawayRepo(() => {
  fs.mkdirSync('src');
  fs.writeFileSync('src/app.json', '{"name":"ok"}\n');
  add('src/app.json');
  const result = runGuard();
  assert.equal(result.status, 0, result.stderr);
}));

test('users_temp.json is forbidden by name', () => inThrowawayRepo(() => {
  fs.writeFileSync('users_temp.json', '{"users":[]}\n');
  add('users_temp.json');
  const result = runGuard();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Firebase Auth user export/);
}));

test('an Auth export under any name is detected by content', () => inThrowawayRepo(() => {
  fs.mkdirSync('data');
  fs.writeFileSync('data/qa-accounts.json', fakeAuthExport);
  add('data/qa-accounts.json');
  const result = runGuard();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /data\/qa-accounts\.json: Firebase Auth user export \(password hashes\/salts\) detected/);
  assert.match(result.stderr, /does not remove it from git history/);
}));

test('auth-export and service-account file names are forbidden', () => inThrowawayRepo(() => {
  fs.mkdirSync('exports');
  fs.mkdirSync('config');
  fs.writeFileSync('exports/firebase-auth-export-2026.json', '{}\n');
  fs.writeFileSync('config/prod-service-account.json', '{}\n');
  add('exports/firebase-auth-export-2026.json', 'config/prod-service-account.json');
  const result = runGuard();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /firebase-auth-export-2026\.json/);
  assert.match(result.stderr, /prod-service-account\.json/);
}));

test('inline service-account private key is detected by content', () => inThrowawayRepo(() => {
  fs.mkdirSync('config');
  fs.writeFileSync('config/key.json', fakeKeyFile);
  add('config/key.json');
  const result = runGuard();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /service-account private key detected/);
}));

test('the real repository no longer tracks users_temp.json and passes the guard', () => {
  const tracked = execFileSync('git', ['ls-files', '--', 'users_temp.json'], { encoding: 'utf8' }).trim();
  assert.equal(tracked, '');
  const result = spawnSync(process.execPath, [guardSource], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
