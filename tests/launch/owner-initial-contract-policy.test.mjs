import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import {
  OWNER_INITIAL_CANCELLATION_FEE_AED,
  OWNER_INITIAL_CANCELLATION_FEE_HONESTY_CODE,
  evaluateOwnerInitialCancellationFeeHonesty,
  formatOwnerInitialCancellationFee,
} from '../../scripts/lib/owner-initial-contract-policy.mjs';
import { launchHonestyCancellationFeeErrors } from '../../scripts/lib/launch-honesty.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const POLICY_COPIES = [
  'src/utils/ownerInitialContractPolicy.ts',
  'functions/ownerInitialContractPolicy.ts',
  'packages/shared/src/pricing/ownerInitialContractPolicy.ts',
];

test('cancellation fee stays unset in every policy copy and is not an invented number', () => {
  const src = read(POLICY_COPIES[0]);
  for (const path of POLICY_COPIES) {
    assert.equal(read(path), src);
    assert.match(read(path), /export const OWNER_INITIAL_CANCELLATION_FEE_AED: number \| null = null;/);
    assert.match(read(path), /to be confirmed/);
    assert.match(read(path), /Never invent a number/);
    assert.match(read(path), /BIN_GROUP_PROPERTY_MANAGEMENT_LICENCE_REF: string \| null = null/);
  }
  assert.equal(OWNER_INITIAL_CANCELLATION_FEE_AED, null);
  assert.equal(formatOwnerInitialCancellationFee().displayEn, 'to be confirmed');
  assert.equal(formatOwnerInitialCancellationFee().aed, null);
});

test('launch-honesty flags an unset cancellation fee and would clear only after a confirmed amount is set', () => {
  const unset = evaluateOwnerInitialCancellationFeeHonesty();
  assert.equal(unset.ok, false);
  assert.equal(unset.blocksHardPublicLaunch, true);
  assert.equal(unset.code, OWNER_INITIAL_CANCELLATION_FEE_HONESTY_CODE);
  assert.match(unset.message, /unset/);
  assert.match(unset.message, /Do not invent an amount/);
  const errors = launchHonestyCancellationFeeErrors();
  assert.equal(errors.length, 1);
  assert.equal(errors[0], unset.message);

  const set = evaluateOwnerInitialCancellationFeeHonesty(150);
  assert.equal(set.ok, true);
  assert.equal(set.blocksHardPublicLaunch, false);
  assert.deepEqual(launchHonestyCancellationFeeErrors(150), []);
  assert.equal(formatOwnerInitialCancellationFee(150).displayEn.includes('150'), true);
});

test('hard public launch eligibility hook and live contract/UI copy stay honest while the fee is unset', () => {
  const gate = read('scripts/lib/hard-launch-gate-base.mjs');
  const honesty = read('scripts/lib/launch-honesty.mjs');
  assert.match(honesty, /launchHonestyCancellationFeeErrors/);
  assert.match(gate, /errors\.push\(\.\.\.launchHonestyCancellationFeeErrors\(\)\)/);

  const pdf = read('functions/pdfEngine.ts');
  const terms = read('functions/ownerContractTerm.ts');
  const commercial = read('src/components/onboarding/CommercialTermsStep.tsx');
  const review = read('src/components/onboarding/ReviewBeforeSubmitStep.tsx');
  const contracts = read('src/owner/pages/OwnerContractsResolvedPage.tsx');
  const office = read('src/components/onboarding/AssetTypeDetailsPanel.tsx');
  const schedule = read('functions/ownerCommercialSchedule.ts');
  const quote = read('functions/ownerOnboardingQuote.ts');

  for (const [name, source] of [['pdf', pdf], ['commercial', commercial], ['review', review], ['contracts', contracts], ['schedule', schedule], ['terms', terms]]) {
    assert.match(source, /formatOwnerInitialCancellationFee|to be confirmed|يُؤكد لاحقاً/, `${name} should show the pending cancellation fee`);
  }
  assert.match(terms, /complimentary service month/);
  assert.match(terms, /OWNER_INITIAL_CANCELLATION_WINDOW_DAYS/);
  assert.match(pdf, /to be confirmed/);
  assert.match(pdf, /complimentary|مجاني/);
  assert.match(commercial, /Complimentary first month|الشهر الأول المجاني/);
  assert.match(review, /Complimentary first month|الشهر الأول المجاني/);
  assert.match(pdf, /BIN-GROUP-OWNER-AGREEMENT-v1\.1/);
  assert.match(pdf, /Federal Law No\. 15 of 2020/);
  assert.match(pdf, /Decree-Law No\. 45 of 2021/);
  assert.match(pdf, /Draft clauses for legal review/);
  assert.match(pdf, /not a compliance certificate/);
  assert.match(pdf, /formatPropertyManagementLicenceRef/);
  assert.match(pdf, /placeholder pending legal insertion/);
  assert.match(pdf, /renderPricedAddOns/);
  assert.match(pdf, /renderQuoteLineItems/);
  assert.doesNotMatch(pdf, /licence number [0-9]{4,}/i);
  assert.match(office, /no separate office-tower uplift exists until a founder decision/);
  assert.match(quote, /return \{ \.\.\.unsignedQuote, quoteHash, commercialLines \}/);
  assert.match(terms, /aiMayApproveMoneyOrContracts: false/);
  assert.match(terms, /autoApproveCancellation: false/);
});

test('commercial line items total the same annual value the quote engine already produces', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'owner-policy-quote-'));
  const outfile = join(dir, 'engine.mjs');
  try {
    await build({
      entryPoints: ['src/utils/calculateUaeQuote2026.ts'],
      outfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      logLevel: 'silent',
    });
    const E = await import(pathToFileURL(outfile).href);
    const cases = [
      { assetClassId: 'villa-std', emirate: 'Dubai', area: 'Business Bay', zone: 'B', contractType: 'FM_ONLY', units: 1, propertyAge: 5, slaTier: 'standard', paymentPlan: 'annual' },
      { assetClassId: 'apt-std', emirate: 'Dubai', area: 'Business Bay', zone: 'B', contractType: 'FM_ONLY', units: 1, bedrooms: 1, propertyAge: 5, slaTier: 'standard', paymentPlan: 'annual' },
      { assetClassId: 'res-bldg', emirate: 'Dubai', area: 'Business Bay', zone: 'B', contractType: 'FM_ONLY', sqft: 10000, floors: 8, lifts: 2, propertyAge: 5, slaTier: 'standard', paymentPlan: 'annual', hasCentralHVAC: true },
      { assetClassId: 'villa-std', emirate: 'Dubai', area: 'Business Bay', zone: 'B', contractType: 'BOTH', units: 1, annualRent: 200000, propertyAge: 5, slaTier: 'standard', paymentPlan: 'annual' },
      { assetClassId: 'mosque_fm', emirate: 'Dubai', area: 'Business Bay', zone: 'B', contractType: 'FM_ONLY', sqft: 10000, units: 500, propertyAge: 5, slaTier: 'standard', paymentPlan: 'annual', hasCentralHVAC: true },
    ];
    for (const input of cases) {
      const quote = E.calculateUaeQuote2026(input);
      const breakdown = E.buildOwnerQuoteCommercialBreakdown(input, quote);
      assert.ok(quote.annualTotal > 0, `${input.assetClassId} should price`);
      assert.equal(breakdown.annualTotal, Math.round(quote.annualTotal * 100) / 100);
      assert.equal(breakdown.mobilizationFee, Math.round(quote.mobilizationFee * 100) / 100);
      const annualLine = breakdown.lines.find((line) => line.id === 'annual_total');
      assert.equal(annualLine.amountAed, breakdown.annualTotal);
      const freeMonth = breakdown.lines.find((line) => line.id === 'complimentary_month');
      assert.equal(freeMonth.amountAed, 0);
      if (input.contractType === 'BOTH') assert.ok(breakdown.managementFee >= 5000, 'hybrid PM fee should appear');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
