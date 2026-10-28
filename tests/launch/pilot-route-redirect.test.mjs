import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
const spec = readFileSync(new URL('../e2e/hard-launch-routes.spec.ts', import.meta.url), 'utf8');

test('/pilot redirects to the public home page and does not mount the internal launch page', () => {
  assert.match(app, /<Route path="\/pilot" element=\{<Navigate to="\/" replace \/>\} \/>/);
  assert.doesNotMatch(app, /<Route path="\/pilot" element=\{<PilotLaunchPage/);
});

test('live hard-launch route audit expects the /pilot redirect, not an exact /pilot route', () => {
  const list = spec.match(/const publicRoutes = \[([\s\S]*?)\] as const;/);
  assert.ok(list, 'publicRoutes list must exist');
  assert.doesNotMatch(list[1], /'\/pilot'/, '/pilot redirects, so it cannot be in the exact-route list');
  assert.match(spec, /Retired \/pilot internal page redirects visitors to the public home page/);
  assert.match(spec, /goto\('\/pilot'[\s\S]{0,400}\.toBe\('\/'\)/);
});
