import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const spec = readFileSync('tests/e2e/launch-audit-tenant.spec.ts', 'utf8');
const app = readFileSync('src/App.tsx', 'utf8');
const lang = readFileSync('src/context/LanguageContext.tsx', 'utf8');
test('tenant audit waits for session restore before reading page content', () => {
  const healthy = spec.slice(spec.indexOf('async function assertHealthy'));
  assert.match(healthy.slice(0, 400), /await waitForSessionRestore\(page, expectedPath\);[\s\S]*innerText/);
  assert.match(spec, /toHaveCount\(0, \{ timeout: 20_000 \}\)/);
  assert.match(spec, /AUTH_RECOVERY/);
});
test('emergency content assertion is unchanged and not skipped', () => {
  assert.match(spec, /toMatch\(\/emergency\|sos\|urgent\|استغاثة\|طارئ\/i\)/);
  assert.doesNotMatch(spec, /test\.(skip|fixme)\(/);
});
test('splash patterns match the real EN and AR splash strings', () => {
  assert.match(app, /Authenticating BIN-Groups Identity/);
  assert.match(lang, /'common\.auth_sync': 'جاري توثيق هوية مجموعة بن\.\.\.'/);
  assert.match(app, /Connection is slow/);
});
