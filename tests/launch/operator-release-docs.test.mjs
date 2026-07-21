import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');


test('Firebase phone-auth production guide uses only the exact-main dispatcher', async () => {
  const source = await read('docs/firebase-phone-auth-production-gate.md');

  assert.match(source, /START HERE - Firebase Production Deploy/);
  assert.match(source, /Do not run the protected `Firebase Production Deploy` workflow directly/);
  assert.match(source, /zero configured `signIn\.phoneNumber\.testPhoneNumbers` entries/);
  assert.match(source, /Do not re-run an older failed dispatcher form/);
  assert.doesNotMatch(source, /Run the protected Firebase Production Deploy workflow/);
});


test('Google Play release pack requires exact-SHA evidence and least-privilege review accounts', async () => {
  const source = await read('docs/GOOGLE_PLAY_RELEASE_PACK.md');

  for (const required of [
    'START HERE - Firebase Production Deploy',
    'exact current `main` SHA',
    'dedicated reviewer accounts',
    'Never provide the founder, CEO, Super Admin, or production operator account',
    'zero static test phone numbers',
    'signed Android App Bundle',
    'Google Play developer verification and account standing permit submission',
  ]) {
    assert.ok(source.includes(required), `missing release guidance marker: ${required}`);
  }

  assert.doesNotMatch(source, /## Current Verified Status/);
  assert.doesNotMatch(source, /Firebase production deployment: passing/);
  assert.doesNotMatch(source, /Account type: Admin reviewer test account/);
  assert.match(source, /Static “passing” statements in this document must never be treated as proof/);
});
