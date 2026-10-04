// Shared chrome shown on every technician page: the global header wordmark was #fff on the white
// shell (1:1), the fixed floating Back button duplicated the technician AppBar Back, the portal
// language label used gold #C9A646 (2.3:1), Logout was #EF4444 on its pink tint (3.4:1), and the
// sync strip / BIN Connect / pilot chips used gold (2.3-2.9:1).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');
const header = read('components/SovereignHeader.tsx');
const nav = read('components/navigation/NavigationControl.tsx');
const session = read('components/PortalSessionControls.tsx');
const strip = read('technician/components/TechnicianSyncStatusStrip.tsx');
const inbox = read('components/BinConnectInboxPage.tsx');
const pilot = read('components/PilotCompletionPage.tsx');

function contrast(fgHex, bgHex = '#FFFFFF') {
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [a, b] = [lum(fgHex), lum(bgHex)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

function paletteOf(source, name) {
  const start = source.indexOf(`const ${name} = {`);
  assert.ok(start >= 0, `${name} palette defined`);
  const body = source.slice(start, source.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/(\w+): '(#[0-9A-Fa-f]{6})'/g)].map((m) => [m[1], m[2]]));
}

test('readable tones used by the chrome meet 4.5:1', () => {
  assert.ok(contrast('#111827') >= 4.5);
  assert.ok(contrast('#7A5C12') >= 4.5);
  // Logout sits on a ~8% #EF4444 tint over white (~#FDEEEE).
  assert.ok(contrast('#B91C1C', '#FDEEEE') >= 4.5);
  assert.ok(contrast('#EF4444', '#FDEEEE') < 4.5, 'old logout red failed');
});

test('global header wordmark is readable on the white shell', () => {
  const brand = header.slice(header.indexOf('const BinGroupHeader'), header.indexOf('export', header.indexOf('const BinGroupHeader')) > 0 ? header.indexOf('export', header.indexOf('const BinGroupHeader')) : undefined);
  assert.ok(!brand.includes("color: '#fff'"), 'wordmark not white');
  assert.ok(!brand.includes("color: 'rgba(212,175,55,0.82)'") && !brand.includes("color: '#d4af37'"));
  assert.ok(brand.includes("color: '#111827'") && brand.includes("color: '#7A5C12'"));
});

test('floating Back button is hidden on technician routes (AppBar has Back)', () => {
  assert.ok(nav.includes("if (location.pathname === '/technician' || location.pathname.startsWith('/technician/')) return null;"));
  const hide = nav.indexOf("location.pathname.startsWith('/technician/')");
  assert.ok(hide > 0 && hide < nav.indexOf('return ('), 'guard runs before render');
});

test('session controls keep the accent for dark shells only', () => {
  assert.ok(session.includes("const labelColor = dark ? accent : '#111827';"));
  assert.ok(session.includes("const logoutColor = dark ? '#EF4444' : '#B91C1C';"));
  assert.ok(!session.includes("color: '#EF4444'"), 'logout text not hard-coded to the 3.4:1 red');
});

test('sync strip, BIN Connect and pilot chips use readable gold on light shells', () => {
  assert.ok(strip.includes("onClick={() => navigate('/technician/offline')} sx={{ flexShrink: 0, fontWeight: 900, color: '#7A5C12' }}"));
  assert.ok(inbox.includes("color: dark ? binThemeTokens.goldHover : '#7A5C12'"));
  assert.ok(pilot.includes("color: dark ? binThemeTokens.goldHover : '#7A5C12'"));
});
