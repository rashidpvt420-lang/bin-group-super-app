// F-8: Owner-entered pins are tagged owner_manual (never the Founder-MFA "admin_manual" source)
// and the emirate centroid is never pre-filled or accepted as the property's coordinates.
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
  vm.runInContext(compiled, vm.createContext({ module, exports: module.exports, Number, Math }), { filename: path });
  return module.exports;
}

const rules = loadTypeScriptModule('src/components/onboarding/ownerLocationRules.ts');
const step = readFileSync('src/components/onboarding/PropertyLocationStep.tsx', 'utf8');
const emirates = [...step.matchAll(/lat: ([0-9.]+), lng: ([0-9.]+) \}/g)].map((m) => ({ lat: Number(m[1]), lng: Number(m[2]) }));

test('every emirate centroid is detected; a real building pin is not', () => {
  assert.equal(emirates.length, 7);
  for (const centroid of emirates) assert.equal(rules.isEmirateCentroid(centroid.lat, centroid.lng, emirates), true);
  assert.equal(rules.isEmirateCentroid(25.2048 + 0.00001, 55.2708, emirates), true, 'within ~5 m of a centroid is still the centroid');
  assert.equal(rules.isEmirateCentroid(25.0693, 55.1413, emirates), false);
  assert.equal(rules.isEmirateCentroid(Number.NaN, 55.1, emirates), false);
});

test('the location step never produces the admin_manual source', () => {
  assert.equal(rules.OWNER_MANUAL_GEO_SOURCE, 'owner_manual');
  assert.doesNotMatch(step, /'admin_manual'/);
  assert.match(step, /source: OWNER_MANUAL_GEO_SOURCE,/);
});

test('the emirate centroid is not pre-filled and cannot be submitted', () => {
  assert.doesNotMatch(step, /setManualLat\(String\((emirate|fallbackEmirate)\.lat\)\)/);
  assert.doesNotMatch(step, /useState\(String\([^)]*fallbackEmirate\.lat\)\)/);
  assert.match(step, /if \(isEmirateCentroid\(lat, lng, EMIRATES_LIST\)\) return setLocationError\(/);
  assert.match(step, /const canProceed = Boolean\([^\n]*!isEmirateCentroid\(/);
});
