import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Owner property approval and rejection are server-authoritative', async () => {
  const [page, backend, runtime] = await Promise.all([
    read('apps/admin-panel/src/pages/owners/OwnerManagementPage.tsx'),
    read('functions/adminPropertyReview.ts'),
    read('functions/runtime.ts'),
  ]);

  assert.match(page, /httpsCallable\(functions, 'adminReviewOwnerProperty'\)/);
  assert.doesNotMatch(page, /updateDoc\s*\(/);
  assert.doesNotMatch(page, /addDoc\s*\(\s*collection\s*\(\s*db\s*,\s*['"](?:audit_logs|notifications)['"]/);

  assert.match(backend, /export const adminReviewOwnerProperty = onCall/);
  assert.match(backend, /enforceAppCheck: true/);
  assert.match(backend, /ceo@bin-groups\.com/);
  assert.match(backend, /sign_in_second_factor/);
  assert.match(backend, /db\.runTransaction/);
  assert.match(backend, /collection\("properties"\)/);
  assert.match(backend, /collection\("audit_logs"\)/);
  assert.match(backend, /collection\("notifications"\)/);
  assert.match(backend, /SERVER_AUTHORITATIVE/);
  assert.match(runtime, /export \* from "\.\/adminPropertyReview"/);
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
