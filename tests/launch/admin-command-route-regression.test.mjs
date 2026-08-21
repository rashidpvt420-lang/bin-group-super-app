import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const routesFrom = (source) => [...source.matchAll(/route: '([^']+)'/g)].map((match) => match[1]);

test('Admin command cards use registered route paths only', async () => {
  const [dashboard, app] = await Promise.all([
    read('apps/admin-panel/src/pages/dashboard/AdminSimpleDashboardPage.tsx'),
    read('apps/admin-panel/src/App.tsx'),
  ]);

  const actionBlock = dashboard.match(/const adminActions = \[[\s\S]*?\n\];/)?.[0] || '';
  const fullAdminCardsBlock = dashboard.match(/const fullAdminCards = \[[\s\S]*?\n\s*\];/)?.[0] || '';
  const hrCardsBlock = dashboard.match(/const hrCards = \[[\s\S]*?\n\s*\];/)?.[0] || '';
  const actionRoutes = routesFrom(actionBlock);
  const liveCardRoutes = routesFrom(`${fullAdminCardsBlock}\n${hrCardsBlock}`);

  const requiredActionRoutes = [
    '/tickets',
    '/payments',
    '/technicians/map',
    '/hr',
    '/owners',
    '/audit-shield',
    '/reports',
    '/technicians',
  ];

  assert.deepEqual(new Set(actionRoutes), new Set(requiredActionRoutes), 'Admin command center action grid must retain every canonical operational shortcut');
  assert.equal(new Set(actionRoutes).size, actionRoutes.length, 'Admin command routes must be unique');
  assert.doesNotMatch(actionBlock, /route: '\/disputes'/);
  assert.doesNotMatch(actionBlock, /route: '\/dashboard\/full'/);
  assert.match(dashboard, /adminActions\.filter\(\(action\) => canAccessAdminPath\(user, action\.route\)\)/);
  assert.match(dashboard, /\.filter\(\(card\) => canAccessAdminPath\(user, card\.route\)\)/);

  const registeredRoutes = new Set([...actionRoutes, ...liveCardRoutes]);
  assert.ok(registeredRoutes.size >= 12, 'Admin command center must retain broad live operational coverage in addition to the action grid');
  for (const route of registeredRoutes) {
    const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(app, new RegExp(`path=["']${escaped}["']`), `Missing registered Admin route: ${route}`);
  }
});
