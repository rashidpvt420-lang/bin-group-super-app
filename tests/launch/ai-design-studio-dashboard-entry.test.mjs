import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

// Regression: AI Design Studio was routed (/owner/design-studio, /tenant/design-studio)
// but the default owner and tenant dashboards (the *Simple* dashboards served at / and
// /dashboard) never linked to it, so the feature was unreachable for real users.
test('owner and tenant default dashboards expose AI Design Studio', async () => {
  const [blueprint, panel, ownerApp, tenantApp, ownerHome, tenantHome] = await Promise.all([
    read('src/config/uaeDominationBlueprint.ts'),
    read('src/components/RoleQuickActionsPanel.tsx'),
    read('src/owner/OwnerApp.tsx'),
    read('src/tenant/TenantApp.tsx'),
    read('src/owner/pages/OwnerSimpleDashboardPage.tsx'),
    read('src/tenant/pages/TenantSimpleDashboardPage.tsx'),
  ]);

  const roleBlock = (role) => {
    const start = blueprint.indexOf(`  ${role}: [`);
    assert.ok(start > -1, `${role} quick actions block`);
    return blueprint.slice(start, blueprint.indexOf('],', start));
  };
  assert.match(roleBlock('owner'), /id: 'ai_studio'[^}]*target: '\/owner\/design-studio'/);
  assert.match(roleBlock('tenant'), /id: 'ai_studio'[^}]*target: '\/tenant\/design-studio'/);

  assert.match(panel, /ai_studio: <Paintbrush size=\{22\} \/>/);
  assert.match(panel, /ai_studio: \{ label: '[^']+', whyItMatters:/);

  assert.ok(ownerApp.includes('<Route path="/design-studio" element={<DesignStudioPage />} />'));
  assert.ok(tenantApp.includes('<Route path="/design-studio" element={<DesignStudioPage />} />'));
  // 2026-10-21 redesign: the owner home reaches AI Design Studio through the single FAB menu.
  const roleNav = await read('src/components/ui/roleNav.ts');
  assert.match(roleNav.split('  owner: [')[2] || '', /path: '\/owner\/design-studio'/);
  assert.ok(ownerHome.includes("from '../../components/ui'"));
  assert.match(roleNav.split('  tenant: [')[2] || '', /path: '\/tenant\/design-studio'/);
  assert.ok(tenantHome.includes("from '../../components/ui'"));
});
