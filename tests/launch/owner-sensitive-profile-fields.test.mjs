import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Owner generic profile save cannot overwrite verified phone or billing identity', async () => {
  const source = await read('src/owner/pages/OwnerProfilePage.tsx');
  const saveBlock = source.slice(source.indexOf('const handleSave'), source.indexOf('const handlePasswordReset'));

  assert.doesNotMatch(saveBlock, /phoneNumber\s*:/);
  assert.doesNotMatch(saveBlock, /billingContact\s*:/);
  assert.doesNotMatch(saveBlock, /billingPhone\s*:/);
  assert.match(source, /disabled label=\{label\('Verified Mobile Number'/);
  assert.match(source, /disabled label=\{label\('Billing Name'/);
  assert.match(source, /disabled label=\{label\('Billing Email'/);
  assert.match(source, /disabled label=\{label\('Billing Phone'/);
  assert.match(source, /protected OTP \/ KYC review workflow/);
  assert.match(source, /مسار رمز التحقق \/ مراجعة اعرف عميلك المحمي/);
});
