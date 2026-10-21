// tel:/wa.me must work inside the Capacitor Android app: top-level navigation
// (handed to an intent by Capacitor's WebViewClient) instead of window.open
// with no second window, plus Android 11+ <queries> for dialer/WhatsApp.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const ts = createRequire(import.meta.url)('typescript');
const code = ts.transpileModule(read('src/lib/jobContact.ts'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(native) {
  const opened = [];
  const window = { open: (u) => opened.push(u), location: { href: '' } };
  const sandbox = { exports: {}, Set, String, window, globalThis: native ? { Capacitor: { isNativePlatform: () => true } } : {} };
  runInNewContext(code, sandbox);
  return { api: sandbox.exports, opened, window };
}

test('native app: WhatsApp and tel use top-level navigation (intent hand-off)', () => {
  const { api, opened, window } = load(true);
  api.openContactUrl('https://wa.me/971552423233');
  assert.equal(window.location.href, 'https://wa.me/971552423233');
  api.openContactUrl('tel:+971552423233');
  assert.equal(window.location.href, 'tel:+971552423233');
  assert.equal(opened.length, 0);
});

test('browser: WhatsApp opens a new tab, tel uses the dialer handler, junk is refused', () => {
  const { api, opened, window } = load(false);
  api.openContactUrl('https://wa.me/971552423233');
  api.openContactUrl('tel:+971552423233');
  api.openContactUrl('https://evil.example/');
  assert.deepEqual([...opened], ['https://wa.me/971552423233']);
  assert.equal(window.location.href, 'tel:+971552423233');
});

test('owner and tenant call-technician buttons use the shared opener', () => {
  for (const p of ['src/components/tracking/LiveTechnicianTrackingCard.tsx', 'src/owner/pages/OwnerTicketDetailPage.tsx']) {
    const src = read(p);
    assert.match(src, /openContactUrl\(telHref\(normalizeContactPhone\(phone\)\)\)/, p);
    assert.doesNotMatch(src, /window\.open\(`tel:/, p);
  }
});

test('Android manifest declares dialer and WhatsApp package visibility', () => {
  const m = read('android/app/src/main/AndroidManifest.xml');
  assert.match(m, /<queries>[\s\S]*android:scheme="tel"[\s\S]*android:host="wa\.me"[\s\S]*com\.whatsapp[\s\S]*<\/queries>/);
});
