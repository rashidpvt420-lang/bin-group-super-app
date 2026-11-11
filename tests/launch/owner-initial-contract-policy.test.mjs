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
  OWNER_INITIAL_CANCELLATION_FEE_DURING_WAIVED_MONTH,
  OWNER_CASH_ACCEPTANCE_THRESHOLD_AED,
  OWNER_EMERGENCY_REPAIR_PER_INCIDENT_LIMIT_AED,
  OWNER_EMERGENCY_REPAIR_APPROVER,
  OWNER_MANAGEMENT_FEE_VAT_RATE_PERCENT,
  OWNER_QUOTE_PRICES_ARE_VAT_EXCLUSIVE,
  OWNER_INVOICE_VAT_TREATMENT_UNTIL_TRN_VERIFIED,
  OWNER_PAYMENT_POLICY_VERSION,
  OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_PERCENT,
  BIN_GROUP_TRADE_LICENCE_REF,
  BIN_GROUP_RERA_ORN_REF,
  BIN_GROUP_ADREC_REG_REF,
  OWNER_CONTRACT_AUTO_RENEWAL,
  evaluateOwnerInitialCancellationFeeHonesty,
  formatOwnerInitialCancellationFee,
  formatOwnerCashAcceptanceThreshold,
  formatOwnerEmergencyRepairLimit,
  formatOfficeHighRiseLogisticsUplift,
  ownerAgencyNoGuaranteeCopy,
  ownerAmlCashThresholdCopy,
  ownerCancellationFeePreSignNoticeCopy,
  ownerCancellationWindowCopy,
  ownerComplimentaryMonthCopy,
  ownerDecennialAndMollakCopy,
  ownerEmergencyRepairCopy,
  ownerGoverningLawJurisdictionCopy,
  ownerLanguagePrecedenceCopy,
  ownerLicenceBlockCopy,
  ownerMobilisationRefundCopy,
  ownerPdplCopy,
  ownerReturnedChequeCopy,
  ownerVatTreatmentCopy,
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
    assert.match(read(path), /BIN_GROUP_TRADE_LICENCE_REF: string \| null = null/);
    assert.match(read(path), /BIN_GROUP_RERA_ORN_REF: string \| null = null/);
    assert.match(read(path), /BIN_GROUP_ADREC_REG_REF: string \| null = null/);
    assert.match(read(path), /OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_PERCENT: number \| null = null/);
    assert.match(read(path), /administrative disbursement fee covering documented onboarding and property assessment costs/);
    assert.match(read(path), /OWNER_CASH_ACCEPTANCE_THRESHOLD_AED: number \| null = null/);
    assert.match(read(path), /OWNER_EMERGENCY_REPAIR_PER_INCIDENT_LIMIT_AED: number \| null = null/);
    assert.match(read(path), /OWNER_INITIAL_CANCELLATION_FEE_DURING_WAIVED_MONTH: boolean \| null = null/);
    assert.match(read(path), /AED 1,500 to AED 3,000/);
    assert.match(read(path), /That range is not applied/);
    assert.match(read(path), /AED 55,000/);
    assert.match(read(path), /That figure is not applied/);
    assert.match(read(path), /RETAIN_VERIFIABLE_INCURRED_EXPENSES_REFUND_REMAINDER/);
  }
  assert.equal(OWNER_INITIAL_CANCELLATION_FEE_AED, null);
  assert.equal(formatOwnerInitialCancellationFee().displayEn, 'to be confirmed');
  assert.equal(formatOwnerInitialCancellationFee().aed, null);
  assert.equal(OWNER_CASH_ACCEPTANCE_THRESHOLD_AED, null);
  assert.equal(OWNER_EMERGENCY_REPAIR_PER_INCIDENT_LIMIT_AED, null);
  assert.equal(OWNER_EMERGENCY_REPAIR_APPROVER, null);
  assert.equal(OWNER_INITIAL_CANCELLATION_FEE_DURING_WAIVED_MONTH, null);
  assert.equal(OWNER_QUOTE_PRICES_ARE_VAT_EXCLUSIVE, true);
  assert.equal(OWNER_MANAGEMENT_FEE_VAT_RATE_PERCENT, 5);
  assert.equal(OWNER_INVOICE_VAT_TREATMENT_UNTIL_TRN_VERIFIED, 'NOT_APPLIED');
  assert.equal(OWNER_PAYMENT_POLICY_VERSION, 'PHASE1_CASH_CHEQUE_V1');
  assert.equal(formatOwnerCashAcceptanceThreshold().displayEn, 'to be confirmed');
  assert.equal(formatOwnerEmergencyRepairLimit().displayEn, 'to be confirmed');
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
  assert.match(terms, /first month management fee waived/);
  assert.match(terms, /OWNER_INITIAL_CANCELLATION_WINDOW_DAYS/);
  assert.match(terms, /ownerCancellationFeePreSignNoticeCopy/);
  assert.match(pdf, /to be confirmed/);
  assert.match(pdf, /first month management fee waived/i);
  assert.doesNotMatch(pdf, /1 complimentary month/i);
  assert.doesNotMatch(pdf, /شهر خدمة مجاني/);
  assert.match(commercial, /First month's management fee waived|رسوم الإدارة للشهر الأول مُعفاة/);
  assert.match(review, /First month's management fee waived|رسوم الإدارة للشهر الأول مُعفاة/);
  assert.match(commercial, /administrative disbursement fee/);
  assert.match(review, /administrative disbursement fee/);
  assert.match(pdf, /BIN-GROUP-OWNER-AGREEMENT-v1\.3/);
  assert.match(pdf, /Federal Law No\. 15 of 2020/);
  assert.match(pdf, /ownerPdplCopy/);
  assert.match(ownerPdplCopy(), /Decree-Law 45 of 2021/);
  assert.match(pdf, /Draft clauses for legal review/);
  assert.match(pdf, /not a compliance certificate/);
  assert.match(pdf, /formatPropertyManagementLicenceRef/);
  assert.match(pdf, /placeholder pending legal insertion/);
  assert.match(pdf, /ownerGoverningLawJurisdictionCopy/);
  assert.match(pdf, /ownerLanguagePrecedenceCopy/);
  assert.match(pdf, /ownerMobilisationRefundCopy/);
  assert.match(pdf, /ownerPdplCopy/);
  assert.match(pdf, /ownerDecennialAndMollakCopy/);
  assert.match(pdf, /ownerLicenceBlockCopy/);
  assert.match(pdf, /renderPricedAddOns/);
  assert.match(pdf, /renderQuoteLineItems/);
  assert.doesNotMatch(pdf, /licence number [0-9]{4,}/i);
  assert.doesNotMatch(pdf, /Abu Dhabi Courts shall have jurisdiction/);
  assert.match(office, /no separate office-tower uplift exists until a founder decision/);
  assert.match(office, /uplift config exists and is unset/);
  assert.match(quote, /return \{ \.\.\.unsignedQuote, quoteHash, commercialLines \}/);
  assert.match(terms, /aiMayApproveMoneyOrContracts: false/);
  assert.match(terms, /autoApproveCancellation: false/);
  assert.match(terms, /OWNER_CONTRACT_AUTO_RENEWAL/);
  assert.match(terms, /does not auto-renew/);

  const signature = read('src/components/onboarding/ContractSignatureStep.tsx');
  assert.match(signature, /ownerGoverningLawJurisdictionCopy/);
  assert.match(signature, /ownerCancellationFeePreSignNoticeCopy/);
  assert.match(signature, /ownerVatTreatmentCopy/);
  assert.match(signature, /ownerAmlCashThresholdCopy/);
  assert.match(signature, /ownerReturnedChequeCopy/);
  assert.match(signature, /ownerAgencyNoGuaranteeCopy/);
  assert.match(signature, /ownerEmergencyRepairCopy/);
  assert.doesNotMatch(signature, /Abu Dhabi Courts have jurisdiction/);
  assert.doesNotMatch(signature, /DIFC|ADGM/);
  assert.match(pdf, /ownerVatTreatmentCopy/);
  assert.match(pdf, /ownerAmlCashThresholdCopy/);
  assert.match(pdf, /ownerReturnedChequeCopy/);
  assert.match(pdf, /ownerAgencyNoGuaranteeCopy/);
  assert.match(pdf, /ownerEmergencyRepairCopy/);
  assert.match(pdf, /ownerCancellationFeePreSignNoticeCopy/);
  assert.match(pdf, /executive instrument/);

  assert.equal(OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_PERCENT, null);
  assert.equal(BIN_GROUP_TRADE_LICENCE_REF, null);
  assert.equal(BIN_GROUP_RERA_ORN_REF, null);
  assert.equal(BIN_GROUP_ADREC_REG_REF, null);
  assert.equal(OWNER_CONTRACT_AUTO_RENEWAL, false);
  assert.equal(formatOfficeHighRiseLogisticsUplift().applied, false);
  assert.match(formatOfficeHighRiseLogisticsUplift().displayEn, /to be confirmed/);
  assert.match(ownerCancellationWindowCopy(), /administrative disbursement fee covering documented onboarding and property assessment costs/);
  assert.match(ownerCancellationWindowCopy(), /Draft, for UAE legal review/);
  assert.match(ownerCancellationWindowCopy(), /including during the period when the first month's management fee is waived/);
  assert.match(ownerCancellationFeePreSignNoticeCopy(), /first month's management fee is waived/);
  assert.match(ownerCancellationFeePreSignNoticeCopy(), /applies within the 30-day window/);
  assert.match(ownerComplimentaryMonthCopy(), /first month's management fee is waived/);
  assert.match(ownerComplimentaryMonthCopy(), /13-month term/);
  assert.doesNotMatch(ownerComplimentaryMonthCopy(), /complimentary|free month/i);
  assert.match(ownerComplimentaryMonthCopy(), /Months 2 to 13 are billed at the contract rate/);
  assert.match(ownerComplimentaryMonthCopy(), /does not auto-renew/);
  assert.match(ownerMobilisationRefundCopy(), /inspection and inventory/);
  assert.match(ownerMobilisationRefundCopy(), /property photographs/);
  assert.match(ownerMobilisationRefundCopy(), /Ejari \/ Tawtheeq setup/);
  assert.match(ownerMobilisationRefundCopy(), /compliance checks/);
  assert.match(ownerMobilisationRefundCopy(), /unearned balance/);
  assert.match(ownerMobilisationRefundCopy(), /Rashid/);
  assert.match(ownerGoverningLawJurisdictionCopy(), /Tenancy disputes/);
  assert.match(ownerGoverningLawJurisdictionCopy(), /courts of the Emirate where the Property is physically located/);
  assert.match(ownerGoverningLawJurisdictionCopy(), /Rental Disputes Settlement Centre/);
  assert.match(ownerGoverningLawJurisdictionCopy(), /AED 50,000/);
  assert.doesNotMatch(ownerGoverningLawJurisdictionCopy(), /DIFC|ADGM/);
  assert.doesNotMatch(pdf, /DIFC|ADGM/);
  assert.match(ownerLanguagePrecedenceCopy(), /Arabic version shall prevail/);
  assert.doesNotMatch(ownerLanguagePrecedenceCopy(), /English text shall prevail|English version shall prevail/);
  assert.match(ownerVatTreatmentCopy(), /exclusive of 5% UAE VAT/);
  assert.match(ownerVatTreatmentCopy(), /VAT not applied/);
  assert.doesNotMatch(ownerVatTreatmentCopy(), /1,500|55,000/);
  assert.match(ownerAmlCashThresholdCopy(), /PHASE1_CASH_CHEQUE_V1/);
  assert.match(ownerAmlCashThresholdCopy(), /to be confirmed/);
  assert.doesNotMatch(ownerAmlCashThresholdCopy(), /55,000/);
  assert.match(ownerReturnedChequeCopy(), /executive instrument/);
  assert.match(ownerReturnedChequeCopy(), /does not waive the outstanding balance/);
  assert.match(ownerAgencyNoGuaranteeCopy(), /acts as the Owner's agent/);
  assert.match(ownerAgencyNoGuaranteeCopy(), /does not guarantee rental yields/);
  assert.match(ownerEmergencyRepairCopy(), /HVAC or water-leak/);
  assert.match(ownerEmergencyRepairCopy(), /to be confirmed/);
  assert.match(ownerEmergencyRepairCopy(), /AI systems may never approve/);
  assert.doesNotMatch(ownerEmergencyRepairCopy(), /1,500|2,500/);
  assert.match(ownerPdplCopy(), /separate opt-in/);
  assert.match(ownerPdplCopy(), /withdraw/);
  assert.match(ownerDecennialAndMollakCopy(), /Mollak/);
  assert.match(ownerDecennialAndMollakCopy(), /never collected by BIN GROUP directly/);
  assert.match(ownerLicenceBlockCopy(), /RERA ORN/);
  assert.match(ownerLicenceBlockCopy(), /Ejari or Tawtheeq/);
  assert.match(ownerLicenceBlockCopy(), /to be inserted/);
  for (const fn of [ownerGoverningLawJurisdictionCopy, ownerLanguagePrecedenceCopy, ownerPdplCopy, ownerDecennialAndMollakCopy, ownerLicenceBlockCopy, ownerMobilisationRefundCopy, ownerComplimentaryMonthCopy, ownerCancellationWindowCopy, ownerVatTreatmentCopy, ownerAmlCashThresholdCopy, ownerReturnedChequeCopy, ownerAgencyNoGuaranteeCopy, ownerEmergencyRepairCopy, ownerCancellationFeePreSignNoticeCopy]) {
    assert.match(fn(true), /مسودة، للمراجعة القانونية في دولة الإمارات/);
  }
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
    assert.equal(E.OFFICE_HIGH_RISE_LOGISTICS_UPLIFT_PERCENT, null);
    const officeInput = { assetClassId: 'off-sml', emirate: 'Dubai', area: 'Business Bay', zone: 'B', contractType: 'FM_ONLY', sqft: 10000, floors: 20, propertyAge: 5, slaTier: 'standard', paymentPlan: 'annual' };
    const current = E.calculateUaeQuote2026(officeInput);
    const stillUnset = E.calculateUaeQuote2026({ ...officeInput, officeHighRiseLogisticsUpliftPercent: null });
    assert.equal(current.annualTotal, stillUnset.annualTotal);
    const withUplift = E.calculateUaeQuote2026({ ...officeInput, officeHighRiseLogisticsUpliftPercent: 20 });
    assert.ok(withUplift.annualTotal > current.annualTotal, 'a founder-set office uplift should increase the quote only when provided');
    assert.match((withUplift.pricingExplanation || []).join(' '), /High-rise office logistics uplift 20%/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
