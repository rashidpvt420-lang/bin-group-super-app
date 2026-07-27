import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const brokerFunction = readFileSync('functions/secureBrokerPayoutOperations.ts', 'utf8');
const brokerPage = readFileSync('src/broker/pages/BrokerCommissionsPage.tsx', 'utf8');
const ownerFunction = readFileSync('functions/contractSignatureOtpMailbox.ts', 'utf8');
const ownerControl = readFileSync('src/owner/components/ContractSignatureOtpControl.tsx', 'utf8');

test('Broker payout OTP correlation is generated, stored, hash-bound, returned and exposed', () => {
  assert.match(brokerFunction, /correlationId = crypto\.randomUUID\(\)/);
  assert.match(brokerFunction, /input\.correlationId/);
  assert.match(brokerFunction, /Verification reference: \$\{correlationId\}/);
  assert.match(brokerFunction, /correlationId,\s*expiresAt/);
  assert.match(brokerPage, /broker-payout-otp-correlation/);
  assert.match(brokerPage, /Verification reference: \{otp\.correlationId\}/);
});

test('Owner contract request ID is included in email and exposed as a non-secret UI reference', () => {
  assert.match(ownerFunction, /Verification reference: <code>\$\{args\.requestId\}<\/code>/);
  assert.match(ownerFunction, /Verification reference: \$\{args\.requestId\}/);
  assert.match(ownerControl, /owner-contract-otp-correlation/);
  assert.match(ownerControl, /\{requestId\}/);
});
