// N-35: dashboards must not fabricate metrics. An empty technician history is "No data yet",
// not "100% success"; owner AI intelligence must not invent property facts; the admin layout
// must not display a mock SOS count.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function loadTypeScriptModule(path) {
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: path,
  }).outputText;
  const module = { exports: {} };
  vm.runInContext(compiled, vm.createContext({ module, exports: module.exports, Number, String, Math, Array }), { filename: path });
  return module.exports;
}

const { computeTechnicianHistoryStats, formatPercentOrNoData } = loadTypeScriptModule('src/technician/pages/technicianHistoryStats.ts');

test('empty technician history reports no data instead of 100% success / 0% SLA', () => {
  const stats = computeTechnicianHistoryStats([]);
  assert.equal(stats.total, 0);
  assert.equal(stats.success, null);
  assert.equal(stats.slaCompliance, null);
  assert.equal(formatPercentOrNoData(stats.success), 'No data yet');
  assert.equal(formatPercentOrNoData(stats.slaCompliance), 'No data yet');
});

test('technician history metrics are computed from real jobs only', () => {
  const stats = computeTechnicianHistoryStats([
    { status: 'CLOSED', rating: 4, slaBreached: false },
    { status: 'CLOSED', qualityScore: 5, slaStatus: 'AT_RISK' },
    { status: 'completed' },
    { status: 'disputed', slaBreached: true },
  ]);
  assert.equal(stats.total, 4);
  assert.equal(stats.success, 50);
  assert.equal(stats.avgRating, 4.5);
  assert.equal(stats.slaCompliance, 33);
  assert.equal(formatPercentOrNoData(stats.success), '50%');
});

test('jobs without any SLA evidence do not render a fabricated SLA percentage', () => {
  const stats = computeTechnicianHistoryStats([{ status: 'CLOSED' }, { status: 'completed' }]);
  assert.equal(stats.success, 50);
  assert.equal(stats.slaCompliance, null);
});

test('TechnicianHistoryPage renders through the truthful helper', () => {
  const page = readFileSync('src/technician/pages/TechnicianHistoryPage.tsx', 'utf8');
  assert.match(page, /computeTechnicianHistoryStats\(docs\)/);
  assert.match(page, /formatPercentOrNoData\(stats\.success\)/);
  assert.match(page, /formatPercentOrNoData\(stats\.slaCompliance\)/);
  assert.doesNotMatch(page, /:\s*100,/);
});

test('owner AI intelligence does not invent property size, grade, type or emirate', () => {
  const page = readFileSync('src/owner/pages/OwnerAIIntelligencePage.tsx', 'utf8');
  assert.doesNotMatch(page, /\|\|\s*1200/);
  assert.doesNotMatch(page, /grade\s*\|\|\s*'B'/);
  assert.doesNotMatch(page, /\|\|\s*'APARTMENT'/);
  assert.doesNotMatch(page, /\|\|\s*'Abu Dhabi'/);
});

test('admin layout shows no mock SOS count', () => {
  const layout = readFileSync('apps/admin-panel/src/layout/AdminLayout.tsx', 'utf8');
  assert.doesNotMatch(layout, /useState\(3\)/);
  assert.doesNotMatch(layout, /Mock SOS count/i);
});
