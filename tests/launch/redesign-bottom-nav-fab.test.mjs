// R2 of the 2026-10-21 redesign: bottom navigation + one FAB menu.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const nav = await readFile('src/components/ui/roleNav.ts', 'utf8');
const shell = await readFile('src/components/AuthenticatedShell.tsx', 'utf8');
const ai = await readFile('src/components/SovereignAIChat.tsx', 'utf8');
const chat = await readFile('src/components/BinConnectChatBox.tsx', 'utf8');
const apps = { owner: 'src/owner/OwnerApp.tsx', tenant: 'src/tenant/TenantApp.tsx', technician: 'src/technician/TechnicianApp.tsx', broker: 'src/broker/BrokerApp.tsx' };

test('every bottom-nav and FAB path is a real route in its role app', async () => {
  for (const [role, file] of Object.entries(apps)) {
    const src = await readFile(file, 'utf8');
    const block = nav.split(`  ${role}: [`)[1].split('],')[0];
    const paths = [...block.matchAll(/path: '([^']+)'/g)].map((m) => m[1]);
    assert.ok(paths.length >= 1, `${role} has paths`);
    for (const p of paths) {
      const sub = p.replace(`/${role}`, '') || '/';
      assert.ok(src.includes(`path="${sub}"`), `${role} route ${sub} missing`);
    }
  }
});

test('each role has exactly five tabs with English and Arabic labels', () => {
  for (const role of Object.keys(apps)) {
    const block = nav.split(`  ${role}: [`)[1].split('],')[0];
    assert.equal([...block.matchAll(/key: '/g)].length, 5, role);
    assert.equal([...block.matchAll(/ar: '[^']+'/g)].length, 5, `${role} arabic`);
  }
});

test('shell renders one bottom nav and one FAB and drops the floating Back on portals', () => {
  assert.match(shell, /<BottomNav role=\{navRole\}/);
  assert.match(shell, /<ActionFab role=\{fabRole\}/);
  assert.match(shell, /!isFabHidden\(location\.pathname\)/);
  assert.match(shell, /shouldRenderFloatingNavigation && !navRole && <NavigationControl/);
  assert.match(shell, /UnifiedFabContext\.Provider value=\{unifiedFab\}/);
});

test('legacy AI and chat launchers hide under the unified FAB and open from its events', () => {
  assert.match(ai, /\{!unifiedFab && <Portal>/);
  assert.match(ai, /addEventListener\('bin:open-ai'/);
  assert.match(chat, /\{!unifiedFab && \(/);
  assert.match(chat, /addEventListener\('bin:open-chat'/);
});

test('FAB is hidden on forms, onboarding and job screens', () => {
  for (const re of ['/onboarding/', '/activation/', '/request$/', '/job\/', '/payment-proof/']) assert.ok(nav.includes(re), re);
});

test('bottom nav reserves space and meets touch-target size', async () => {
  await access('src/components/ui/BottomNav.tsx');
  const b = await readFile('src/components/ui/BottomNav.tsx', 'utf8');
  assert.match(b, /safe-area-inset-bottom/);
  assert.match(b, /minHeight: ui\.bottomNavHeight/);
  assert.match(b, /aria-current/);
});
