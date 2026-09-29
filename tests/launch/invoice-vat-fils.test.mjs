import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aedTotalWithVat, uaeVatAmount } from '../../src/utils/uaeVat.mjs';

test('invoice VAT keeps fils instead of rounding to a whole dirham', () => {
  assert.equal(uaeVatAmount(10.1), 0.51);
  assert.equal(uaeVatAmount(100.4), 5.02);
  assert.equal(uaeVatAmount(0), 0);
  const invoice = aedTotalWithVat(10.1 + 0.004);
  assert.equal(invoice.net, 10.1);
  assert.equal(invoice.vat, 0.51);
  assert.equal(invoice.total, 10.61);
});

test('the live invoice page uses fils VAT and does not round the tax to a dirham', () => {
  const source = readFileSync('src/pages/InvoiceDetailsPage.tsx', 'utf8');
  assert.match(source, /aedTotalWithVat/);
  assert.doesNotMatch(source, /Math\.round\(total \* 0\.05\)/);
  assert.match(source, /minimumFractionDigits: 2/);
});
