// N-29: the owner Building Performance Index must not be computed from invented defaults
// (age 5, Villa, DX, maintenanceLoad 50). Missing facts are surfaced instead.
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
  vm.runInContext(compiled, vm.createContext({ module, exports: module.exports, Number, String, Math, Array, Date }), { filename: path });
  return module.exports;
}

const { buildBuildingHealthInput } = loadTypeScriptModule('src/utils/buildingHealthInputs.ts');

test('a property without recorded age or type is not scored', () => {
  const result = buildBuildingHealthInput({ id: 'p1' }, [], 2026);
  assert.equal(result.ok, false);
  assert.deepEqual([...result.missing], ['building age / year built', 'property type']);
  assert.equal(buildBuildingHealthInput({ age: 7 }, [], 2026).ok, false);
  assert.equal(buildBuildingHealthInput({ propertyType: 'Villa' }, [], 2026).ok, false);
});

test('recorded facts are used as-is; HVAC is never assumed', () => {
  const result = buildBuildingHealthInput({ yearBuilt: 2016, propertyType: 'Apartment', floors: 12, lifts: 2 }, [
    { status: 'CLOSED' }, { status: 'open', priority: 'EMERGENCY' }, { status: 'IN_PROGRESS' },
  ], 2026);
  assert.equal(result.ok, true);
  assert.equal(result.input.age, 10);
  assert.equal(result.input.propertyType, 'Apartment');
  assert.equal(result.input.hvacType, undefined, 'no DX default');
  assert.equal(result.input.floors, 12);
  assert.equal(result.input.liftCount, 2);
  assert.equal(result.input.unresolvedTickets, 2);
  assert.equal(result.input.emergencyIncidents, 1);
  assert.equal(result.input.maintenanceLoad, 0, 'no invented maintenance load');
  assert.equal(buildBuildingHealthInput({ age: 3, propertyType: 'Villa', hvacType: 'district cooling' }, [], 2026).input.hvacType, 'District');
});

test('HealthScorePage uses the recorded-input builder and shows missing facts', () => {
  const page = readFileSync('src/pages/HealthScorePage.tsx', 'utf8');
  assert.match(page, /buildBuildingHealthInput\(p, tickets\)/);
  assert.match(page, /missingInputs\.length > 0/);
  assert.doesNotMatch(page, /p\.age \|\| 5/);
  assert.doesNotMatch(page, /\|\| 'Villa'/);
  assert.doesNotMatch(page, /\|\| 'DX'/);
  assert.doesNotMatch(page, /maintenanceLoad: 50/);
});
