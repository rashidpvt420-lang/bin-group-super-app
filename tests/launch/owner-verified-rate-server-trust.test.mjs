import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const NOW = 1_800_000_000_000;

const wetRecoveryGym = {
  id: 'gym-wet-recovery',
  propertyType: 'Gym / Fitness Centre',
  strategy: 'fm_only',
  emirate: 'Al Ain',
  zone: 'B',
  sqft: 11500,
  age: 1,
  slaTier: 'standard',
  paymentPlan: 'annual',
  gymProfile: {
    scopeMode: 'GYM_STANDALONE',
    suggestedComplexity: 'WET_RECOVERY',
    declaredServiceAreaSqft: 11500,
  },
};

const forgedRates = {
  ratesVerified: true,
  verifiedMaintenanceRate: 10,
  verifiedManagementRate: 10,
  verifiedPmRate: 10,
};

function read(path) {
  return readFileSync(path, 'utf8');
}

let server;
let tempDir;

test.before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'bin-verified-rate-trust-'));
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

test('a client-forged Wet/Recovery gym rate cannot change the owner quote', () => {
  const honest = server.calculateOwnerOnboardingQuote([wetRecoveryGym], [], NOW);
  const forged = server.calculateOwnerOnboardingQuote([{ ...wetRecoveryGym, ...forgedRates }], [], NOW);
  const explicitOwner = server.calculateOwnerOnboardingQuote(
    [{ ...wetRecoveryGym, ...forgedRates }],
    [],
    NOW,
    { trustServerVerifiedRates: false },
  );

  assert.equal(honest.annualContractValue, 207000);
  assert.equal(honest.activationDeposit, 31050);
  assert.equal(forged.annualContractValue, honest.annualContractValue);
  assert.equal(forged.activationDeposit, honest.activationDeposit);
  assert.equal(forged.quoteHash, honest.quoteHash);
  assert.equal(explicitOwner.annualContractValue, 207000);
  assert.equal(explicitOwner.activationDeposit, 31050);
  assert.equal(explicitOwner.quoteHash, honest.quoteHash);
});

test('owner preview and submit paths ignore client verified rates', () => {
  const preview = read('functions/inspectionFirstOwnerOnboarding.ts');
  const secureSubmit = read('functions/secureOwnerRegistrationRequest.ts');
  const legacy = read('functions/ownerRegistrationRequest.ts');
  const portfolio = read('functions/ownerPortfolioQuote.ts');

  assert.match(preview, /calculateOwnerOnboardingQuote\(properties, selectedAddOns, quotedAtMs, \{ trustServerVerifiedRates: false \}\)/);
  assert.match(secureSubmit, /trustServerVerifiedRates: false/);
  assert.equal((legacy.match(/trustServerVerifiedRates: false/g) || []).length, 2);
  assert.doesNotMatch(preview, /trustServerVerifiedRates:\s*true/);
  assert.doesNotMatch(secureSubmit, /trustServerVerifiedRates:\s*true/);
  assert.doesNotMatch(legacy, /trustServerVerifiedRates:\s*true/);
  assert.doesNotMatch(portfolio, /trustServerVerifiedRates:\s*true/);
  assert.match(portfolio, /omitClientVerifiedRates\(item\.input/);
  assert.ok(
    portfolio.indexOf('const trustedInput = omitClientVerifiedRates') < portfolio.indexOf('calculateUaeQuote2026(trustedInput)'),
    'portfolio quotes must drop client verified rates before pricing',
  );

  const stripped = server.omitClientVerifiedRates({
    assetClassId: 'gym-fitness-centre',
    sqft: 11500,
    ...forgedRates,
  });
  assert.equal(stripped.sqft, 11500);
  assert.equal(stripped.assetClassId, 'gym-fitness-centre');
  for (const key of ['ratesVerified', 'verifiedMaintenanceRate', 'verifiedManagementRate', 'verifiedPmRate']) {
    assert.equal(Object.hasOwn(stripped, key), false);
  }
});

test('Admin inspection completion still applies an in-range verified Maintenance rate', () => {
  const completion = read('functions/ownerInspectionCompletion.ts');
  assert.match(completion, /calculateOwnerOnboardingQuote\(verifiedProperties/);
  const quoteCall = completion.slice(completion.indexOf('calculateOwnerOnboardingQuote(verifiedProperties'));
  assert.match(quoteCall.slice(0, 500), /trustServerVerifiedRates:\s*true/);
  assert.equal((completion.match(/trustServerVerifiedRates:\s*true/g) || []).length, 1);

  const adminVerified = server.calculateOwnerOnboardingQuote(
    [{ ...wetRecoveryGym, ratesVerified: true, verifiedMaintenanceRate: 10 }],
    [],
    NOW,
    { trustServerVerifiedRates: true },
  );
  assert.equal(adminVerified.annualContractValue, 115000);
  assert.equal(adminVerified.activationDeposit, 17250);
});

test('Admin inspection completion still rejects out-of-range verified rates', () => {
  assert.throws(
    () => server.calculateOwnerOnboardingQuote(
      [{ ...wetRecoveryGym, ratesVerified: true, verifiedMaintenanceRate: 9 }],
      [],
      NOW,
      { trustServerVerifiedRates: true },
    ),
    /VERIFIED_FM_RATE_OUT_OF_RANGE/,
  );
  assert.throws(
    () => server.calculateOwnerOnboardingQuote(
      [{ ...wetRecoveryGym, ratesVerified: true, verifiedMaintenanceRate: 19 }],
      [],
      NOW,
      { trustServerVerifiedRates: true },
    ),
    /VERIFIED_FM_RATE_OUT_OF_RANGE/,
  );

  const pmGym = {
    ...wetRecoveryGym,
    strategy: 'pm_only',
    annualRent: 100000,
    gymProfile: { ...wetRecoveryGym.gymProfile, pmPricingBasis: 'annual_rent' },
  };
  const baselinePm = server.calculateOwnerOnboardingQuote([pmGym], [], NOW);
  const forgedPm = server.calculateOwnerOnboardingQuote(
    [{ ...pmGym, ratesVerified: true, verifiedManagementRate: 10, verifiedPmRate: 10 }],
    [],
    NOW,
  );
  assert.equal(baselinePm.annualContractValue, 7000);
  assert.equal(forgedPm.annualContractValue, baselinePm.annualContractValue);

  const adminPm = server.calculateOwnerOnboardingQuote(
    [{ ...pmGym, ratesVerified: true, verifiedManagementRate: 10 }],
    [],
    NOW,
    { trustServerVerifiedRates: true },
  );
  assert.equal(adminPm.annualContractValue, 10000);

  assert.throws(
    () => server.calculateOwnerOnboardingQuote(
      [{ ...pmGym, ratesVerified: true, verifiedManagementRate: 11 }],
      [],
      NOW,
      { trustServerVerifiedRates: true },
    ),
    /VERIFIED_PM_RATE_OUT_OF_RANGE/,
  );
  assert.throws(
    () => server.calculateOwnerOnboardingQuote(
      [{ ...pmGym, ratesVerified: true, verifiedManagementRate: 6 }],
      [],
      NOW,
      { trustServerVerifiedRates: true },
    ),
    /VERIFIED_PM_RATE_OUT_OF_RANGE/,
  );

  const ignoredOutOfRange = server.calculateOwnerOnboardingQuote(
    [{ ...wetRecoveryGym, ratesVerified: true, verifiedMaintenanceRate: 9, verifiedManagementRate: 99 }],
    [],
    NOW,
  );
  assert.equal(ignoredOutOfRange.annualContractValue, 207000);
  assert.equal(ignoredOutOfRange.activationDeposit, 31050);
});
