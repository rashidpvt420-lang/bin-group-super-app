import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('occupancy writes are gated by system_config/vacancy.autoVacateEnabled (default off)', async () => {
  const s = await readFile('functions/unitVacancy.ts', 'utf8');
  assert.match(s, /cfg\?\.autoVacateEnabled === true/);
  assert.match(s, /if \(!unitId \|\| !\(await autoVacateEnabled\(\)\)\) return false;/);
  assert.match(s, /if \(enabled\) \{\n\s+await db\.collection\("units"\)/);
  assert.match(await readFile('functions/runtimeAll.ts', 'utf8'), /ownerPrepareUnitListing \} from '\.\/unitVacancy'/);
});

test('listing prefill uses real tickets, and the Units page offers one-tap listing for vacant units', async () => {
  const page = await readFile('src/owner/pages/HomeDiscoveryInventoryPage.tsx', 'utf8');
  assert.match(page, /ownerPrepareUnitListing/);
  assert.match(page, /maintenanceHistorySource: maintenanceSummary \? 'MAINTENANCE_TICKETS' : null/);
  const units = await readFile('src/owner/pages/OwnerUnitRegistryPage.tsx', 'utf8');
  assert.match(units, /\/owner\/find-room-rent\?unitId=/);
});
