import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const onboardingStoreSource = readFileSync('src/store/onboardingStore.ts', 'utf8');
const secureRegistrationSource = readFileSync('functions/secureOwnerRegistrationRequest.ts', 'utf8');
let server;
let tempDir;

test.before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'bin-onboarding-security-'));
  const outfile = join(tempDir, 'owner-onboarding-quote.mjs');
  await build({
    entryPoints: ['functions/ownerOnboardingQuote.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'silent',
  });
  server = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
});

test.after(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

test('onboarding session identifiers never fall back to predictable Math.random entropy', () => {
  assert.doesNotMatch(onboardingStoreSource, /\bMath\.random\s*\(/, 'onboarding IDs must never use Math.random');
  assert.match(onboardingStoreSource, /globalThis\.crypto/, 'onboarding IDs must use the Web Crypto authority');
  assert.match(onboardingStoreSource, /getRandomValues/, 'a cryptographically secure fallback must exist when randomUUID is unavailable');
  assert.match(onboardingStoreSource, /Secure randomness is required/, 'missing secure randomness must fail closed');
});

test('owner registration sanitizer preserves explicit bed counts', () => {
  assert.match(
    secureRegistrationSource,
    /beds:\s*finiteNumber\(property\.beds\)/,
    'direct/API bed counts must survive canonical owner-registration sanitization',
  );
  assert.match(
    secureRegistrationSource,
    /property\.units\s*\|\|\s*property\.beds\s*\|\|\s*property\.bedrooms/,
    'commercial totals must recognize explicit bed counts when unit count is absent',
  );
});

test('Labour Camp can be server-priced from an explicit beds field with no units alias', () => {
  const quote = server.calculateOwnerOnboardingQuote([{
    id: 'lab-camp-direct-beds',
    emirate: 'Dubai',
    zone: 'B',
    propertyType: 'Labour Camp',
    assetGrade: 'Standard',
    strategy: 'fm',
    beds: 75,
    units: 0,
    rooms: 0,
    bedrooms: 0,
    age: 4,
    floors: 1,
    lifts: 0,
    slaTier: 'standard',
    paymentPlan: 'annual',
  }], [], 1_800_000_000_000);

  assert.equal(quote.propertyQuotes.length, 1);
  assert.equal(quote.propertyQuotes[0].pricingClass, 'lab-camp');
  assert.equal(quote.propertyQuotes[0].pricingDriver, 'bed');
  assert.ok(Number.isFinite(quote.propertyQuotes[0].annualTotal));
  assert.ok(quote.propertyQuotes[0].annualTotal > 0);
});
