import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('owner dashboard shows server KPI tiles first and surfaces failed sources instead of silent zeros', async () => {
  const page = await readFile('src/owner/pages/OwnerSimpleDashboardPage.tsx', 'utf8');
  assert.ok(page.indexOf('<OwnerKpiTiles') > 0 && page.indexOf('<OwnerKpiTiles') < page.indexOf('owner-needs-you-today'), 'KPI tiles come first, before the to-do list');
  assert.ok(!page.includes('owner.simple.contractFirst'), 'no marketing banner (R4)');
  assert.match(page, /owner-command-counts-failed/);
  const hook = await readFile('src/owner/hooks/useOwnerCommandCounts.ts', 'utf8');
  assert.equal((hook.match(/failed\.add\('/g) || []).length, 3);
  const tiles = await readFile('src/owner/components/OwnerKpiTiles.tsx', 'utf8');
  assert.match(tiles, /Could not load/);
  assert.match(tiles, /<StatGrid>/, 'tiles use the R4 stat-tile look');
  assert.match(tiles, /httpsCallable\(functions, 'getOwnerKpis'\)/);
  assert.match(await readFile('functions/runtimeAll.ts', 'utf8'), /getOwnerKpis/);
});
