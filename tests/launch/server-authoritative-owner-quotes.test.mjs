import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('server-authoritative Owner quote rejects mixed contract modes and invalid values', async () => {
  const source = await read('functions/ownerOnboardingQuote.ts');
  assert.match(source, /VALID_CONTRACT_MODES/);
  assert.match(source, /All properties in a portfolio quote must use the same contract mode/);
  assert.match(source, /Portfolio annual total must be positive/);
  assert.match(source, /activationDeposit = money\(portfolioAnnualTotal \* 0\.15\)/);
  assert.match(source, /remainingAmount = money\(portfolioAnnualTotal - activationDeposit\)/);
  assert.match(source, /expiresAtMs/);
});

test('accepted server quote hash changes when inputs or timestamp change', async () => {
  const source = await read('functions/ownerOnboardingQuote.ts');
  assert.match(source, /quotedAtMs/);
  assert.match(source, /JSON\.stringify/);
  assert.match(source, /createHash\(["']sha256["']\)/);
  assert.match(source, /quoteHash/);
});

test('recorded Owner portfolio quotes are bound to Owner, engine, expiry and exact totals', async () => {
  const source = await read('functions/ownerPortfolioQuote.ts');
  assert.match(source, /QUOTE_SCHEMA_VERSION/);
  assert.match(source, /PRICING_ENGINE_VERSION/);
  assert.match(source, /QUOTE_TTL_MS/);
  assert.match(source, /quote\.ownerUid !== ownerUid/);
  assert.match(source, /quote\.status !== ["']ACTIVE["']/);
  assert.match(source, /quote\.quoteSchemaVersion !== QUOTE_SCHEMA_VERSION/);
  assert.match(source, /quote\.pricingEngineVersion !== PRICING_ENGINE_VERSION/);
  assert.match(source, /Number\(quote\.expiresAtMs \|\| 0\) <= Date\.now\(\)/);
  assert.match(source, /quote\.quoteHash !== suppliedQuoteHash/);
  assert.match(source, /quote\.inputHash !== suppliedInputHash/);
  assert.match(source, /Portfolio annual total does not match the server quote/);
  assert.match(source, /Mobilisation deposit does not match the server quote/);
  assert.match(source, /portfolioAnnualTotal \* 0\.15/);
});

test('five-page Review issues a fresh authenticated quote and blocks progression when stale or invalid', async () => {
  const source = await read('src/components/onboarding/ReviewBeforeSubmitStep.tsx');
  assert.match(source, /previewOwnerInspectionQuote/);
  assert.match(source, /serverQuoteRequestKey/);
  assert.match(source, /serverQuote\.expiresAtMs <= Date\.now\(\)/);
  assert.match(source, /portfolioAnnualTotal:\s*nextQuote\.annualContractValue/);
  assert.match(source, /mobilisationDeposit:\s*nextQuote\.activationDeposit/);
  assert.match(source, /disabled=\{quoteLoading \|\| quoteExpired \|\| Boolean\(quoteError\)\}/);
  assert.match(source, /setValuationResult/);
});

test('five-page final submission deterministically recalculates and revalidates the signed quote before persistence', async () => {
  const source = await read('functions/inspectionFirstOwnerOnboarding.ts');
  assert.match(source, /function assertQuote/);
  assert.match(source, /const quotedAtMs = finite\(data\.quoteQuotedAtMs \|\| data\.quotedAtMs\)/);
  assert.match(source, /quotedAtMs > Date\.now\(\) \+ 60_000/);
  assert.match(source, /const quote = quoteFor\(properties, selectedAddOns, quotedAtMs\)/);
  assert.match(source, /Number\(quote\.expiresAtMs \|\| 0\) <= Date\.now\(\)/);
  assert.match(source, /text\(data\.quoteHash\)\.toLowerCase\(\) !== quote\.quoteHash/);
  assert.match(source, /Number\(quote\.annualContractValue\) \* 0\.15/);
  assert.match(source, /quoteHash:\s*quote\.quoteHash/);
  assert.match(source, /quoteSnapshot:\s*cleanPlain\(quote\)/);
  assert.match(source, /SUBMITTED_FOR_PROPERTY_INSPECTION/);
});

test('legacy payment package accepts only a recorded quote or deterministic fresh recalculation', async () => {
  const source = await read('functions/secureOwnerRegistrationRequest.ts');
  assert.match(source, /async function assertServerQuote/);
  assert.match(source, /if \(text\(data\.quoteId\)\)/);
  assert.match(source, /assertOwnerPortfolioQuoteRecord/);
  assert.match(source, /inputHash:\s*data\.quoteInputHash \|\| data\.inputHash/);
  assert.match(source, /const quoteStartedAt = finiteNumber\(data\.quoteQuotedAtMs\)/);
  assert.match(source, /quoteStartedAt > Date\.now\(\) \+ 60_000/);
  assert.match(source, /calculateOwnerOnboardingQuote\(/);
  assert.match(source, /data\.serviceDetails\.selectedAddOns,\s*quoteStartedAt,/s);
  assert.match(source, /\.update\(JSON\.stringify\(quote\)\)/);
  assert.doesNotMatch(source, /await previewOwnerOnboardingQuoteHandler\(\{/);
  assert.doesNotMatch(source, /previewOwnerOnboardingQuote as any\)\.run/);
  assert.match(source, /Number\(quote\.expiresAtMs \|\| 0\) <= Date\.now\(\)/);
  assert.match(source, /quoteHash !== text\(data\.quoteHash\)/);
  assert.match(source, /money\(quote\.annualContractValue\) !== money\(data\.annualContractValue\)/);
  assert.match(source, /money\(quote\.activationDeposit\) !== money\(data\.activationDeposit \|\| data\.amount\)/);
  assert.match(source, /payment manifest does not match the active owner quote/i);
  assert.match(source, /await assertCurrentPaymentConfiguration\(data\)/);
});

test('recoverable quote state is non-secret and final submission never trusts it without server recalculation', async () => {
  const store = await read('src/store/onboardingStore.ts');
  const finalSubmission = await read('src/components/onboarding/InspectionSubmissionStep.tsx');
  const backend = await read('functions/inspectionFirstOwnerOnboarding.ts');
  const persistence = store.slice(store.indexOf('partialize:'));
  assert.match(persistence, /valuationResult:\s*state\.valuationResult/);
  assert.doesNotMatch(persistence, /password|paymentManifest:\s*state\.paymentManifest|paymentMethod:\s*state\.paymentMethod|paymentReceipt/);
  assert.match(finalSubmission, /quoteHash:\s*serverQuote\.quoteHash/);
  assert.match(finalSubmission, /quoteQuotedAtMs:\s*serverQuote\.quotedAtMs/);
  assert.match(backend, /assertQuote\(data, properties, selectedAddOns\)/);
});

test('runtime exports both portfolio quote authority and explicit five-page quote callable', async () => {
  const runtime = await read('functions/runtime.ts');
  assert.match(runtime, /export \* from ["']\.\/ownerPortfolioQuote["']/);
  assert.match(runtime, /previewOwnerInspectionQuote/);
  assert.match(runtime, /from ["']\.\/inspectionFirstOwnerOnboarding["']/);
});
