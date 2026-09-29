import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('canonical ON_THE_WAY missions stay visible to technician navigation', () => {
  const constants = read('src/utils/ticketConstants.ts');
  const map = read('src/technician/pages/TechnicianMapPage.tsx');
  const jobs = read('src/technician/pages/TechnicianJobsPage.tsx');
  const dashboard = read('src/technician/pages/TechnicianDashboardPage.tsx');

  assert.match(constants, /'ON_THE_WAY'/);
  assert.match(constants, /ALL_TECHNICIAN_ACTIVE_STATUSES/);
  assert.match(map, /ALL_TECHNICIAN_ACTIVE_STATUSES/);
  assert.match(map, /onSnapshotSplitIn\(/);
  assert.match(map, /\['on_the_way', 'EN_ROUTE', 'ON_THE_WAY'\]/);
  assert.match(jobs, /\['on_the_way', 'EN_ROUTE', 'ON_THE_WAY'\]/);
  assert.match(jobs, /ON_THE_WAY: binThemeTokens\.gold/);
  assert.match(dashboard, /'ON_THE_WAY'/);
  assert.doesNotMatch(map, /where\('status', 'in', ACTIVE_STATUSES\)/);
});
