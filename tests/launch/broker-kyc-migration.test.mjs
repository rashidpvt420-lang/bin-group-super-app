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

test('Broker KYC collections are excluded from generic admin fallbacks', async () => {
  const hardener = await read('scripts/harden-broker-kyc-rules.mjs');
  assert.match(hardener, /broker_kyc_submission_limits'\]\) && hasAdminClaim/);
  assert.match(hardener, /hardenedWriteAnchor/);
  assert.match(hardener, /broker_kyc_profiles/);
  assert.match(hardener, /broker_kyc_submission_limits/);
  assert.match(hardener, /legacyWriteCount === 2/);
  assert.match(hardener, /hardenedWriteCount === 2/);
  assert.match(hardener, /replaceAll\(legacyWriteAnchor, hardenedWriteAnchor\)/);
});
