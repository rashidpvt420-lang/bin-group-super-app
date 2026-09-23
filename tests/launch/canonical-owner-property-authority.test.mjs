import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

async function loadPropertyIdentityModule() {
  const source = await read('functions/propertyIdentity.ts');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: 'propertyIdentity.ts',
    reportDiagnostics: true,
  });
  const errors = (output.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(
    errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
    [],
    'propertyIdentity.ts must transpile cleanly',
  );

  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier === 'crypto' || specifier === 'node:crypto') return crypto;
    throw new Error(`Unexpected propertyIdentity dependency: ${specifier}`);
  };
  const execute = new Function('require', 'module', 'exports', output.outputText);
  execute(localRequire, module, module.exports);
  return module.exports;
}

function byKind(identities, kind) {
  const identity = identities.find((entry) => entry.kind === kind);
  assert.ok(identity, `Expected ${kind} identity`);
  return identity;
}

test('canonical property identity normalizes spelling/case and preserves legitimate separate units', async () => {
  const { buildPropertyIdentities } = await loadPropertyIdentityModule();
  const base = {
    titleDeedNumber: 'TD-001',
    unitNumber: '1204',
    propertyType: 'Apartment',
    emirate: 'Dubai',
    area: 'Downtown Dubai',
    address: 'Tower One, Sheikh Mohammed Blvd',
    geo: {
      lat: 25.204849,
      lng: 55.270783,
      placeId: 'ChIJ-BIN-GROUP-01',
      address: 'Tower One, Sheikh Mohammed Blvd',
      emirate: 'Dubai',
      area: 'Downtown Dubai',
    },
  };
  const spellingVariant = {
    ...base,
    titleDeedNumber: ' td 001 ',
    unitNumber: ' 1204 ',
    address: ' tower one   sheikh mohammed blvd ',
    geo: {
      ...base.geo,
      placeId: 'chij bin group 01',
      address: 'tower one — sheikh mohammed blvd',
    },
  };
  const renamedSameCoordinates = {
    ...base,
    titleDeedNumber: undefined,
    propertyName: 'Completely Changed Marketing Name',
  };
  const separateUnit = {
    ...base,
    titleDeedNumber: 'TD-002',
    unitNumber: '1205',
  };

  const baseIds = buildPropertyIdentities(base);
  const variantIds = buildPropertyIdentities(spellingVariant);
  const renamedIds = buildPropertyIdentities(renamedSameCoordinates);
  const separateIds = buildPropertyIdentities(separateUnit);

  assert.equal(byKind(baseIds, 'TITLE_DEED').hash, byKind(variantIds, 'TITLE_DEED').hash, 'title-deed punctuation/case must normalize');
  assert.equal(byKind(baseIds, 'ADDRESS_UNIT').hash, byKind(variantIds, 'ADDRESS_UNIT').hash, 'address case/spacing/punctuation must normalize');
  assert.equal(byKind(baseIds, 'GEO_UNIT').hash, byKind(renamedIds, 'GEO_UNIT').hash, 'changing a marketing name at the same unit/GPS must not evade duplicate detection');
  assert.notEqual(byKind(baseIds, 'ADDRESS_UNIT').hash, byKind(separateIds, 'ADDRESS_UNIT').hash, 'two legitimate units in one building must remain distinct');
  assert.notEqual(byKind(baseIds, 'GEO_UNIT').hash, byKind(separateIds, 'GEO_UNIT').hash, 'GPS identity must include the unit when present');
});

test('same title-deed reference remains a duplicate even when address and coordinates change', async () => {
  const { buildPropertyIdentities } = await loadPropertyIdentityModule();
  const first = buildPropertyIdentities({
    titleDeedReference: 'DLD / 998877',
    unitNumber: 'A-01',
    address: 'First Address',
    geo: { lat: 25.20, lng: 55.27, address: 'First Address', emirate: 'Dubai', area: 'Downtown' },
  });
  const second = buildPropertyIdentities({
    titleDeedReference: 'dld-998877',
    unitNumber: 'Z-99',
    address: 'Different Address',
    geo: { lat: 25.40, lng: 55.50, address: 'Different Address', emirate: 'Dubai', area: 'Marina' },
  });
  assert.equal(byKind(first, 'TITLE_DEED').hash, byKind(second, 'TITLE_DEED').hash);
});

test('canonical runtime wraps submission, completion and property review instead of exporting competing writers', async () => {
  const [runtime, submission, completion, review, payment] = await Promise.all([
    read('functions/runtime.ts'),
    read('functions/canonicalOwnerSubmission.ts'),
    read('functions/canonicalOwnerInspectionCompletion.ts'),
    read('functions/canonicalAdminPropertyReview.ts'),
    read('functions/securePaymentApproval.ts'),
  ]);

  assert.match(runtime, /submitOwnerInspectionFirstOnboarding \} from "\.\/canonicalOwnerSubmission"/);
  assert.match(runtime, /adminCompleteOwnerPortfolioInspections \} from "\.\/canonicalOwnerInspectionCompletion"/);
  assert.match(runtime, /adminReviewOwnerProperty \} from "\.\/canonicalAdminPropertyReview"/);
  assert.doesNotMatch(runtime, /export \* from "\.\/ownerInspectionCompletion"/);
  assert.doesNotMatch(runtime, /export \* from "\.\/adminPropertyReview"/);

  assert.match(submission, /collection\("property_identity_registry"\)/);
  assert.match(submission, /db\.runTransaction/);
  assert.match(submission, /assertNoExistingCanonicalProperty/);
  assert.match(submission, /collection\("properties"\)/);
  assert.match(submission, /legacySubmitOwnerInspectionFirstOnboarding/);
  assert.match(submission, /releaseNewClaims/);

  assert.match(completion, /buildInspectionVerifiedPropertyGeo/);
  assert.match(completion, /PHYSICAL_INSPECTION_EVIDENCE_V2/);
  assert.match(review, /Inspection-first properties cannot be approved or made dispatch-ready/);
  assert.match(payment, /hasDispatchReadyPropertyGeo\(property\)/);
});
