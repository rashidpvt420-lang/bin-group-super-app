// Founder decision 2026-10-14 14:01: the owner onboarding form collects age (required) and bedrooms
// (required for apartments), keeps blanks blank (never 0 / 1 defaults), and the server prices blanks on the safe side.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const FORM = 'apps/owner-app/src/components/onboarding/BuildingDataStep.tsx';
const STORE = 'apps/owner-app/src/store/onboardingStore.ts';
let dir; let server;
test.before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'bin-onboard-req-'));
  const outfile = join(dir, 'server.mjs');
  await build({ entryPoints: ['functions/ownerOnboardingQuote.ts'], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
  server = await import(pathToFileURL(outfile).href);
});
test.after(() => dir && rmSync(dir, { recursive: true, force: true }));

test('form requires age and apartment bedrooms, with English and Arabic labels, and keeps blanks blank', () => {
  const src = readFileSync(FORM, 'utf8');
  for (const s of ["L('ASSET AGE (YEARS) *', 'عمر العقار (سنوات) *')", "L('BEDROOMS *', 'غرف النوم *')", "L('LIFTS', 'المصاعد')", "L('VERTICAL FLOORS', 'عدد الطوابق')", 'building-age', 'building-bedrooms', 'building-lifts']) assert.ok(src.includes(s), s);
  assert.match(src, /const canProceed = [^;]*!ageMissing && !bedroomsMissing;/);
  assert.doesNotMatch(src, /age: parseInt\(e\.target\.value\) \|\| 0/);
  assert.doesNotMatch(src, /floors: parseInt\(e\.target\.value\) \|\| 1/);
  assert.match(src, /value=\{activeProperty\?\.age \?\? ''\}/);
});

test('store defaults leave age, bedrooms, floors and lifts blank instead of guessing low values', () => {
  const src = readFileSync(STORE, 'utf8');
  const defaults = src.slice(src.indexOf('const defaultProperty: PropertyData = {'));
  for (const field of ['floors', 'bedrooms', 'age', 'lifts']) assert.match(defaults, new RegExp(`\\n    ${field}: null,`), field);
});

test('server: blank age is rejected; blank bedrooms is priced on the safe side and warns the owner', () => {
  const property = { propertyType: 'Apartment', emirate: 'Dubai', area: 'Jumeirah Village Circle', units: 1, sqft: 1200, age: null, bedrooms: null, floors: null, lifts: null, strategy: 'fm' };
  assert.throws(() => server.calculateOwnerOnboardingQuote([property], [], Date.now()), /missing its building age/);
  const quote = server.calculateOwnerOnboardingQuote([{ ...property, age: 3 }], [], Date.now());
  const w = quote.propertyQuotes[0].warnings.join('|');
  assert.ok(w.includes('Bedrooms pending inspection confirmation'), w);
  const filled = server.calculateOwnerOnboardingQuote([{ ...property, age: 3, bedrooms: 2 }], [], Date.now());
  assert.equal(filled.portfolioAnnualTotal, 2156.25);
  assert.equal(filled.propertyQuotes[0].warnings.length, 0);
});
