// /technician/support (the "Contact Operations Base" target on a job) rendered the public black #000
// support block inside the white technician shell, and its only CTAs were owner onboarding and
// "Schedule Demo" - a field technician had no in-app way to reach operations.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../../src/pages/public/SupportPage.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../../src/technician/TechnicianApp.tsx', import.meta.url), 'utf8');

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

test('technician portal variant is detected from the route and is light', () => {
  assert.ok(page.includes("const technicianPortal = location.pathname.startsWith('/technician');"));
  assert.ok(page.includes("bgcolor: technicianPortal ? 'transparent' : '#000'"));
  assert.ok(page.includes("data-testid={technicianPortal ? 'technician-support-page' : 'public-support-page'}"));
  const tones = paletteOf(page, 'SUPPORT_PORTAL_TONES');
  for (const key of ['ink', 'muted', 'gold']) {
    assert.ok(contrast(tones[key]) >= 4.5 && contrast(tones[key], '#F8F9FB') >= 4.5, `${key} readable`);
  }
});

test('technicians get working operations contacts instead of owner/demo CTAs', () => {
  const portal = page.slice(page.indexOf('{technicianPortal ? (\n'), page.indexOf(') : (', page.indexOf('{technicianPortal ? (\n')));
  assert.ok(portal.includes("onClick={() => navigate('/technician/bin-connect')}"), 'BIN Connect message to operations');
  assert.ok(portal.includes('href={`tel:${digits(BIN_PUBLIC_CONTACT.phone)}`}'), 'call operations');
  assert.ok(portal.includes("href={`https://wa.me/${digits(BIN_PUBLIC_CONTACT.whatsapp).replace('+', '')}`}"), 'WhatsApp operations');
  assert.ok(portal.includes('rel="noopener noreferrer"'));
  for (const id of ['technician-support-bin-connect', 'technician-support-call', 'technician-support-whatsapp']) assert.ok(portal.includes(`data-testid="${id}"`));
  assert.ok(!portal.includes('/onboarding') && !portal.includes('/request-demo'), 'no owner onboarding/demo CTAs for field staff');
  assert.ok(app.includes('<Route path="/bin-connect" element={<BinConnectInboxPage role="technician" />} />'), 'target route exists');
  assert.ok(app.includes('<Route path="/support" element={<SupportPage />} />'));
});

test('public /support page keeps its CTAs and bilingual copy', () => {
  assert.ok(page.includes('href="/onboarding"') && page.includes('href="/request-demo"'));
  assert.ok(page.includes("label('Contact BIN GROUP', 'تواصل مع BIN GROUP')"));
  assert.ok(page.includes("label('Message operations', 'راسل العمليات')"), 'portal copy is bilingual');
  const digits = (value) => value.replace(/[^\d+]/g, '');
  assert.equal(digits('+971 55 7474560'), '+971557474560');
});
