import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Owner sensitive profile changes use protected server and Firebase SMS workflows', async () => {
  const source = await read('src/owner/pages/OwnerProfilePage.tsx');
  const phoneCard = await read('src/owner/components/OwnerPhoneVerificationCard.tsx');
  const saveBlock = source.slice(source.indexOf('const handleSave'), source.indexOf('const handleVerifiedPhone'));

  assert.match(saveBlock, /httpsCallable\(functions, 'updateVerifiedOwnerProfile'\)/);
  assert.match(saveBlock, /await updateOwnerProfile\(/);
  assert.match(saveBlock, /result\?\.data\?\.profile/);
  assert.doesNotMatch(saveBlock, /setDoc\(/);
  assert.doesNotMatch(saveBlock, /updateDoc\(/);
  assert.doesNotMatch(saveBlock, /serverTimestamp/);

  assert.match(source, /label=\{label\('Verified Mobile Number'/);
  assert.match(source, /InputProps=\{\{ readOnly: true \}\}/);
  assert.match(source, /OwnerPhoneVerificationCard/);
  assert.match(source, /Use Firebase SMS verification below to change this number/);
  assert.match(source, /Legal changes must match the verified Owner KYC record/);
  assert.match(source, /Sensitive changes are server-validated and recorded in immutable audit history/);
  assert.match(source, /استخدم التحقق برسالة Firebase أدناه لتغيير الرقم/);
  assert.match(source, /سجل تدقيق غير قابل للتغيير/);

  assert.match(phoneCard, /PhoneAuthProvider/);
  assert.match(phoneCard, /RecaptchaVerifier/);
  assert.match(phoneCard, /updatePhoneNumber/);
  assert.match(phoneCard, /syncVerifiedOwnerPhone/);
  assert.doesNotMatch(phoneCard, /setDoc\(|updateDoc\(|serverTimestamp/);
});
