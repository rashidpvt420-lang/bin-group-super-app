import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Broker KYC submission purges legacy raw fields from public user profiles', async () => {
  const source = await read('functions/brokerKycProfile.ts');
  for (const field of [
    'reraLicense',
    'tradeLicenseNumber',
    'emiratesIdNumber',
    'passportNumber',
    'bankName',
    'bankAccountHolder',
    'bankIban',
    'iban',
  ]) {
    assert.match(source, new RegExp(`${field}: FieldValue\\.delete\\(\\)`));
  }
  assert.match(source, /idempotent = existingPrivate\.submissionHash === submissionHash/);
  assert.match(source, /transaction\.set\(publicRef,[\s\S]*FieldValue\.delete\(\)/);
  assert.doesNotMatch(source, /if \(existingPrivate\.submissionHash === submissionHash\) \{[\s\S]{0,100}return;/);
});
