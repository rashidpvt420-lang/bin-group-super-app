// Behavioural: the owner live quote card uses the shared pricing module, filters areas by emirate from the
// zone CSV, renders in English and Arabic, and its total equals the server onboarding quote.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const D = 'apps/owner-app/src/components/onboarding';
let dir; const m = {};
async function bundle(entry, name, alias) {
  const outfile = join(dir, `${name}.mjs`);
  await build({ entryPoints: [entry], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', alias, jsx: 'automatic', nodePaths: [resolve('node_modules')] });
  return import(pathToFileURL(outfile).href);
}
test.before(async () => {
  dir = mkdtempSync(join(resolve('.'), '.tmp-live-quote-'));
  const shim = join(dir, 'shared.ts');
  writeFileSync(shim, ["calculateUaeQuote2026", "uaePricingMatrix2026", "aedMoney"].map((f) => `export * from '${resolve('packages/shared/src/pricing', f)}';`).join('\n'));
  const alias = { '@bin/shared': shim };
  m.model = await bundle(`${D}/liveQuoteModel.ts`, 'model', alias);
  const entry = join(dir, 'render.tsx');
  writeFileSync(entry, `import React from 'react';\nimport { renderToString } from 'react-dom/server';\nimport Card from '${resolve(D, 'LiveQuoteCard.tsx')}';\nexport const render = (props) => renderToString(React.createElement(Card, props));\n`);
  const outfile = join(dir, 'render.cjs');
  await build({ entryPoints: [entry], outfile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', alias, jsx: 'automatic', nodePaths: [resolve('node_modules')] });
  m.card = createRequire(import.meta.url)(outfile);
  m.server = await bundle('functions/ownerOnboardingQuote.ts', 'server', {});
});
test.after(() => dir && rmSync(dir, { recursive: true, force: true }));

const S = (o) => ({ emirate: 'Dubai', area: 'Palm Jumeirah', propertyType: 'Villa', bedrooms: 1, scope: 'Standard', sqft: 3500, annualRent: 250000, age: 1, contractType: 'BOTH', ...o });

test('area dropdown is filtered by emirate from the zone CSV', () => {
  const dubai = m.model.areasForEmirate('Dubai').map((a) => a.area);
  assert.ok(dubai.includes('Palm Jumeirah') && dubai.includes('Hatta') && !dubai.includes('Al Jimi'));
  const ad = m.model.areasForEmirate('Abu Dhabi').map((a) => a.region);
  assert.ok(ad.includes('Al Ain') && ad.includes('Al Dhafra'));
  assert.ok(m.model.areasForEmirate('Sharjah').every((a) => a.region === 'Sharjah'));
});

test('card total, AMC and management equal the server quote for all three contract types', () => {
  const cases = [S({}), S({ emirate: 'Abu Dhabi', area: 'Al Jimi', annualRent: 90000 }), S({ propertyType: 'Apartment', sqft: 1200, annualRent: 90000, area: 'Jumeirah Village Circle' }),
    S({ emirate: 'Abu Dhabi', area: 'Madinat Zayed / Ruwais / Ghayathi / Liwa', age: 12 }), S({ emirate: 'Ras Al Khaimah', area: 'Al Ghail / Al Hamra Industrial', propertyType: 'Warehouse', sqft: 20000, annualRent: 300000 })];
  for (const c of cases) for (const contractType of ['FM_ONLY', 'PM_ONLY', 'BOTH']) {
    const st = { ...c, contractType };
    const card = m.model.computeLiveQuote(st);
    const server = m.server.calculateOwnerOnboardingQuote([m.model.toServerProperty(st)], [], Date.now());
    assert.equal(card.total, server.portfolioAnnualTotal, `${c.area} ${contractType}`);
    if (contractType === 'BOTH') assert.equal(Math.round((card.maintenance + card.management) * 100), Math.round(card.total * 100));
  }
});

test('explanation lines in English and Arabic', () => {
  const en = m.model.computeLiveQuote(S({}), 'en').lines;
  assert.ok(en.includes('Palm Jumeirah: Premium area ×1.20'), en.join('|'));
  const ar = m.model.computeLiveQuote(S({ emirate: 'Abu Dhabi', area: 'Al Jimi', annualRent: 50000 }), 'ar').lines;
  assert.ok(ar.some((l) => l.includes('الحد الأدنى لعقد الصيانة')) && ar.some((l) => l.includes('الحد الأدنى لرسوم الإدارة')), ar.join('|'));
});

test('UI renders three totals, inputs and RTL', () => {
  const html = m.card.render({});
  for (const s of ['owner-live-quote-card', 'Annual AMC', 'Management fee', 'Total contract', 'Emirate', 'Area', 'Contract type', 'AED 17,330']) assert.ok(html.includes(s), s);
  const rtl = m.card.render({ isRTL: true });
  assert.ok(rtl.includes('dir="rtl"') && rtl.includes('إجمالي العقد'));
  assert.ok(readFileSync(`${D}/BuildingDataStep.tsx`, 'utf8').includes('<LiveQuoteCard'));
  assert.doesNotMatch(readFileSync(`${D}/liveQuoteModel.ts`, 'utf8'), /\* *1\.15|\* *1\.2\b/, 'no client-side pricing math');
});

test('bedrooms input and zone-pending warning reach card and server identically', () => {
  for (const bedrooms of [0, 1, 2, 3, 4]) for (const contractType of ['FM_ONLY', 'BOTH']) {
    const st = S({ propertyType: 'Apartment', bedrooms, sqft: 1200, annualRent: 90000, area: 'Jumeirah Village Circle', contractType });
    assert.equal(m.model.computeLiveQuote(st).total, m.server.calculateOwnerOnboardingQuote([m.model.toServerProperty(st)], [], Date.now()).portfolioAnnualTotal);
  }
  const other = S({ emirate: 'Sharjah', area: m.model.OTHER_AREA, contractType: 'FM_ONLY' });
  const card = m.model.computeLiveQuote(other);
  const server = m.server.calculateOwnerOnboardingQuote([m.model.toServerProperty(other)], [], Date.now());
  assert.equal(card.total, server.portfolioAnnualTotal);
  assert.ok(card.warnings[0].startsWith('Zone pending admin confirmation'));
  assert.ok(server.propertyQuotes[0].warnings[0].startsWith('Zone pending admin confirmation'));
  assert.equal(m.server.calculateOwnerOnboardingQuote([m.model.toServerProperty(S({}))], [], Date.now()).propertyQuotes[0].warnings.length, 0);
  assert.ok(m.card.render({ initial: { emirate: 'Sharjah', area: m.model.OTHER_AREA } }).includes('live-quote-warning'));
  assert.ok(m.card.render({ initial: { propertyType: 'Apartment' } }).includes('live-quote-bedrooms'));
});

test('card rounds fils exactly like the server (half-fil cases)', () => {
  const body = (f) => readFileSync(f, 'utf8').split('\n').filter((l) => !l.startsWith('// Identical copy')).join('\n');
  assert.equal(body('packages/shared/src/pricing/aedMoney.ts'), body('functions/shared/aedMoney.ts'));
  for (const [emirate, area, age, contractType] of [['Dubai', 'Al Furjan / Jebel Ali First', 0, 'FM_ONLY'], ['Dubai', 'Hatta', 0, 'FM_ONLY'], ['Abu Dhabi', 'Madinat Zayed / Ruwais / Ghayathi / Liwa', 0, 'FM_ONLY']]) {
    const st = S({ emirate, area, age, contractType, propertyType: 'Apartment', bedrooms: 2, sqft: 1200 });
    assert.equal(m.model.computeLiveQuote(st).total, m.server.calculateOwnerOnboardingQuote([m.model.toServerProperty(st)], [], Date.now()).portfolioAnnualTotal, area);
  }
  const hatta = S({ area: 'Hatta', age: 20, annualRent: 40000 });
  assert.equal(m.model.computeLiveQuote(hatta).total, m.server.calculateOwnerOnboardingQuote([m.model.toServerProperty(hatta)], [], Date.now()).portfolioAnnualTotal);
});
