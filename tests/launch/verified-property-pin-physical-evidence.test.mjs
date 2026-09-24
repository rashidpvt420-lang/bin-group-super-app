import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function loadPins() {
  const path = 'apps/admin-panel/src/lib/verifiedPropertyPin.ts';
  const source = readFileSync(path, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: path,
    reportDiagnostics: true,
  });
  const errors = (output.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(
    errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
    [],
    'verifiedPropertyPin.ts must transpile cleanly',
  );
  const module = { exports: {} };
  const context = vm.createContext({
    module,
    exports: module.exports,
    Date,
    Number,
    String,
    Boolean,
    Object,
    Array,
    Map,
    RegExp,
    JSON,
  });
  new vm.Script(output.outputText, { filename: path }).runInContext(context);
  return module.exports;
}

const pins = loadPins();
const plain = (value) => JSON.parse(JSON.stringify(value));

function physicalProperty(overrides = {}) {
  const verifiedAt = '2026-09-23T08:30:00.000Z';
  const hash = 'a'.repeat(64);
  return {
    id: 'property-physical-1',
    geo: {
      lat: 24.2075,
      lng: 55.7447,
      verified: true,
      dispatchReady: true,
      requiresGeoReview: false,
      verifiedBy: 'field-admin-uid',
      verifiedAt,
      source: 'physical_inspection',
      verificationVersion: 2,
      inspectionId: 'inspection-1',
      evidenceHash: hash,
      evidenceGeneration: '1777000111222',
    },
    geoVerification: {
      state: 'VERIFIED',
      source: 'PHYSICAL_INSPECTION_EVIDENCE',
      verifiedBy: 'field-admin-uid',
      verifiedAt,
      verificationVersion: 2,
      inspectionId: 'inspection-1',
      evidenceHash: hash,
      evidenceGeneration: '1777000111222',
    },
    ...overrides,
  };
}

test('Admin map accepts a canonical physical-inspection pin without changing the consumer result shape', () => {
  assert.deepEqual(plain(pins.resolveVerifiedPropertyPin(physicalProperty())), {
    point: { lat: 24.2075, lng: 55.7447 },
    propertyId: 'property-physical-1',
    verifiedBy: 'field-admin-uid',
    verifiedAtMs: Date.parse('2026-09-23T08:30:00.000Z'),
    source: 'physical_inspection',
    verificationVersion: 2,
  });
});

test('physical-inspection pin fails closed when immutable evidence binding is missing or mismatched', () => {
  const base = physicalProperty();
  const badCases = [
    { geoVerification: { ...base.geoVerification, evidenceHash: 'not-a-sha256' } },
    { geoVerification: { ...base.geoVerification, evidenceGeneration: '' } },
    { geoVerification: { ...base.geoVerification, inspectionId: 'inspection-other' } },
    { geo: { ...base.geo, evidenceHash: 'b'.repeat(64) } },
    { geo: { ...base.geo, evidenceGeneration: 'different-generation' } },
    { geo: { ...base.geo, verificationVersion: 1 } },
    { geoVerification: { ...base.geoVerification, source: 'FOUNDER_MFA_REVIEW' } },
    { geo: { ...base.geo, source: 'admin_manual' } },
  ];
  for (const mutation of badCases) {
    assert.equal(pins.resolveVerifiedPropertyPin({ ...base, ...mutation }), null);
  }
});
