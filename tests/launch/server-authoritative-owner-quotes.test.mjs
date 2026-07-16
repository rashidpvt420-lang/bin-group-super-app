// Combined candidate guard: expression-safe Firestore rules plus server-authoritative owner quotes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Functions pricing engine remains byte-identical to the canonical shared implementation', async () => {
  const [sharedEngine, functionEngine, sharedMatrix, functionMatrix] = await Promise.all([
    read('packages/shared/src/pricing/calculateUaeQuote2026.ts'),
    read('functions/pricing/calculateUaeQuote2026.ts'),
    read('packages/shared/src/pricing/uaePricingMatrix2026.ts'),
    read('functions/pricing/uaePricingMatrix2026.ts'),
  ]);
  assert.equal(functionEngine, sharedEngine, 'Functions pricing engine drifted from @bin/shared');
  assert.equal(functionMatrix, sharedMatrix, 'Functions pricing matrix drifted from @bin/shared');
});

test('owner quote issuance is App Check protected, owner bound, versioned, hashed and expiring', async () => {
  const source = await read('functions/ownerPortfolioQuote.ts');
  assert.match(source, /issueOwnerPortfolioQuote = onCall/);
  assert.match(source, /validateOwnerPortfolioQuote = onCall/);
  assert.match(source, /enforceAppCheck:\s*true/);
  assert.match(source, /roleOf\(request\.auth\) !== ["']owner["']/);
  assert.match(source, /email_verified !== true/);
  assert.match(source, /suspended === true/);
  assert.match(source, /QUOTE_SCHEMA_VERSION = ["']OWNER_PORTFOLIO_QUOTE_V1["']/);
  assert.match(source, /PRICING_ENGINE_VERSION/);
  assert.match(source, /QUOTE_TTL_MS = 30 \* 60 \* 1000/);
  assert.match(source, /inputHash = sha256\(inputEnvelope\)/);
  assert.match(source, /quoteHash = sha256\(quoteEnvelope\)/);
  assert.match(source, /owner_portfolio_quotes/);
  assert.match(source, /status: ["']ACTIVE["']/);
  assert.match(source, /expiresAtMs/);
});

test('owner quote validation rejects cross-owner, stale, altered and mismatched totals', async () => {
  const source = await read('functions/ownerPortfolioQuote.ts');
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

test('review issues and revalidates the server quote before contract progression', async () => {
  const source = await read('src/components/onboarding/ReviewBeforeSubmitStep.tsx');
  assert.match(source, /issueOwnerPortfolioQuote/);
  assert.match(source, /validateOwnerPortfolioQuote/);
  assert.match(source, /ownerPortfolioQuoteRequest/);
  assert.match(source, /serverQuoteRequestKey/);
  assert.match(source, /serverQuote\.expiresAtMs <= Date\.now\(\)/);
  assert.match(source, /portfolioAnnualTotal:\s*serverQuote\.portfolioAnnualTotal/);
  assert.match(source, /mobilisationDeposit:\s*serverQuote\.mobilisationDeposit/);
  assert.match(source, /disabled=\{quoteLoading \|\| validating \|\| quoteExpired \|\| Boolean\(quoteError\)\}/);
  assert.match(source, /setValuationResult/);
});

test('server quote state remains memory-only and is not added to persisted onboarding state', async () => {
  const store = await read('src/store/onboardingStore.ts');
  assert.match(store, /partialize:\s*\(state\) => \(\{\s*step:\s*state\.step,\s*intakeId:\s*state\.intakeId/s);
  assert.doesNotMatch(store, /partialize:[\s\S]{0,300}serverQuote/);
});

test('runtime exports the owner quote authority', async () => {
  const runtime = await read('functions/runtime.ts');
  assert.match(runtime, /export \* from ["']\.\/ownerPortfolioQuote["']/);
});
