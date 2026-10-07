import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../src/owner/pages/OwnerPropertiesPage.tsx', import.meta.url), 'utf8');

test('Owner properties fail closed instead of hanging when authenticated identity is unavailable', () => {
  assert.match(source, /if \(!user\?\.uid\) \{[\s\S]*setProperties\(\[\]\);[\s\S]*setLoadError\([\s\S]*setLoading\(false\)/);
});

test('Owner properties ignore stale async passport enrichment after a newer portfolio snapshot', () => {
  assert.match(source, /let snapshotVersion = 0/);
  assert.match(source, /const version = \+\+snapshotVersion/);
  const guards = source.match(/version !== snapshotVersion/g) || [];
  assert.ok(guards.length >= 2, 'success and enrichment-failure paths must both reject stale snapshots');
});

test('Owner properties render in the light RTL-aware Owner shell with real navigation controls', () => {
  assert.match(source, /direction: isRTL \? 'rtl' : 'ltr'/);
  assert.match(source, /useLanguage\(\)/);
  assert.match(source, /data-testid="owner-register-property"/);
  assert.match(source, /navigate\('\/onboarding'\)/);
  assert.match(source, /bgcolor: '#FFFFFF'/);
  assert.match(source, /binThemeTokens\.textPrimary/);
  assert.match(source, /binThemeTokens\.textSecondary/);
});
