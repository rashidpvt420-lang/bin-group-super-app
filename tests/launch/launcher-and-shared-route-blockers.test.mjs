import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('shared cross-role routes do not inherit Owner activation lock screens', async () => {
  const source = await read('src/App.tsx');
  const sharedRoutes = [
    '/government/:id',
    '/calendar',
    '/analytics/reporting',
    '/analytics/executive',
    '/design-studio',
    '/design-studio/request/:id',
  ];

  for (const route of sharedRoutes) {
    const routePattern = new RegExp(`<Route\\s+path=["']${route.replaceAll('/', '\\/')}["'][^\\n]+`);
    const match = source.match(routePattern);
    assert.ok(match, `${route} is not registered`);
    assert.match(match[0], /protectedRoute\(/, `${route} must use the neutral protected route`);
    assert.doesNotMatch(match[0], /protectedOwnerRoute\(/, `${route} must not wrap non-owner profiles in OwnerActivationGuard`);
  }
});

test('role gateway preserves admin login intent and rejects non-admin admin selection in-page', async () => {
  const source = await read('src/pages/RoleGatewayPage.tsx');
  assert.match(source, /intendedRole=admin&returnTo=%2Fadmin%2Fdashboard/);
  assert.match(source, /adminEligible/);
  assert.match(source, /Admin access requires an approved admin identity/);
  assert.doesNotMatch(source, /if\s*\(roleId\s*===\s*['"]admin['"]\)\s*{\s*navigate\(['"]\/admin\/dashboard['"]\)/);
});

test('manual launch command center evidence cannot present itself as hard public clearance', async () => {
  const source = await read('apps/admin-panel/src/pages/admin/PublicLaunchCommandCenterPage.tsx');
  assert.match(source, /MANUAL EVIDENCE COMPLETE/);
  assert.match(source, /not hard public-launch clearance/);
  assert.match(source, /protected exact-SHA deployment/);
  assert.match(source, /signed HMAC decision gate/);
  assert.doesNotMatch(source, /\?\s*'PUBLIC READY'/);
});
