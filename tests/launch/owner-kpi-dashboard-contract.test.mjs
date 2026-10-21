import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('owner dashboard shows server KPI tiles first and surfaces failed sources instead of silent zeros', async () => {
  const page = await readFile('src/owner/pages/OwnerSimpleDashboardPage.tsx', 'utf8');
  // Home placement of <OwnerKpiTiles> is asserted by owner-tenant-home-wiring.test.mjs (redesigned home).
  assert.match(page, /owner-command-counts-failed/);
  const hook = await readFile('src/owner/hooks/useOwnerCommandCounts.ts', 'utf8');
  assert.equal((hook.match(/failed\.add\('/g) || []).length, 3);
  const tiles = await readFile('src/owner/components/OwnerKpiTiles.tsx', 'utf8');
  assert.match(tiles, /Could not load/);
  assert.match(await readFile('functions/runtimeAll.ts', 'utf8'), /getOwnerKpis/);
});
