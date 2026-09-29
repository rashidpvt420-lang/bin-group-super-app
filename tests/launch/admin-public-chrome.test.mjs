import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path);

test('admin public chrome keeps support, the launcher icon, and the terms spelling outside the login wall', async () => {
  const [index, manifest, adminTerms, rootTerms, ownerTerms, logo, logo192] = await Promise.all([
    read('apps/admin-panel/public/index.html').then((buf) => buf.toString('utf8')),
    read('apps/admin-panel/public/manifest.json').then((buf) => buf.toString('utf8')),
    read('apps/admin-panel/public/terms-of-service.html').then((buf) => buf.toString('utf8')),
    read('public/terms-of-service.html').then((buf) => buf.toString('utf8')),
    read('apps/owner-app/public/terms-of-service.html').then((buf) => buf.toString('utf8')),
    read('apps/admin-panel/public/logo.png'),
    read('apps/admin-panel/public/logo192.png'),
  ]);

  assert.match(index, /href="https:\/\/www\.bin-groups\.com\/support"/);
  assert.doesNotMatch(index, /href="\/support"/);
  assert.match(index, /apple-touch-icon" href="\/logo\.png"/);
  assert.match(manifest, /"src": "\/logo\.png"/);

  assert.equal(logo.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(logo192.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(logo.length > 1000);
  assert.ok(logo192.length > 1000);

  for (const terms of [adminTerms, rootTerms, ownerTerms]) {
    assert.match(terms, /Circumvent "Morning Gate" or "Visual Gate" security protocols\./);
    assert.doesNotMatch(terms, /Circvent/);
  }
});
