import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('design quotes come from the BIN price list, are labelled estimates, and brokers get the studio', async () => {
  const fn = await readFile('functions/aiDesignStudio.ts', 'utf8');
  assert.match(fn, /calculateServerQuote\(scope, await loadDesignPriceList\(\)\)/);
  assert.match(fn, /isEstimate: true/);
  assert.match(fn, /"broker"/);
  const page = await readFile('src/pages/DesignStudioPage.tsx', 'utf8');
  assert.match(page, /design-estimate-label/);
  assert.match(await readFile('src/broker/BrokerApp.tsx', 'utf8'), /path="\/design-studio" element=\{<DesignStudioPage \/>\}/);
  const roleNav = await readFile('src/components/ui/roleNav.ts', 'utf8');
  assert.ok((roleNav.split('  broker: [')[2] || '').includes("path: '/broker/design-studio'"), 'broker home reaches the studio from the FAB menu');
  const pl = await readFile('functions/designPriceList.ts', 'utf8');
  assert.doesNotMatch(pl, /supplier(Price|Rate)/i);
  assert.match(pl, /mobilizationPercent: 15/);
  assert.ok(pl.includes('await requirePrivilegedMfaSession(request.auth);'));
});
