import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Admin production evidence never retains Firebase Auth or MFA response bodies', async () => {
  const sources = await Promise.all([
    read('tests/e2e/business-admin.spec.ts'),
    read('tests/e2e/helpers/adminMfa.ts'),
  ]);
  for (const source of sources) {
    assert.doesNotMatch(source, /firebaseAuthBody/);
    assert.doesNotMatch(source, /authResponse\.text\(/);
    assert.match(source, /firebaseAuthStatus/);
    assert.match(source, /identitytoolkit\.accounts:signInWithPassword/);
  }
});
