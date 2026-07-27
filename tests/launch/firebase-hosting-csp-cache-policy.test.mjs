import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const firebaseJson = JSON.parse(await readFile(new URL('../../firebase.json', import.meta.url), 'utf8'));

function hostingTarget(name) {
  return firebaseJson.hosting.find((target) => target.target === name);
}

function cspFor(target) {
  return target.headers
    .flatMap((entry) => entry.headers || [])
    .find((header) => header.key === 'Content-Security-Policy')?.value || '';
}

function cacheEntries(target) {
  return target.headers
    .filter((entry) => (entry.headers || []).some((header) => header.key === 'Cache-Control'))
    .map((entry) => ({
      source: entry.source,
      value: entry.headers.find((header) => header.key === 'Cache-Control').value,
    }));
}

test('Hosting script CSP removes unsafe inline and eval while leaving style hardening staged', () => {
  for (const targetName of ['app', 'admin']) {
    const csp = cspFor(hostingTarget(targetName));
    const script = csp.match(/script-src\s+([^;]+)/)?.[1] || '';
    const style = csp.match(/style-src\s+([^;]+)/)?.[1] || '';
    assert.doesNotMatch(script, /'unsafe-inline'|'unsafe-eval'/, `${targetName} script-src must not allow unsafe script execution`);
    assert.match(style, /'unsafe-inline'/, `${targetName} style-src remains staged for MUI Emotion runtime styles`);
  }
});

test('Hosting cache policy excludes app shells and workers from immutable asset caching', () => {
  const appEntries = cacheEntries(hostingTarget('app'));
  const adminEntries = cacheEntries(hostingTarget('admin'));
  assert.ok(appEntries.some((entry) => entry.source === '/assets/**' && /immutable/.test(entry.value)));
  assert.ok(adminEntries.some((entry) => entry.source === '/static/**' && /immutable/.test(entry.value)));
  for (const entries of [appEntries, adminEntries]) {
    assert.ok(entries.some((entry) => entry.source === '/' && /no-store/.test(entry.value)));
    assert.ok(entries.some((entry) => entry.source === '/index.html' && /no-store/.test(entry.value)));
    assert.ok(entries.some((entry) => entry.source === '/firebase-messaging-sw.js' && /no-store/.test(entry.value)));
    assert.ok(entries.some((entry) => entry.source === '/manifest.json' && /no-store/.test(entry.value)));
    assert.ok(!entries.some((entry) => entry.source.includes('*.@(js|css|woff2)')), 'broad JS/CSS immutable glob would catch service workers');
  }
});
