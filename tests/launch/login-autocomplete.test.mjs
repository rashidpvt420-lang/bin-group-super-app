import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('public login forms expose email and current-password autocomplete', async () => {
  const [login, ownerLanding, admin] = await Promise.all([
    read('src/pages/LoginPage.tsx'),
    read('src/pages/OwnerLandingPage.tsx'),
    read('apps/admin-panel/src/components/UnifiedLogin.tsx'),
  ]);

  for (const source of [login, ownerLanding]) {
    assert.match(source, /autoComplete="email"/);
    assert.match(source, /autoComplete: 'email'/);
    assert.match(source, /name="email"/);
    assert.match(source, /autoComplete="current-password"/);
    assert.match(source, /autoComplete: 'current-password'/);
    assert.match(source, /name="password"/);
  }

  assert.match(admin, /autoComplete="username"/);
  assert.match(admin, /autoComplete="current-password"/);
});
