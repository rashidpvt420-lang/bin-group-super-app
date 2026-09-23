import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('inspection-first properties cannot use legacy approve-and-verify-geo authority', async () => {
  const [page, wrapper, legacyBackend, authority, runtime] = await Promise.all([
    read('apps/admin-panel/src/pages/admin/AdminPropertyApprovalsPage.tsx'),
    read('functions/canonicalAdminPropertyReview.ts'),
    read('functions/adminPropertyReview.ts'),
    read('functions/propertyGeoAuthority.ts'),
    read('functions/runtime.ts'),
  ]);

  assert.match(page, /Inspection-first Owner properties are verified by evidence-backed physical site visits/);
  assert.match(page, /Use Intake Vault to create one site visit per property/);
  assert.match(page, /inspectionFirst\(row\)/);
  assert.match(page, /Legacy approve \/ verify geo/);
  assert.doesNotMatch(page, />Approve & verify geo</);
  assert.doesNotMatch(page, /updateDoc\s*\(/);
  assert.doesNotMatch(page, /addDoc\s*\(\s*collection\s*\(\s*db\s*,\s*['"](?:audit_logs|notifications)['"]/);

  assert.match(wrapper, /export const adminReviewOwnerProperty = onCall/);
  assert.match(wrapper, /enforceAppCheck: true/);
  assert.match(wrapper, /ceo@bin-groups\.com/);
  assert.match(wrapper, /sign_in_second_factor/);
  assert.match(wrapper, /OWNER_FIVE_PAGE_INSPECTION_FIRST_V1/);
  assert.match(wrapper, /Inspection-first properties cannot be approved or made dispatch-ready/);
  assert.match(wrapper, /Draft properties are not eligible/);
  assert.match(wrapper, /legacyAdminReviewOwnerProperty/);

  assert.match(legacyBackend, /buildFounderVerifiedPropertyGeo\(property, actor\.uid, now\)/);
  assert.match(legacyBackend, /update\.geo = canonical\.geo/);
  assert.match(legacyBackend, /update\.geoVerification = canonical\.geoVerification/);
  assert.match(authority, /export function buildFounderVerifiedPropertyGeo/);
  assert.match(authority, /source: "FOUNDER_MFA_REVIEW"/);
  assert.match(runtime, /export \{ adminReviewOwnerProperty \} from "\.\/canonicalAdminPropertyReview"/);
  assert.doesNotMatch(runtime, /export \* from "\.\/adminPropertyReview"/);
});

test('Owner management page remains syntactically valid and has one property subscription', async () => {
  const source = await read('apps/admin-panel/src/pages/owners/OwnerManagementPage.tsx');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: 'OwnerManagementPage.tsx',
    reportDiagnostics: true,
  });
  const errors = (transpiled.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);

  assert.deepEqual(
    errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')),
    [],
    'OwnerManagementPage.tsx must parse as valid TSX',
  );
  assert.equal((source.match(/onSnapshot\s*\(/g) || []).length, 1, 'property updates must have one realtime subscription');
  assert.equal((source.match(/const \[properties, setProperties\]/g) || []).length, 1, 'property state must be declared once');
  assert.doesNotMatch(source, /loadingProps/);
  assert.doesNotMatch(source, /useState<any\[\]>/);
});

test('shared client audit helper uses the protected callable', async () => {
  const source = await read('packages/shared/src/utils/auditLogger.ts');
  assert.match(source, /httpsCallable\(functions, 'logUserAuditAction'\)/);
  assert.doesNotMatch(source, /collection\(db, ['"]audit_logs['"]\)/);
  assert.doesNotMatch(source, /addDoc\s*\(/);
});
