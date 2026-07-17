import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const expectAll = (source, patterns, label) => {
  for (const pattern of patterns) assert.match(source, pattern, `${label}: missing ${pattern}`);
};

test('Broker payout requests require second factor and recent authentication', async () => {
  const source = await read('functions/secureBrokerPayoutOperations.ts');
  expectAll(source, [
    /firebaseClaims\.sign_in_second_factor/,
    /MAX_PAYOUT_AUTH_AGE_SECONDS = 10 \* 60/,
    /auth_time/,
    /mfaVerified/,
    /recentlyAuthenticated/,
    /BROKER_PAYOUT_MFA_REQUIRED/,
    /BROKER_PAYOUT_RECENT_AUTH_REQUIRED/,
  ], 'Broker payout MFA');
});

test('Broker payout guard validates live account state and App Check', async () => {
  const source = await read('functions/secureBrokerPayoutOperations.ts');
  expectAll(source, [
    /admin\.auth\(\)\.getUser\(auth\.uid\)/,
    /userRecord\.disabled/,
    /customClaims\?\.suspended === true/,
    /enforceAppCheck: true/,
    /legacySubmitBrokerPayoutRequest\.run\(request\)/,
  ], 'Broker payout server authority');
});

test('Runtime overrides legacy Broker payout callable', async () => {
  const runtime = await read('functions/runtime.ts');
  assert.match(runtime, /export \{ submitBrokerPayoutRequest \} from "\.\/secureBrokerPayoutOperations"/);
});
