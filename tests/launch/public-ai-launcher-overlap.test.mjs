// Rashid's 390px screenshot: the floating AI button covered the Tenant & Home
// Search card text, the Back pill covered company-profile text, and the top
// chip was cut off. Public role chooser + company pages now use an in-header
// "Ask AI" button, the company pages keep in-flow navigation, and the chip wraps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('role chooser and company routes suppress the floating launcher but keep the assistant', () => {
  const app = read('src/App.tsx');
  assert.match(app, /AI_HEADER_LAUNCHER_ROUTES = new Set\(\['\/', '\/company', '\/company-profile', '\/about', '\/about-us'\]\)/);
  assert.match(app, /<UnifiedFabContext\.Provider value=\{true\}>\{chat\}<\/UnifiedFabContext\.Provider>/);
});

test('both pages expose a bilingual header button that opens the assistant', () => {
  for (const p of ['src/pages/public/SimpleStartPage.tsx', 'src/pages/public/CompanyProfilePage.tsx']) {
    const src = read(p);
    assert.match(src, /data-testid="public-ai-open"/, p);
    assert.match(src, /emitFabEvent\('bin:open-ai'\)/, p);
    assert.match(src, /اسأل المساعد/, p);
  }
});

test('fixed Back pill is not drawn over company profile pages', () => {
  const nav = read('src/components/navigation/NavigationControl.tsx');
  for (const r of ['/company', '/company-profile', '/about', '/about-us']) assert.ok(nav.includes(`'${r}'`), r);
});

test('top chip wraps instead of truncating', () => {
  const src = read('src/pages/public/SimpleStartPage.tsx');
  assert.match(src, /'BIN GROUP · Property Management & Maintenance'\} sx=\{\{ height: 'auto'[^\n]*whiteSpace: 'normal'/);
});
