import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

async function identityModule() {
  const source = await read('functions/propertyIdentity.ts');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: 'propertyIdentity.ts',
    reportDiagnostics: true,
  });
  const errors = (output.diagnostics || []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  assert.deepEqual(errors.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')), []);
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier === 'crypto' || specifier === 'node:crypto') return crypto;
    throw new Error(`Unexpected dependency: ${specifier}`);
  };
  new Function('require', 'module', 'exports', output.outputText)(localRequire, module, module.exports);
  return module.exports;
}

test('property identity is multi-signal and resistant to cosmetic renames', async () => {
  const { buildPropertyIdentities } = await identityModule();
  const base = {
    titleDeedReference: 'DLD-998877',
    unitNumber: '1204',
    address: 'Tower One, Sheikh Mohammed Blvd',
    propertyType: 'Apartment',
    geo: { lat: 25.204849, lng: 55.270783, placeId: 'ChIJ-BIN-GROUP-01', address: 'Tower One, Sheikh Mohammed Blvd', emirate: 'Dubai', area: 'Downtown' },
  };
  const renamed = { ...base, titleDeedReference: ' dld / 998877 ', propertyName: 'Different marketing name' };
  const separateUnit = { ...base, titleDeedReference: 'DLD-998878', unitNumber: '1205' };
  const first = buildPropertyIdentities(base);
  const second = buildPropertyIdentities(renamed);
  const third = buildPropertyIdentities(separateUnit);
  const byKind = (rows, kind) => rows.find((row) => row.kind === kind)?.hash;
  assert.equal(byKind(first, 'TITLE_DEED'), byKind(second, 'TITLE_DEED'));
  assert.equal(byKind(first, 'GEO_UNIT'), byKind(second, 'GEO_UNIT'));
  assert.notEqual(byKind(first, 'GEO_UNIT'), byKind(third, 'GEO_UNIT'));
});

test('canonical submission claims identities transactionally and runtime uses it', async () => {
  const [submission, runtime, rules, hardener] = await Promise.all([
    read('functions/canonicalOwnerSubmission.ts'),
    read('functions/runtime.ts'),
    read('scripts/harden-property-identity-registry-rules.mjs'),
    read('package.json'),
  ]);
  assert.match(submission, /property_identity_registry/);
  assert.match(submission, /db\.runTransaction/);
  assert.match(submission, /releaseNewClaims/);
  assert.match(runtime, /submitOwnerInspectionFirstOnboarding \} from "\.\/canonicalOwnerSubmission"/);
  assert.match(hardener, /match \/property_identity_registry\/\{identityHash\}/);
  assert.match(hardener, /allow read, create, update, delete: if false/);
  assert.match(packageJson, /harden:property-identity-registry/);
});

test('legacy property review cannot approve drafts or inspection-first submissions', async () => {
  const [backend, page] = await Promise.all([
    read('functions/adminPropertyReview.ts'),
    read('apps/admin-panel/src/pages/admin/AdminPropertyApprovalsPage.tsx'),
  ]);
  assert.doesNotMatch(backend, /"draft",\s*\n\s*"admin_review"/);
  assert.match(backend, /Draft properties are not eligible/);
  assert.match(backend, /Inspection-first properties cannot be approved or made dispatch-ready/);
  assert.match(page, /inspectionFirst/);
  assert.doesNotMatch(page, /const pendingStates = \[[^\]]*'DRAFT'/);
});

test('inspection-first public copy never asks for 15 percent before required visits', async () => {
  const page = await read('src/pages/public/PublicMarketingPage.tsx');
  assert.match(page, /15% mobilization only after required inspections/);
  assert.match(page, /physical site visits/);
  assert.match(page, /15٪ فقط بعد اكتمال الفحوصات المطلوبة/);
  assert.doesNotMatch(page, /Submit documents and payment proof/);
});
