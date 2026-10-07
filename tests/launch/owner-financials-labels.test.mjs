import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// /financials called t('fin.*') for keys that did not exist, so the owner saw humanised
// keys such as "Deductions Title", "Fee Desc", "Advance Btn", plus "null% Occupancy".
const ctx = readFileSync(new URL('../../src/context/LanguageContext.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../src/pages/FinancialDashboardPage.tsx', import.meta.url), 'utf8');
const enBlock = ctx.slice(ctx.indexOf('en: {'), ctx.indexOf('ar: {'));
const arBlock = ctx.slice(ctx.indexOf('ar: {'));
const keys = [...new Set([...page.matchAll(/\bt\('(fin\.[a-z_.]+)'\)/g)].map((m) => m[1]))];
// Plain string lookup (no dynamic RegExp): returns the quoted value after 'key': or null.
const valueOf = (block, key) => {
  const at = block.indexOf(`'${key}':`);
  if (at < 0) return null;
  const m = /^\s*'([^']*)'/.exec(block.slice(at + key.length + 3));
  return m ? m[1] : null;
};
const has = (block, key) => Boolean(valueOf(block, key));

test('every fin.* key on /financials has English and Arabic copy', () => {
  assert.ok(keys.length > 10);
  const missingEn = keys.filter((k) => !has(enBlock, k));
  const missingAr = keys.filter((k) => !has(arBlock, k));
  assert.deepEqual(missingEn, [], `missing English: ${missingEn.join(', ')}`);
  assert.deepEqual(missingAr, [], `missing Arabic: ${missingAr.join(', ')}`);
});

test('occupancy never renders "null%"', () => {
  assert.doesNotMatch(page, /\$\{safeFinancials\.pm\?\.occupancyRate\}%/);
});

test('/financials uses plain wording, a readable axis and a light payout card', () => {
  const iban = readFileSync(new URL('../../src/components/IbanManager.tsx', import.meta.url), 'utf8');
  assert.ok(!iban.includes('SOVEREIGN PAYOUT DESTINATION') && iban.includes('>Payout bank account<'));
  assert.ok(!iban.includes("bgcolor: 'rgba(22, 22, 24, 0.6)'"), 'payout card must not be a translucent dark card on a light page');
  assert.equal(valueOf(enBlock, 'fin.transactions_title'), 'Transaction history');
  assert.ok(!page.includes("t('fin.logs_title')"));
  assert.ok(!page.includes('`AED ${value/1000}k`'), 'axis must not print AED0.001k');
  assert.match(page, /disabled\s+onClick=\{handleBridgeActivation\}/);
});
