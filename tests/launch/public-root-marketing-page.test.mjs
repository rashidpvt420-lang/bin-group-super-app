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
  const bodyMatch = page.match(/const body = '(#[0-9A-Fa-f]{6})'/);
  assert.ok(bodyMatch && contrastOnWhite(bodyMatch[1]) >= 7, 'landing body text is darkened well past AA');
  assert.match(page, /<MapPin size=\{14\} color=\{goldText\} \/>/);
});

test('public app and contact copy stays honest and operationally routed', async () => {
  const page = await read('src/pages/public/SimpleStartPage.tsx');
  assert.match(page, /BIN-GROUPS works in your web browser today\. For help with the BIN-GROUPS mobile app, contact us\./);
  // The only allowed "coming soon" is the text-only UAE PASS notice; no store-listing claims.
  const withoutUaePass = page.split('\n').filter((l) => !/UAE PASS/.test(l)).join('\n');
  assert.doesNotMatch(withoutUaePass, /coming soon|There is no public Play Store link/i, 'no stale store-listing claims');
  assert.doesNotMatch(page, /play\.google\.com\/store|apps\.apple\.com/, 'no invented store URL');
  assert.match(page, /https:\/\/wa\.me\/\$\{whatsappDigits\}/);
  assert.match(page, /mailto:\$\{CONTACT\.email\}/);
  assert.match(page, /Before and after photo proof on every job/);
  assert.match(page, /photo proof on every job/);
});

test('landing redesign: why BIN-GROUPS, honest trust strip, text-only UAE PASS notice', async () => {
  const page = await read('src/pages/public/SimpleStartPage.tsx');
  assert.equal((page.match(/component="h1"/g) || []).length, 1, 'exactly one h1');
  assert.match(page, /Property maintenance & management across the UAE/);
  assert.match(page, /Licensed in Abu Dhabi/);
  assert.doesNotMatch(page, /licensed (for|in) property management/i, 'no property-management licence claim');
  for (const t of ['No surprises', 'You see everything', 'Fast response', 'Protected payments']) assert.ok(page.includes(t), t);
  assert.match(page, /UAE PASS — coming soon/);
  assert.match(page, /الهوية الرقمية UAE PASS — قريباً/);
  assert.match(page, /data-testid="uae-pass-coming-soon" aria-label=\{c\.uaePassAria\} aria-disabled="true"/);
  assert.doesNotMatch(page, /uaepass\.ae|uae-pass.*\.(png|svg)/i, 'no UAE PASS artwork or live link');
  assert.doesNotMatch(page, /pointsEn|pointsAr/, 'role cards no longer carry bullet chips');
});
