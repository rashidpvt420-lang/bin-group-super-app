import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('owner shell root carries the .owner-shell class the safety CSS targets', () => {
  const app = read('src/owner/OwnerApp.tsx');
  assert.match(app, /className="owner-shell"/);
  const css = read('src/styles/whitePlatinumAuthenticated.css');
  assert.match(css, /\.owner-shell \.MuiInputBase-input/);
  assert.match(css, /\.owner-shell \.MuiSelect-select/);
});

test('owner ticket detail has no white text, white back icon or dark cards on the white canvas', () => {
  const src = read('src/owner/pages/OwnerTicketDetailPage.tsx');
  const lines = src.split('\n');
  const offenders = lines.filter((l) =>
    /color="#(FFF|fff)"|color: '#(FFF|fff)'|color="rgba\(255,255,255|color: 'rgba\(255,255,255|rgba\((22, 22, 24|15, 23, 42), 0\.\d+\)|#020617/.test(l)
    // the red Dispute/Escalate button keeps white-on-red text
    && !/'#ef4444' : binThemeTokens\.gold/.test(l));
  assert.deepEqual(offenders, []);
  assert.match(src, /variant="h4" fontWeight="950" color=\{binThemeTokens\.textPrimary\}/);
});

test('owner complaint form fields and labels are not white on white', () => {
  const src = read('src/owner/pages/OwnerComplaintPage.tsx');
  const offenders = src.split('\n').filter((l) =>
    /color: '#(FFF|fff)'|color: 'rgba\(255,255,255|rgba\(22, 22, 24/.test(l)
    // photo remove button sits on a dark rgba(0,0,0,0.6) chip
    && !/bgcolor: 'rgba\(0,0,0,0\.6\)'/.test(l));
  assert.deepEqual(offenders, []);
});

test('owner page headers on light gold surfaces use dark text', () => {
  for (const p of ['OwnerAIIntelligencePage', 'OwnerActivationPage', 'OwnerContractsResolvedPage', 'OwnerDamageEstimatePage']) {
    const src = read(`src/owner/pages/${p}.tsx`);
    const headers = src.split('\n').filter((l) => /variant="h4"/.test(l) && /color: '#(FFF|fff)'/.test(l));
    assert.deepEqual(headers, [], `${p} has a white h4 header`);
  }
});
