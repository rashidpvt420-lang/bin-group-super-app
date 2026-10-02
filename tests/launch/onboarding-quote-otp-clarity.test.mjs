import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { build } from 'esbuild';

let tempDir;
let engine;

async function bundle(entry, name) {
  const outfile = join(tempDir, `${name}.mjs`);
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'silent',
  });
  return import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
}

test.before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'bin-onboarding-clarity-'));
  engine = await bundle('src/utils/calculateUaeQuote2026.ts', 'engine');
});

test.after(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

test('age-driven PCA audit appears in pricing explanation so Annual Value is not mysterious', () => {
  const quote = engine.calculateUaeQuote2026({
    assetClassId: 'villa-std',
    emirate: 'abuDhabi',
    zone: 'B',
    contractType: 'FM_ONLY',
    units: 1,
    sqft: 1658,
    propertyAge: 40,
    floors: 1,
    slaTier: 'elite',
    paymentPlan: 'annual',
    addOns: ['fire_safety', 'water_tank', 'hvac_pm'],
  });
  assert.equal(quote.annualTotal, 12506);
  assert.equal(quote.addOnTotal, 6500);
  assert.ok(
    quote.pricingExplanation.some((line) => /PCA Asset Audit add-on: AED 6500 per year/i.test(line)),
    `missing PCA line in ${JSON.stringify(quote.pricingExplanation)}`,
  );
  // Owner-ticked system packages must not bill without system flags.
  assert.ok(!quote.pricingExplanation.some((line) => /Fire Safety|Water Tank|HVAC/i.test(line)));
});

test('selecting matching systems bills fire/tank/hvac and still explains PCA', () => {
  const quote = engine.calculateUaeQuote2026({
    assetClassId: 'villa-std',
    emirate: 'abuDhabi',
    zone: 'B',
    contractType: 'FM_ONLY',
    units: 1,
    sqft: 1658,
    propertyAge: 40,
    floors: 1,
    slaTier: 'elite',
    paymentPlan: 'annual',
    hasCentralHVAC: true,
    hasWaterTank: true,
    hasCivilDefenseSystem: true,
  });
  assert.equal(quote.annualTotal, 24155.5);
  assert.ok(quote.pricingExplanation.some((line) => /PCA Asset Audit add-on: AED 6500 per year/i.test(line)));
  assert.ok(quote.pricingExplanation.some((line) => /Fire Safety add-on: AED 2500 per year/i.test(line)));
});

test('Systems Matrix UI no longer pretends system packages are defaultSelected/required without systems', () => {
  const source = readFileSync('src/components/onboarding/SystemsDataStep.tsx', 'utf8');
  assert.match(source, /SYSTEM_DRIVEN_ADDON_IDS/);
  assert.match(source, /SYSTEM_LOCKED_ADDON_IDS/);
  assert.match(source, /Select matching system above/);
  assert.match(source, /pcaRequired/);
  assert.doesNotMatch(source, /defaultSelected:\s*true/);
  assert.doesNotMatch(source, /required:\s*true,\s*defaultSelected/);
});

test('signature OTP step shows Owner login mailbox and maps delivery failures', () => {
  const source = readFileSync('src/components/onboarding/ContractSignatureStep.tsx', 'utf8');
  assert.match(source, /OTP is emailed only to your Owner login address/);
  assert.match(source, /BIN GROUP property application signature OTP/);
  assert.match(source, /mapOtpError/);
  assert.match(source, /resource-exhausted/);
  assert.match(source, /Code sent to \$\{ownerEmail\}/);
});

test('Commercial terms surfaces engine factor lines beside the quote estimate', () => {
  const source = readFileSync('src/components/onboarding/CommercialTermsStep.tsx', 'utf8');
  assert.match(source, /quoteFactorLines/);
  assert.match(source, /Quote factors \(same engine as Review\)/);
});

test('automatic property calculations expose every space group so chips sum to Declared spaces', async () => {
  const intelligenceMod = await bundle('src/utils/propertyIntelligence.ts', 'intel');
  const summary = intelligenceMod.calculatePropertyIntelligence({
    propertyType: 'Villa',
    floors: 1,
    sqft: 1658,
    units: 1,
    age: 40,
    spaceInventory: [
      { id: 'bedroom', type: 'bedroom', labelEn: 'Bedroom', labelAr: 'غرفة نوم', count: 6 },
      { id: 'bathroom', type: 'bathroom', labelEn: 'Bathroom', labelAr: 'حمام', count: 2 },
      { id: 'kitchen', type: 'kitchen', labelEn: 'Kitchen', labelAr: 'مطبخ', count: 1 },
      { id: 'majlis_hall', type: 'majlis_hall', labelEn: 'Majlis', labelAr: 'مجلس', count: 1 },
      { id: 'living_room', type: 'living_room', labelEn: 'Living', labelAr: 'معيشة', count: 1 },
      { id: 'dining_room', type: 'dining_room', labelEn: 'Dining', labelAr: 'طعام', count: 1 },
      { id: 'driver_room', type: 'driver_room', labelEn: 'Driver', labelAr: 'سائق', count: 1 },
      { id: 'parking_area', type: 'parking_area', labelEn: 'Parking', labelAr: 'موقف', count: 1 },
      { id: 'custom_hall', type: 'custom_hall', labelEn: 'Extra hall', labelAr: 'قاعة', count: 1 },
    ],
  });
  assert.equal(summary.totalDeclaredSpaces, 15);
  assert.equal(summary.totalRoomSpaces, 9);
  assert.equal(summary.totalWetAreas, 3);
  assert.equal(summary.totalWorkspaces, 0);
  assert.equal(summary.totalServiceSpaces, 1);
  assert.equal(summary.totalOutdoorSpaces, 1);
  assert.equal(summary.totalOtherSpaces, 1);
  assert.equal(
    summary.totalRoomSpaces
      + summary.totalWetAreas
      + summary.totalWorkspaces
      + summary.totalServiceSpaces
      + summary.totalAmenitySpaces
      + summary.totalOutdoorSpaces
      + summary.totalSpecialSpaces
      + summary.totalOtherSpaces,
    summary.totalDeclaredSpaces,
  );
  const panel = readFileSync('src/components/onboarding/PropertyInventoryPanel.tsx', 'utf8');
  assert.match(panel, /totalOutdoorSpaces/);
  assert.match(panel, /totalOtherSpaces/);
  assert.match(panel, /Other spaces/);
});

test('signature step reuses Review-locked quote and clears OTP only when a new hash is issued', () => {
  const source = readFileSync('src/components/onboarding/ContractSignatureStep.tsx', 'utf8');
  assert.match(source, /Reuse the Review-locked issuance when still valid/);
  assert.match(source, /setContractOtpVerificationId\(null\)/);
  assert.match(source, /quoteStillValid/);
  assert.match(source, /expiresAtMs/);
});

test('portfolio selectedAddOns sync from per-property Systems Matrix selections', () => {
  const store = readFileSync('src/store/onboardingStore.ts', 'utf8');
  const helper = readFileSync('src/utils/ownerOnboardingAddOns.ts', 'utf8');
  assert.match(helper, /collectPortfolioSelectedAddOns/);
  assert.match(helper, /resolveSystemBillableAddOnIds/);
  assert.match(store, /collectPortfolioSelectedAddOns/);
  assert.match(store, /selectedAddOns \}/);
  assert.match(store, /strategy: 'fm_only'/);
});

test('commercial SLA and payment plan apply to every portfolio property', () => {
  const source = readFileSync('src/components/onboarding/CommercialTermsStep.tsx', 'utf8');
  assert.match(source, /SLA and payment plan apply to the whole portfolio/);
  assert.match(source, /collectPortfolioBillableAddOnIds/);
  assert.match(source, /security: \{ en: 'Security Services \/ CCTV'/);
  assert.match(source, /pca_audit:/);
});

test('review schedule amounts derive from locked portfolio annual value', () => {
  const source = readFileSync('src/components/onboarding/ReviewBeforeSubmitStep.tsx', 'utf8');
  assert.match(source, /portfolioAnnual \/ 12/);
  assert.match(source, /portfolioAnnual \/ 4/);
  assert.doesNotMatch(source, /localQuote\?\.monthlyPayment/);
});

test('property location supports multi-property GPS capture', () => {
  const source = readFileSync('src/components/onboarding/PropertyLocationStep.tsx', 'utf8');
  assert.match(source, /activePropertyIndex/);
  assert.match(source, /updateProperty\(safeIndex,/);
  assert.match(source, /Capture location for property/);
});

test('AED 12,506 with zero systems is FM factors + silent PCA, not missing fire/tank/HVAC cards', () => {
  const quote = engine.calculateUaeQuote2026({
    assetClassId: 'villa-std',
    emirate: 'abuDhabi',
    zone: 'B',
    contractType: 'FM_ONLY',
    units: 1,
    sqft: 1658,
    propertyAge: 40,
    floors: 1,
    slaTier: 'elite',
    paymentPlan: 'annual',
  });
  assert.equal(quote.annualTotal, 12506);
  assert.equal(quote.addOnTotal, 6500);
  assert.ok(quote.pricingExplanation.some((line) => /3500 AED\/unit/i.test(line)));
  assert.ok(quote.pricingExplanation.some((line) => /1\.1x/i.test(line)));
  assert.ok(quote.pricingExplanation.some((line) => /1\.2x/i.test(line)));
  assert.ok(quote.pricingExplanation.some((line) => /1\.3x/i.test(line)));
  assert.ok(quote.pricingExplanation.some((line) => /PCA Asset Audit add-on: AED 6500/i.test(line)));
  // 6006 technical + 6500 PCA — the Review “gap” vs service-stack AED 16,880
  assert.equal(3500 * 1.1 * 1.2 * 1.3 + 6500, 12506);
});
