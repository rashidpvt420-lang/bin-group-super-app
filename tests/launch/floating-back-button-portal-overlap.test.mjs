import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const nav = await readFile('src/components/navigation/NavigationControl.tsx', 'utf8');

test('floating Back is hidden on portals that render their own header Back', () => {
  for (const prefix of ['/owner', '/tenant', '/technician', '/tech', '/broker', '/staff']) {
    assert.ok(nav.includes(`'${prefix}'`), `missing portal prefix ${prefix}`);
  }
  assert.match(nav, /portalRoutePrefixes\.some\(/);
});

test('floating Back no longer sits on the header row', () => {
  assert.doesNotMatch(nav, /top:\s*\{\s*xs:\s*104/);
  assert.match(nav, /bottom:/);
  assert.match(nav, /safe-area-inset-bottom/);
});
