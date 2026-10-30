import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ROLE_FAB_ACTIONS } from '../src/components/ui/roleNav.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const PROFILES = [
  ['owner', 'src/owner/OwnerApp.tsx', 'src/owner/pages/OwnerSimpleDashboardPage.tsx'],
  ['tenant', 'src/tenant/TenantApp.tsx', 'src/tenant/pages/TenantSimpleDashboardPage.tsx'],
  ['technician', 'src/technician/TechnicianApp.tsx', 'src/technician/pages/TechnicianSimpleDashboardPage.tsx'],
  ['broker', 'src/broker/BrokerApp.tsx', 'src/broker/pages/BrokerSimpleDashboardPage.tsx'],
];

for (const [role, shell, dashboard] of PROFILES) {
  test(`${role}: floating menu "Message BIN" has a mounted BIN Connect listener`, async () => {
    const chat = ROLE_FAB_ACTIONS[role].find((a) => a.event === 'bin:open-chat');
    assert.ok(chat, `${role} FAB must offer Message BIN`);
    const src = await read(shell);
    assert.ok(src.includes(`<BinConnectChatBox role="${role}"`), `${role} shell must mount the shared BinConnectChatBox`);
    assert.ok(src.includes(`path="/bin-connect" element={<BinConnectInboxPage role="${role}"`), `${role} needs the inbox route the chat box opens`);
  });
  test(`${role}: dashboard shows the shared suggestion box`, async () => {
    assert.ok((await read(dashboard)).includes(`<SuggestionBoxCard role="${role}"`));
  });
}

test('chat box listens for the FAB event and offers the feature_suggestion channel', async () => {
  const src = await read('src/components/BinConnectChatBox.tsx');
  assert.match(src, /addEventListener\('bin:open-chat'/);
  assert.match(src, /value: 'feature_suggestion'/);
});

test('Made in UAE mark is shared, bilingual and rendered once at the app root for every page', async () => {
  const mark = await read('src/components/MadeInUaeMark.tsx');
  assert.match(mark, /'Made in UAE'/);
  assert.match(mark, /'صُنع في الإمارات'/);
  assert.match(mark, /aria-hidden="true">🇦🇪/);
  assert.match(mark, /dir={isRTL \? 'rtl' : 'ltr'}/);
  const app = await read('src/App.tsx');
  assert.match(app, /<AppContent \/>\s*<MadeInUaeMark \/>/, 'mark must sit beside AppContent so all routes get it');
});
