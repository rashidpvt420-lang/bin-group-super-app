import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = process.env.UI_AUDIT_ROOT ? `${process.env.UI_AUDIT_ROOT}/` : new URL('../../', import.meta.url).pathname;
const read = (p) => readFileSync(`${root}${p}`, 'utf8');

test('broker referrals empty state is readable and plain', () => {
  const src = read('src/broker/pages/BrokerReferralsPage.tsx');
  assert.ok(!src.includes('NO REFERRALS RECORDED'));
  assert.ok(src.includes(">No referrals yet</Typography>") && src.includes('Tap Submit referral above to add one.'));
  assert.ok(!src.includes("color: '#9CA3AF', mt: 1"), '#9CA3AF on #F8F9FB is 2.41:1');
});

test('owner landing footer: plain casing, no 0.4 opacity', () => {
  const src = read('src/pages/OwnerLandingPage.tsx');
  assert.ok(src.includes('© 2026 BIN GROUP · UAE'));
  assert.ok(!src.includes("t('landing.uae_ops')"), 'the key rendered as "Uae Ops"');
  assert.ok(!src.includes("py: 10, textAlign: 'center', opacity: 0.4"));
});

test('public verify pages drop the internal protocol label', () => {
  for (const f of ['src/pages/public/CertificateVerificationPage.tsx', 'src/pages/public/InvoiceVerificationPage.tsx']) {
    const src = read(f);
    assert.ok(!src.includes('SOVEREIGN PROTOCOL 1.19'), f);
    assert.ok(src.includes('BIN GROUP document check'), f);
  }
});

test('spinners have an accessible name by default', () => {
  const theme = read('src/theme/binGroupTheme.ts');
  assert.ok(theme.includes("MuiCircularProgress: {\n      defaultProps: { 'aria-label': 'Loading' },"));
});

test('connection strip only shows when offline', () => {
  const src = read('src/components/PortalConnectionStrip.tsx');
  assert.ok(src.includes('if (online) return null;'));
  assert.ok(src.includes("offline: 'You are working offline'"), 'offline warning is kept');
});
