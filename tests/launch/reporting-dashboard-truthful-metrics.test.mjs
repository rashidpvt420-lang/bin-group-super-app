// N-10 regression: the Owner/Admin Reporting Dashboard and its PDF export must only show
// figures derived from readable records. No hard-coded KPIs, trends, fallbacks or padding.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const page = fs.readFileSync('src/pages/ReportingDashboard.tsx', 'utf8');
const outDir = path.resolve('node_modules/.cache/reporting-dashboard-test');
fs.mkdirSync(outDir, { recursive: true });
const outfile = path.join(outDir, `stats-${process.pid}.cjs`);
await build({ entryPoints: ['src/pages/reportingDashboardStats.ts'], bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent' });
const { computeReportingStats, formatResolutionTime, formatOccupancy } = createRequire(import.meta.url)(outfile);

const NOW = new Date('2026-09-15T12:00:00Z');
const at = (iso) => ({ toDate: () => new Date(iso) });

test('page source contains no fabricated KPI values', () => {
  for (const [pattern, why] of [
    [/42\.5 mins/, 'hard-coded response time'],
    [/\|\|\s*85\b/, 'occupancy fallback 85%'],
    [/occupiedCount \+ 5/, 'unit count padding'],
    [/uptime:\s*100/, 'hard-coded regional uptime'],
    [/Response Uptime: 100%/, 'hard-coded response uptime'],
    [/renewalRisk:\s*\d/, 'hard-coded renewal risk'],
    [/count:\s*12, trend: '\+15%'/, 'hard-coded fault trend'],
    [/\[4, 2, 5, 1, 0, 3\]/, 'hard-coded emergency trend'],
    [/'OPTIMAL'|'VERIFIED'|'STABLE'|'MITIGATED'/, 'hard-coded PDF status verdicts'],
    [/certified institutional export/, 'unsupported certification claim'],
  ]) {
    assert.doesNotMatch(page, pattern, why);
  }
  assert.match(page, /computeReportingStats\(/);
});

test('empty portfolio yields "Not available" instead of invented values', () => {
  const stats = computeReportingStats({ properties: [], tickets: [], contracts: [], units: [], selectedEmirate: 'ALL', now: NOW });
  assert.equal(stats.avgResolutionMinutes, null);
  assert.equal(formatResolutionTime(stats.avgResolutionMinutes), 'Not available');
  assert.equal(stats.occupancyPercent, null);
  assert.equal(formatOccupancy(stats.occupancyPercent), 'Not available');
  assert.equal(stats.totalUnits, 0);
  assert.equal(stats.totalSettled, 0);
  assert.deepEqual(stats.faultCategories, []);
  assert.equal(stats.emergencyByMonth.length, 6);
  assert.ok(stats.emergencyByMonth.every((m) => m.count === 0));
  assert.equal('renewalRisk' in stats, false);
  assert.equal(stats.regionalStats.some((r) => 'uptime' in r), false);
});

test('completed tickets without timestamps do not produce a response time', () => {
  const stats = computeReportingStats({
    properties: [], units: [], contracts: [], selectedEmirate: 'ALL', now: NOW,
    tickets: [{ id: 't1', status: 'COMPLETED' }],
  });
  assert.equal(stats.avgResolutionMinutes, null, 'previously showed "42.5 mins"');
});

test('metrics are computed from real records and scoped by emirate', () => {
  const properties = [{ id: 'p1', emirate: 'dubai' }, { id: 'p2', emirate: 'Sharjah' }];
  const tickets = [
    { id: 't1', propertyId: 'p1', status: 'COMPLETED', category: 'HVAC', priority: 'emergency', createdAt: at('2026-09-01T08:00:00Z'), completedAt: at('2026-09-01T09:00:00Z') },
    { id: 't2', propertyId: 'p1', status: 'COMPLETED', category: 'HVAC', createdAt: at('2026-08-01T08:00:00Z'), completedAt: at('2026-08-01T11:00:00Z') },
    { id: 't3', propertyId: 'p2', status: 'OPEN', category: 'Plumbing', priority: 'EMERGENCY', createdAt: at('2026-07-10T08:00:00Z') },
    { id: 't4', propertyId: 'p2', status: 'OPEN', createdAt: at('2025-01-10T08:00:00Z'), priority: 'EMERGENCY' },
  ];
  const units = [
    { id: 'u1', propertyId: 'p1', tenantId: 'x' },
    { id: 'u2', propertyId: 'p1' },
    { id: 'u3', propertyId: 'p2', tenantId: 'y' },
  ];
  const contracts = [{ propertyId: 'p1', amountReceived: 1000 }, { propertyId: 'p2', amountReceived: 250 }];

  const all = computeReportingStats({ properties, tickets, contracts, units, selectedEmirate: 'ALL', now: NOW });
  assert.equal(all.avgResolutionMinutes, 120);
  assert.equal(formatResolutionTime(all.avgResolutionMinutes), '2.0 hrs');
  assert.equal(all.occupancyPercent, 67);
  assert.equal(all.totalUnits, 3, 'no padding of unit count');
  assert.equal(all.totalSettled, 1250);
  assert.equal(all.activeTickets, 2);
  assert.deepEqual(all.faultCategories, [{ category: 'HVAC', count: 2 }, { category: 'Plumbing', count: 1 }]);
  assert.deepEqual(all.emergencyByMonth.map((m) => m.count), [0, 0, 0, 1, 0, 1], 'Apr..Sep 2026 (Jul + Sep); 2025 ticket excluded');
  assert.deepEqual(all.regionalStats, [{ emirate: 'DUBAI', count: 1 }, { emirate: 'SHARJAH', count: 1 }]);

  const dubai = computeReportingStats({ properties, tickets, contracts, units, selectedEmirate: 'DUBAI', now: NOW });
  assert.equal(dubai.occupancyPercent, 50);
  assert.equal(dubai.totalSettled, 1000);
  assert.equal(dubai.activeTickets, 0);
  assert.deepEqual(dubai.faultCategories, [{ category: 'HVAC', count: 2 }]);

  const unitsOnlyVacant = computeReportingStats({ properties, tickets: [], contracts: [], units: [{ id: 'u', propertyId: 'p1' }], selectedEmirate: 'ALL', now: NOW });
  assert.equal(unitsOnlyVacant.occupancyPercent, 0, '0% must not fall back to 85%');
});
