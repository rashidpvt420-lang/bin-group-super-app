import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

function contrastOnWhite(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (l + 0.05);
}

test('the public root really renders the audited role-first marketing page', async () => {
  const [landing, app] = await Promise.all([
    read('src/pages/LandingPage.tsx'),
    read('src/App.tsx'),
  ]);
  assert.match(landing, /<SimpleStartPage \/>/);
  assert.match(app, /path=["']\/["']/);
  assert.match(app, /<LandingPage/);
});

test('the real public root keeps every customer role CTA and legal route wired', async () => {
  const page = await read('src/pages/public/SimpleStartPage.tsx');
  for (const route of [
    '/login?intendedRole=tenant',
    '/login?intendedRole=owner',
    '/login?intendedRole=broker',
    '/login?intendedRole=technician',
    '/homes',
    '/onboarding',
    '/support',
    '/privacy',
    '/terms',
    '/admin',
  ]) assert.ok(page.includes(route), `missing public route ${route}`);
  assert.match(page, /data-testid="language-toggle"/);
  assert.match(page, /setLang\(ar \? 'en' : 'ar'\)/);
  assert.match(page, /[\u0600-\u06FF]/);
});

test('light public surfaces use AA-readable gold text instead of brand-fill gold', async () => {
  const page = await read('src/pages/public/SimpleStartPage.tsx');
  const match = page.match(/const goldText = '(#[0-9A-Fa-f]{6})'/);
  assert.ok(match, 'readable light-surface gold token exists');
  assert.ok(contrastOnWhite(match[1]) >= 4.5, `goldText contrast is ${contrastOnWhite(match[1]).toFixed(2)}:1`);
  assert.match(page, /border: `1px solid \${alpha\(gold, 0\.35\)}`,\s*color: goldText,\s*bgcolor: '#fff'/s);
  assert.match(page, /bgcolor: alpha\(binThemeTokens\.gold, 0\.15\), color: goldText/);
  assert.match(page, /borderColor: alpha\(gold, 0\.5\), color: goldText/);
  assert.match(page, /<MapPin size=\{14\} color=\{goldText\} \/>/);
});

test('public app and contact copy stays honest and operationally routed', async () => {
  const page = await read('src/pages/public/SimpleStartPage.tsx');
  assert.match(page, /There is no public Play Store link yet/);
  assert.match(page, /Android app coming soon/);
  assert.match(page, /https:\/\/wa\.me\/\$\{whatsappDigits\}/);
  assert.match(page, /mailto:\$\{CONTACT\.email\}/);
  assert.match(page, /Proof before payment/);
  assert.match(page, /Photo proof/);
});
