import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rootEnginePath = 'src/utils/calculateUaeQuote2026.ts';
const functionsEnginePath = 'functions/pricing/calculateUaeQuote2026.ts';
const sharedEnginePath = 'packages/shared/src/pricing/calculateUaeQuote2026.ts';

const rootEngine = readFileSync(rootEnginePath, 'utf8');
const functionsEngine = readFileSync(functionsEnginePath, 'utf8');
const sharedEngine = readFileSync(sharedEnginePath, 'utf8');

test('Majlis pricing is flat per facility and cannot be multiplied by generic room/unit counts', () => {
  const majlisGuard = rootEngine.indexOf('const isMajlisAsset = MAJLIS_ASSET_IDS.has(normalizedAssetClassId);');
  const majlisBranch = rootEngine.indexOf('if (isMajlisAsset) {', majlisGuard);
  const genericUnitBranch = rootEngine.indexOf("assetClass.pricingUnit === 'unit'", majlisBranch);

  assert.ok(majlisGuard >= 0, 'Majlis asset guard must exist in the quote engine');
  assert.ok(majlisBranch > majlisGuard, 'Majlis pricing branch must follow the asset guard');
  assert.ok(genericUnitBranch > majlisBranch, 'Majlis pricing must run before generic per-unit multiplication');
  assert.match(rootEngine, /Flat annual Majlis facility rate[\s\S]*room\/unit counts do not multiply the contract base\./);
  assert.match(rootEngine, /isMajlisAsset \? \{ \.\.\.safeInput, units: 1, offices: 0, shops: 0 \} : safeInput/);
});

test('browser, functions, and shared quote engines use the same Majlis pricing implementation', () => {
  assert.equal(functionsEngine, rootEngine, 'Cloud Functions pricing engine drifted from the browser engine');
  assert.equal(sharedEngine, rootEngine, 'Shared pricing engine drifted from the browser engine');
});
