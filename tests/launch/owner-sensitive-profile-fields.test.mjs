import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Owner sensitive profile changes use the protected server workflow', async () => {
  const source = await read('src/owner/pages/OwnerProfilePage.tsx');
  const saveBlock = source.slice(source.indexOf('const handleSave'), source.indexOf('const handlePasswordReset'));

  assert.match(saveBlock, /httpsCallable\(functions, 'updateVerifiedOwnerProfile'\)/);
  assert.match(saveBlock, /await updateOwnerProfile\(/);
  assert.match(saveBlock, /result\?\.data\?\.profile/);
  assert.doesNotMatch(saveBlock, /setDoc\(/);
  assert.doesNotMatch(saveBlock, /updateDoc\(/);
  assert.doesNotMatch(saveBlock, /serverTimestamp/);

  assert.match(source, /label=\{label\('Verified Mobile Number'/);
  assert.match(source, /A changed number must already be verified in Firebase Authentication/);
  assert.match(source, /Legal changes must match the verified Owner KYC record/);
  assert.match(source, /Sensitive changes are server-validated and recorded in immutable audit history/);
  assert.match(source, /يجب أن يكون الرقم الجديد موثقاً مسبقاً في مصادقة Firebase/);
  assert.match(source, /سجل تدقيق غير قابل للتغيير/);
});
