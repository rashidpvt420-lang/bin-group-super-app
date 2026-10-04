import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = process.env.UI_AUDIT_ROOT ? `${process.env.UI_AUDIT_ROOT}/` : new URL('../../', import.meta.url).pathname;
const read = (p) => readFileSync(`${root}${p}`, 'utf8');

const lum = (hex) => {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const token = (src, name) => {
  const at = src.indexOf(`  ${name}: '#`);
  if (at < 0) return undefined;
  const m = /'(#[0-9A-Fa-f]{6})'/.exec(src.slice(at, at + name.length + 16));
  return m ? m[1] : undefined;
};

test('theme exposes AA-compliant gold text and status colours', () => {
  const theme = read('src/theme/binGroupTheme.ts');
  for (const name of ['goldText', 'goldTextHover', 'danger', 'warning', 'success', 'info']) {
    const hex = token(theme, name);
    assert.ok(hex, `${name} token missing`);
    assert.ok(ratio(hex, '#FFFFFF') >= 4.5, `${name} ${hex} is ${ratio(hex, '#FFFFFF').toFixed(2)}:1 on white`);
    assert.ok(ratio(hex, '#F8F9FB') >= 4.5, `${name} ${hex} fails on #F8F9FB`);
  }
});

test('outlined and text primary buttons, links, tabs and focused labels use goldText', () => {
  const theme = read('src/theme/binGroupTheme.ts');
  assert.match(theme, /outlinedPrimary: \{[^}]*color: binThemeTokens\.goldText/);
  assert.match(theme, /textPrimary: \{\s*color: binThemeTokens\.goldText/);
  assert.match(theme, /MuiLink:[\s\S]*?goldText/);
  assert.match(theme, /'&\.Mui-focused': \{ color: binThemeTokens\.goldText \}/);
});

// Light-surface pages changed by this PR must not regress to gold text below AA.
const lightPages = [
  'src/broker/components/BrokerPageFrame.tsx',
  'src/broker/pages/BrokerCommissionsPage.tsx',
  'src/broker/pages/BrokerSimpleDashboardPage.tsx',
  'src/owner/components/OwnerNextStepBanner.tsx',
  'src/owner/pages/OwnerApprovalCenterPage.tsx',
  'src/owner/pages/OwnerAIIntelligencePage.tsx',
];
for (const file of lightPages) {
  test(`${file.split('/').pop()} has no failing gold text`, () => {
    const src = read(file);
    assert.doesNotMatch(src, /(?<![A-Za-z])color:\s*binThemeTokens\.(gold|goldHover|goldLight)\b(?!\w)/);
    assert.doesNotMatch(src, /(?<![A-Za-z])color:\s*['"]#(C9A646|B8932F|DAA520|D4AF37|E5C86B)['"]/i);
  });
}

// Dark tenant routes (TenantApp paints them black): dim white text below 0.6 alpha is under 4.5:1,
// and goldText (#7A5C12) is only about 3:1 on black, so these files keep bright gold and >= 0.72 white.
// Tickets, Amenities, Gate pass and Emergency lines are fixed in #1608 (same lines as its tx() change).
const darkFiles = [
  'src/tenant/pages/TenantTicketDetailPage.tsx', 'src/tenant/pages/TenantPaymentsPage.tsx',
  'src/tenant/pages/TenantMoveInspectionPage.tsx', 'src/tenant/pages/TenantKeysPage.tsx',
  'src/tenant/pages/TenantNoticesPage.tsx', 'src/tenant/pages/TenantVisitorParkingPage.tsx',
  'src/components/tracking/LiveTechnicianTrackingCard.tsx',
];
for (const file of darkFiles) {
  test(`${file.split('/').pop()} has no dim or dark-gold text on its dark surface`, () => {
    const src = read(file);
    assert.doesNotMatch(src, /(?<![A-Za-z])color:\s*'rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0?\.[0-5]\d*\s*\)'/);
    assert.doesNotMatch(src, /color="text(Secondary|\.secondary)"/);
    assert.ok(!src.includes('binThemeTokens.goldText'), 'goldText is for light surfaces only');
  });
}
