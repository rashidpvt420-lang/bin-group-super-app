import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const backend = await readFile(new URL('../../functions/adminHrOperations.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../../apps/admin-panel/src/pages/admin/HRManagementPage.tsx', import.meta.url), 'utf8');
const storage = await readFile(new URL('../../storage.rules', import.meta.url), 'utf8');

test('Private HR upload stays server-only and MFA protected', () => {
  assert.match(storage, /match \/privateHrDocuments\/\{staffId\}\/\{allPaths=\*\*\} \{\s*allow read, write: if false;/s);
  assert.match(backend, /export const adminUploadHrDocument = onCall/);
  assert.match(backend, /enforceAppCheck: true/);
  assert.match(backend, /requirePrivilegedMfaSession\(request\.auth\)/);
  assert.match(backend, /await assertStaff\(uid\)/);
  assert.match(backend, /HR_UPLOAD_MAX_BYTES = 8 \* 1024 \* 1024/);
  assert.match(backend, /application\/pdf/);
  assert.match(backend, /image\/jpeg/);
  assert.match(backend, /image\/png/);
  assert.match(backend, /privateHrDocuments\/\$\{uid\}\/\$\{documentRef\.id\}_\$\{fileName\}/);
  assert.match(backend, /storageFile\.save\(bytes/);
  assert.match(backend, /ADMIN_UPLOAD_HR_DOCUMENT/);
  assert.match(backend, /sha256/);
});

test('HR Command uploads a real file through the protected callable', () => {
  assert.match(page, /adminUploadHrDocument/);
  assert.match(page, /hr-document-file-picker/);
  assert.match(page, /hr-document-upload-submit/);
  assert.match(page, /accept="application\/pdf,image\/jpeg,image\/png"/);
  assert.match(page, /fileToBase64\(documentFile\)/);
  assert.match(page, /documentFile\.size > 8 \* 1024 \* 1024/);
  assert.match(page, /Protected HR document uploaded and registered/);
  assert.doesNotMatch(page, /uploadBytes\(/);
});
