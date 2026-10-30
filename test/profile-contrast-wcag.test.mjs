import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const hex = (h) => { const n = h.replace('#', ''); const f = n.length === 3 ? n.split('').map((c) => c + c).join('') : n; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)); };
const lum = (h) => { const [r, g, b] = hex(h).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
// Blend a colour at alpha over white (how the readiness tiles are painted).
const over = (h, a) => '#' + hex(h).map((v) => Math.round(v * a + 255 * (1 - a)).toString(16).padStart(2, '0')).join('');
const token = (src, name) => { const k = `${name}: '`; const i = src.indexOf(k) + k.length; return src.slice(i, src.indexOf("'", i)); };

const theme = read('src/theme/binGroupTheme.ts');
const T = Object.fromEntries(['textPrimary', 'textSecondary', 'textTertiary', 'goldText', 'canvas', 'card', 'softCanvas'].map((k) => [k, token(theme, k)]));

test('theme text tokens meet WCAG AA 4.5:1 on light surfaces', () => {
  for (const fg of ['textPrimary', 'textSecondary', 'textTertiary', 'goldText']) {
    for (const bg of ['canvas', 'card', 'softCanvas']) {
      assert.ok(ratio(T[fg], T[bg]) >= 4.5, `${fg} ${T[fg]} on ${bg} ${T[bg]} = ${ratio(T[fg], T[bg]).toFixed(2)}`);
    }
  }
});

test('readiness tiles: step text and status pills are readable (AA)', () => {
  for (const tile of [over('#10b981', 0.08), over('#f59e0b', 0.08), over('#C9A646', 0.06)]) {
    assert.ok(ratio(T.textPrimary, tile) >= 4.5);
  }
  assert.ok(ratio('#065F46', '#D1FAE5') >= 4.5);
  assert.ok(ratio('#92400E', '#FEF3C7') >= 4.5);
  for (const f of ['src/owner/components/OwnerProfileReadinessCard.tsx', 'src/tenant/components/TenantProfileReadinessCard.tsx']) {
    const s = read(f);
    assert.ok(!s.includes('color="#FFF"'), `${f} still paints white text on a pale tile`);
    assert.ok(!s.includes("color={ready ? 'success'") && !s.includes("color={item.ready ? 'success'"), `${f} pill relies on palette colour`);
  }
});

test('owner profile inputs: dark text on a solid light field', () => {
  const s = read('src/owner/pages/OwnerProfilePage.tsx');
  assert.ok(!s.includes("bgcolor: 'rgba(255,255,255,0.03)', color: '#FFF'"));
  assert.ok(s.includes("'& .MuiOutlinedInput-root': { bgcolor: binThemeTokens.card, color: binThemeTokens.textPrimary"));
  assert.ok(ratio(T.textPrimary, T.card) >= 4.5);
});

test('AI Redesign entry on Owner, Tenant and Broker Home, reusing Design Studio routes', () => {
  assert.ok(read('src/owner/pages/OwnerSimpleDashboardPage.tsx').includes("path: '/owner/design-studio', en: 'AI Redesign'"));
  assert.ok(read('src/tenant/pages/TenantSimpleDashboardPage.tsx').includes("path: '/tenant/design-studio', en: 'AI Redesign'"));
  assert.ok(read('src/broker/pages/BrokerSimpleDashboardPage.tsx').includes("path: '/broker/design-studio', en: 'AI Redesign'"));
  for (const r of ['owner', 'tenant', 'broker']) assert.ok(read(`src/${r}/${r[0].toUpperCase() + r.slice(1)}App.tsx`).includes('<Route path="/design-studio" element={<DesignStudioPage />} />'));
});

test('owner Home links every former full-dashboard tool to a real route', () => {
  const home = read('src/owner/pages/OwnerSimpleDashboardPage.tsx');
  const app = read('src/owner/OwnerApp.tsx');
  for (const [label, path] of [['Contracts', '/contracts'], ['Document vault', '/documents'], ['Property passport', '/property-passport'], ['Money', '/financials'], ['Complaints', '/complaints'], ['Add person', '/insights'], ['How this works for you', '/insights']]) {
    assert.ok(home.includes(`en: '${label}`), label);
    assert.ok(app.includes(`path="${path}"`), path);
  }
});

test('owner/tenant dashboards never issue queries the rules cannot prove are own-data', () => {
  const o = read('src/owner/pages/OwnerDashboardResolvedPage.tsx');
  assert.ok(!o.includes("getCollectionDocs('invoices', 'contractId', resolved.contract.id))"));
  assert.ok(!o.includes("getCollectionDocs('payment_transactions', 'contractId', resolved.contract.id))"));
  assert.ok(!o.includes("getCollectionDocs('properties', 'ownerEmail'"));
  assert.ok(!o.includes("getCollectionDocs('propertyPassports', 'ownerUid'"));
  const t = read('src/tenant/pages/TenantDashboardPage.tsx');
  assert.ok(!t.includes("where('tenantEmail', '==', normalizeEmail(user.email)), limit(1)"));
  assert.ok(!t.includes("collection(db, 'systemLogs')"));
  assert.ok(!t.includes("{ field: 'propertyId', value:"));
});
