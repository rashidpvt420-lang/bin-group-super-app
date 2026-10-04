import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('role portals do not render the fixed floating Back control over job pages', async () => {
  const [shell, nav] = await Promise.all([
    read('src/components/AuthenticatedShell.tsx'),
    read('src/components/navigation/NavigationControl.tsx'),
  ]);

  assert.match(shell, /shouldRenderFloatingNavigation = showChrome && !isAdminRoute && !isTenantRoute && !isRolePortalRoute/);
  assert.match(nav, /location\.pathname\.startsWith\('\/technician'\)/);
  assert.match(nav, /location\.pathname\.startsWith\('\/owner'\)/);
  assert.match(nav, /location\.pathname\.startsWith\('\/broker'\)/);
});
