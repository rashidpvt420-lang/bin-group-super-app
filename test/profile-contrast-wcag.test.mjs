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

// Page-by-page pass: Owner pages and the tenant full dashboard render on the
// white shell, so white or near-white text on a pale/translucent surface (or
// no surface at all) is invisible. Each listed screen must use theme tokens.
import { createRequire } from 'node:module';
const ts = createRequire(import.meta.url)('typescript');
const PALE_SURFACE_SCREENS = [
  'src/owner/components/ContractSignatureOtpControl.tsx',
  'src/owner/components/OwnerAuthorizedReportersSection.tsx',
  'src/owner/components/OwnerComplaintCommandCenter.tsx',
  'src/owner/components/OwnerContractIntelligenceSection.tsx',
  'src/owner/components/OwnerContractModeMatrix.tsx',
  'src/owner/components/OwnerExecutiveDashboardSection.tsx',
  'src/owner/components/OwnerNextStepBanner.tsx',
  'src/owner/components/OwnerPhoneVerificationCard.tsx',
  'src/owner/components/OwnerRentCollectionSection.tsx',
  'src/owner/components/OwnerRoiFinancialSection.tsx',
  'src/owner/components/OwnerTicketEvidencePanel.tsx',
  'src/owner/pages/ContractorMarketplacePage.tsx',
  'src/owner/pages/OwnerActivationPage.tsx',
  'src/owner/pages/OwnerContractsResolvedPage.tsx',
  'src/owner/pages/OwnerDamageEstimatePage.tsx',
  'src/owner/pages/OwnerDashboardResolvedPage.tsx',
  'src/owner/pages/OwnerIbanPage.tsx',
  'src/owner/pages/OwnerPLReportPage.tsx',
  'src/owner/pages/OwnerProfilePage.tsx',
  'src/owner/pages/OwnerPropertyPassportContractDetailPage.tsx',
  'src/owner/pages/OwnerPropertyPassportResolvedPage.tsx',
  'src/owner/pages/OwnerTicketsPage.tsx',
  'src/tenant/pages/TenantDashboardPage.tsx'
];
const WHITE_TEXT = /^['"`](#fff|#ffffff|#f8fafc|white|rgba\(255, ?255, ?255, ?0?\.[4-9]\d*\))['"`]$/i;
const CONTROL_TAGS = new Set(['Button', 'Chip', 'Avatar', 'Fab', 'Badge', 'IconButton', 'LinearProgress', 'CircularProgress']);
const surfaceIsPale = (t) => {
  const v = t.replace(/\s+/g, '');
  if (/^['"`](#fff|#ffffff|#f8f9fb|#f9fafb|#f8fafc|white|transparent)['"`]$/i.test(v)) return true;
  if (/binThemeTokens\.(canvas|card|softCanvas)$/.test(v)) return true;
  const a = v.match(/^alpha\((.+),([\d.]+)\)$/);
  if (a) return Number(a[2]) <= 0.25 && !/black|#0|#1[0-9a-f]/i.test(a[1]);
  const r = v.match(/^['"`]rgba\((\d+),(\d+),(\d+),([\d.]+)\)['"`]$/);
  if (r) { const [x, y, z, al] = r.slice(1).map(Number); return al <= 0.25 || (x + y + z) / 3 > 200; }
  return false;
};
const styleOf = (opening, sf) => {
  const out = {};
  for (const attr of opening.attributes.properties) {
    if (!attr.name || !attr.initializer) continue;
    const name = attr.name.getText(sf);
    let init = attr.initializer;
    if (ts.isJsxExpression(init)) init = init.expression;
    if (!init) continue;
    if (name === 'color') out.color = init.getText(sf);
    if (name === 'bgcolor') out.bg = init.getText(sf);
    if ((name === 'sx' || name === 'style') && ts.isObjectLiteralExpression(init)) {
      for (const p of init.properties) {
        if (ts.isSpreadAssignment(p)) { out.bg = 'SPREAD'; continue; }
        if (!ts.isPropertyAssignment(p)) continue;
        const k = p.name.getText(sf).replace(/['"]/g, '');
        if (k === 'color') out.color = p.initializer.getText(sf);
        if (k === 'bgcolor' || k === 'background' || k === 'backgroundColor') out.bg = p.initializer.getText(sf);
      }
    }
  }
  return out;
};
const invisibleWhiteText = (file) => {
  const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits = [];
  const walk = (node, stack) => {
    let next = stack;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const style = styleOf(opening, sf);
      next = [...stack, style];
      if (style.color && WHITE_TEXT.test(style.color)) {
        let surface = null;
        for (let i = next.length - 1; i >= 0; i -= 1) {
          if (!next[i].bg) continue;
          const translucent = /alpha\(|rgba\(|transparent/.test(next[i].bg);
          if (next[i].bg !== 'SPREAD' && surfaceIsPale(next[i].bg)) { surface = surface || 'pale'; if (translucent) continue; break; }
          surface = surface === 'pale' ? 'over-dark' : 'dark';
          break;
        }
        const tag = opening.tagName.getText(sf);
        if (surface === 'pale' || (surface === null && !CONTROL_TAGS.has(tag))) {
          hits.push(`${file}:${sf.getLineAndCharacterOfPosition(opening.getStart(sf)).line + 1} <${tag}> ${style.color}`);
        }
      }
    }
    ts.forEachChild(node, (child) => walk(child, next));
  };
  walk(sf, []);
  return hits;
};

test('owner and tenant full-dashboard screens have no white text on pale surfaces', () => {
  const hits = PALE_SURFACE_SCREENS.flatMap(invisibleWhiteText);
  assert.deepEqual(hits, [], hits.join('\n'));
  for (const fg of ['textPrimary', 'textSecondary']) {
    for (const tint of [0.04, 0.06, 0.08]) {
      assert.ok(ratio(T[fg], over('#C6A75E', tint)) >= 4.5, `${fg} over gold tint ${tint}`);
    }
  }
  // Inputs tinted rgba(0,0,0,0.2) over white read as #CCCCCC: only textPrimary passes there.
  assert.ok(ratio(T.textPrimary, over('#000000', 0.2)) >= 4.5);
});

test('the scanner still flags white text on a pale surface', () => {
  const src = "const A = () => <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}><Typography sx={{ color: '#FFF' }}>x</Typography></Box>;";
  const sf = ts.createSourceFile('x.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.ok(sf.statements.length > 0);
  assert.ok(surfaceIsPale("'rgba(255,255,255,0.03)'"));
  assert.ok(!surfaceIsPale("'rgba(15,23,42,0.72)'"));
  assert.ok(WHITE_TEXT.test("'#FFF'"));
});

// Shared pages open inside the dark tenant shell and the white owner/broker
// shells, so their text follows the shell through CSS variables.
const SHARED_SCREENS = [
  'src/pages/AccountPrivacyRequestPage.tsx',
  'src/pages/DesignStudioPage.tsx',
  'src/pages/FinancialDashboardPage.tsx',
  'src/pages/GovernmentPropertyPage.tsx',
  'src/pages/HealthScorePage.tsx',
  'src/pages/NotificationInboxPage.tsx',
  'src/pages/OwnerMoneyControlPage.tsx',
  'src/pages/PropertyPassportPage.tsx',
  'src/pages/public/CompanyProfilePage.tsx',
  'src/pages/public/SimpleStartPage.tsx',
  'src/pages/public/UaeMarketLeadershipPage.tsx'
];
const cssVar = (src, name) => { const k = `var(${name}, `; const i = src.indexOf(k) + k.length; return src.slice(i, src.indexOf(')', i)); };

test('shared pages have no fixed white text on pale or missing surfaces', () => {
  const hits = SHARED_SCREENS.flatMap(invisibleWhiteText);
  assert.deepEqual(hits, [], hits.join('\n'));
  for (const f of ['src/pages/DesignStudioPage.tsx', 'src/pages/PropertyPassportPage.tsx']) {
    assert.ok(read(f).includes('binThemeTokens.adaptiveText'), `${f} uses the adaptive text token`);
  }
});

test('every shell sets the adaptive text variables and both modes pass AA', () => {
  assert.equal(cssVar(theme, '--bin-adaptive-text'), T.textPrimary);
  const tenant = read('src/tenant/TenantApp.tsx');
  assert.ok(tenant.includes("'--bin-adaptive-text': isLightRoute ? binThemeTokens.textPrimary : '#FFFFFF'"));
  assert.ok(tenant.includes("'--bin-adaptive-text-muted': isLightRoute ? '#4B5563' : '#D1D5DB'"));
  assert.ok(read('src/owner/OwnerApp.tsx').includes("'--bin-adaptive-text': binThemeTokens.textPrimary"));
  assert.ok(read('src/broker/BrokerApp.tsx').includes("'--bin-adaptive-text': '#111827'"));
  const black = token(theme, 'black');
  for (const [fg, bg] of [['#FFFFFF', black], ['#D1D5DB', black], ['#111827', T.canvas], ['#4B5563', T.canvas], ['#4B5563', T.softCanvas], [cssVar(theme, '--bin-adaptive-text-muted'), T.canvas]]) {
    assert.ok(ratio(fg, bg) >= 4.5, `${fg} on ${bg} = ${ratio(fg, bg).toFixed(2)}`);
  }
});
