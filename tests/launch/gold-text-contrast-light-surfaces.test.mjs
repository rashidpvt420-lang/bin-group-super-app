import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(p, 'utf8');

test('onboarding chips use AA gold text (goldText) on the forced-white onboarding papers', async () => {
  const company = await read('src/components/onboarding/CompanyProfileStep.tsx');
  assert.doesNotMatch(company, /<Chip key=\{chip\}[^>]*color: binThemeTokens\.champagne/);
  assert.match(company, /<Chip key=\{chip\}[^>]*color: binThemeTokens\.goldText/);
  const terms = await read('src/components/onboarding/CommercialTermsStep.tsx');
  assert.doesNotMatch(terms, /alpha\(binThemeTokens\.gold, 0\.12\), color: binThemeTokens\.gold,/);
  const asset = await read('src/components/onboarding/AssetProfileStep.tsx');
  assert.doesNotMatch(asset, /variant="outlined" sx=\{\{ color: binThemeTokens\.gold,/);
});

test('company profile white sticky nav uses goldText for button labels', async () => {
  const s = await read('src/pages/public/CompanyProfilePage.tsx');
  const i = s.indexOf("position: 'sticky', top: 0");
  const nav = s.slice(i, s.indexOf('</Container></Box>', i));
  assert.doesNotMatch(nav, /sx=\{\{ color: gold, fontWeight: 950 \}\}/);
});
