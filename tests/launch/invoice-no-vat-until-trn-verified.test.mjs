// Behavioural: while the BIN GROUP TRN is unverified, invoices add no VAT and match the
// VAT-free server quote. VAT at 5% (to the fils) only applies behind a verified 15-digit TRN.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { BIN_GROUP_VAT_REGISTRATION, invoiceTotals, isVerifiedVatRegistration } from '../../src/utils/uaeVat.mjs';

let server;
let tempDir;
test.before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'bin-invoice-vat-'));
  const outfile = join(tempDir, 'server.mjs');
  await build({ entryPoints: ['functions/ownerOnboardingQuote.ts'], outfile, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'silent' });
  server = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
});
test.after(() => { if (tempDir) rmSync(tempDir, { recursive: true, force: true }); });

const VERIFIED = Object.freeze({ trnVerified: true, trn: '100000000000003' });

test('the issuer VAT registration defaults to unverified, so no VAT is charged', () => {
  assert.equal(BIN_GROUP_VAT_REGISTRATION.trnVerified, false);
  assert.equal(BIN_GROUP_VAT_REGISTRATION.trn, null);
  assert.ok(Object.isFrozen(BIN_GROUP_VAT_REGISTRATION));
  assert.deepEqual(invoiceTotals(1725), { net: 1725, vat: 0, total: 1725, vatApplied: false, vatTreatment: 'NOT_APPLIED' });
  assert.deepEqual(invoiceTotals(10.1), { net: 10.1, vat: 0, total: 10.1, vatApplied: false, vatTreatment: 'NOT_APPLIED' });
});

test('invoice totals equal the real server quote amounts (quote, deposit and remainder carry VAT 0)', () => {
  const quote = server.calculateOwnerOnboardingQuote([
    { propertyType: 'Apartment', emirate: 'Dubai', zone: 'B', units: 1, age: 3, strategy: 'both', annualRent: 100000 },
  ], [], 1790000000000);
  assert.equal(quote.vatAmount, 0);
  assert.equal(quote.vatTreatment, 'NOT_APPLIED');
  for (const amount of [quote.annualContractValue, quote.activationDeposit, quote.remainingAmount]) {
    const invoice = invoiceTotals(amount);
    assert.equal(invoice.vat, 0);
    assert.equal(invoice.total, amount);
    assert.equal(invoice.vatTreatment, quote.vatTreatment);
  }
});

test('VAT is only applied behind a verified 15-digit TRN, and then to the fils', () => {
  for (const registration of [
    { trnVerified: true, trn: null }, { trnVerified: true, trn: 'Pending Verification' }, { trnVerified: true, trn: '12345' },
    { trnVerified: 'true', trn: VERIFIED.trn }, { trnVerified: false, trn: VERIFIED.trn }, null, undefined, {},
  ]) {
    assert.equal(isVerifiedVatRegistration(registration), false, JSON.stringify(registration));
    assert.equal(invoiceTotals(1000, registration ?? undefined).vat, 0, JSON.stringify(registration));
  }
  assert.equal(isVerifiedVatRegistration(VERIFIED), true);
  assert.deepEqual(invoiceTotals(10.1, VERIFIED), { net: 10.1, vat: 0.51, total: 10.61, vatApplied: true, vatTreatment: 'STANDARD_RATED_5' });
  assert.deepEqual(invoiceTotals(6725, VERIFIED), { net: 6725, vat: 336.25, total: 7061.25, vatApplied: true, vatTreatment: 'STANDARD_RATED_5' });
});

test('the live invoice page takes its totals and TRN from the gated config, not a hard-coded 5%', () => {
  const source = readFileSync('src/pages/InvoiceDetailsPage.tsx', 'utf8');
  assert.match(source, /import \{ BIN_GROUP_VAT_REGISTRATION, invoiceTotals \} from '\.\.\/utils\/uaeVat\.mjs';/);
  assert.match(source, /= invoiceTotals\(lineNet\);/);
  assert.doesNotMatch(source, /aedTotalWithVat|\* 0\.05|UAE-VAT-CERTIFIED/);
  assert.match(source, /vatApplied \? 'TAX INVOICE \/ فاتورة ضريبية' : 'INVOICE \/ فاتورة'/);
  assert.match(source, /vatApplied \? t\('common\.vat_5'\) : 'VAT: not applied \(TRN pending verification\)/);
});
