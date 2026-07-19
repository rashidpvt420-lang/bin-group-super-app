import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Admin command cards use registered route paths only', async () => {
  const [dashboard, app] = await Promise.all([
    read('apps/admin-panel/src/pages/dashboard/AdminSimpleDashboardPage.tsx'),
    read('apps/admin-panel/src/App.tsx'),
  ]);

  const actionBlock = dashboard.match(/const adminActions = \[[\s\S]*?\n\];/)?.[0] || '';
  const routes = [...actionBlock.matchAll(/route: '([^']+)'/g)].map((match) => match[1]);

  assert.ok(routes.length >= 10, 'Admin command center should expose the complete operational shortcut set');
  assert.equal(new Set(routes).size, routes.length, 'Admin command routes must be unique');
  assert.doesNotMatch(actionBlock, /route: '\/disputes'/);
  assert.doesNotMatch(actionBlock, /route: '\/dashboard\/full'/);

  for (const route of routes) {
    const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(app, new RegExp(`path=["']${escaped}["']`), `Missing registered Admin route: ${route}`);
  }
});
