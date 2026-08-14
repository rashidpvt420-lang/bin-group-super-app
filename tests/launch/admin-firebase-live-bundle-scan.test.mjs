import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = process.cwd();

function firebaseBundle() {
  return `const firebaseConfig = {
    apiKey: 'AIza${'A'.repeat(35)}',
    authDomain: 'bin-group-57c60.firebaseapp.com',
    projectId: 'bin-group-57c60',
    storageBucket: 'bin-group-57c60.firebasestorage.app',
    messagingSenderId: '123413252227',
    appId: '1:123413252227:web:285cb53bc26626d699f3b6',
  };`;
}

function runVerifier(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/verify-admin-firebase-build.mjs', ...args], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}

test('Admin Firebase verifier follows lazy-loaded same-origin JavaScript chunks', async () => {
  const buildDir = mkdtempSync(path.join(tmpdir(), 'admin-firebase-build-'));
  const server = createServer((request, response) => {
    const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
    const content = {
      '/': '<!doctype html><script src="/static/js/main.js"></script>',
      '/asset-manifest.json': JSON.stringify({ entrypoints: ['/static/js/main.js'] }),
      '/static/js/main.js': 'const configChunk = "/static/js/firebase-config.chunk.js";',
      '/static/js/firebase-config.chunk.js': firebaseBundle(),
    }[pathname];
    if (content === undefined) {
      response.writeHead(404).end('missing');
      return;
    }
    response.writeHead(200, { 'content-type': pathname.endsWith('.json') ? 'application/json' : 'text/javascript' });
    response.end(content);
  });

  try {
    mkdirSync(path.join(buildDir, 'static', 'js'), { recursive: true });
    writeFileSync(path.join(buildDir, 'static', 'js', 'main.js'), firebaseBundle());
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    const url = `http://127.0.0.1:${address.port}`;

    const result = await runVerifier(['--build', buildDir, '--include-live', '--url', url]);
    assert.equal(result.code, 0, `${result.stderr}\n${result.stdout}`);
    assert.match(result.stdout, /live bundle assets=2/);
    assert.match(result.stdout, /admin-live/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(buildDir, { recursive: true, force: true });
  }
});

test('Admin Messaging worker loads generated canonical Firebase configuration', () => {
  const worker = readFileSync(path.join(root, 'apps/admin-panel/public/firebase-messaging-sw.js'), 'utf8');
  const generator = readFileSync(path.join(root, 'scripts/write-admin-firebase-messaging-config.mjs'), 'utf8');
  assert.match(worker, /importScripts\('\/firebase-messaging-config\.js'\)/);
  assert.match(worker, /firebase\.initializeApp\(self\.__BIN_GROUP_ADMIN_FIREBASE_CONFIG\)/);
  assert.match(worker, /firebasejs\/10\.14\.1\/firebase-app-compat\.js/);
  assert.doesNotMatch(worker, /AIza|REPLACED_BY_BUILD|admin-panel-id/);
  assert.match(generator, /REACT_APP_FIREBASE_API_KEY/);
  assert.match(generator, /projectId:\s*'bin-group-57c60'/);
  assert.match(generator, /storageBucket:\s*'bin-group-57c60\.firebasestorage\.app'/);
  assert.match(generator, /appId:\s*'1:123413252227:web:285cb53bc26626d699f3b6'/);
  assert.match(generator, /__BIN_GROUP_ADMIN_FIREBASE_CONFIG/);
});
