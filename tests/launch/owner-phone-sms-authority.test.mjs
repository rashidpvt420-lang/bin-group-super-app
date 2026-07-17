import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync('functions/secureOwnerProfileOperations.ts', 'utf8');
const card = readFileSync('src/owner/components/OwnerPhoneVerificationCard.tsx', 'utf8');
const page = readFileSync('src/owner/pages/OwnerProfilePage.tsx', 'utf8');
const runtime = readFileSync('functions/runtime.ts', 'utf8');

test('Owner phone sync trusts Firebase Auth rather than browser phone input', () => {
  const start = server.indexOf('export const syncVerifiedOwnerPhone');
  const end = server.indexOf('export const updateVerifiedOwnerProfile');
  const syncBlock = server.slice(start, end);

  assert.ok(start >= 0 && end > start, 'syncVerifiedOwnerPhone callable must exist before profile update callable');
  assert.match(syncBlock, /enforceAppCheck: true/);
  assert.match(syncBlock, /admin\.auth\(\)\.getUser\(uid\)/);
  assert.match(syncBlock, /authRecord\.phoneNumber/);
  assert.match(syncBlock, /Firebase Authentication has no verified Owner phone number to sync/);
  assert.match(syncBlock, /OWNER_PHONE_VERIFIED_SYNCED/);
  assert.match(syncBlock, /phoneAuthority: "FIREBASE_AUTH_PHONE"/);
  assert.match(syncBlock, /db\.runTransaction/);
  assert.doesNotMatch(syncBlock, /request\.data/);
});

test('Owner browser verifies SMS through Firebase Auth before server synchronization', () => {
  assert.match(card, /PhoneAuthProvider/);
  assert.match(card, /RecaptchaVerifier/);
  assert.match(card, /updatePhoneNumber/);
  assert.match(card, /provider\.verifyPhoneNumber\(normalized, verifierRef\.current\)/);
  assert.match(card, /PhoneAuthProvider\.credential\(verificationId, otp\)/);
  assert.match(card, /await updatePhoneNumber\(auth\.currentUser, credential\)/);
  assert.match(card, /await auth\.currentUser\.reload\(\)/);
  assert.match(card, /await auth\.currentUser\.getIdToken\(true\)/);
  assert.match(card, /httpsCallable\(functions, 'syncVerifiedOwnerPhone'\)/);
  assert.match(card, /await syncPhone\(\{\}\)/);
  assert.doesNotMatch(card, /setDoc\(|updateDoc\(|addDoc\(/);
  assert.doesNotMatch(card, /otp\s*[:=]\s*['"]\d{6}['"]/);
});

test('Owner phone verification UI is explicit, stable, and fail-closed', () => {
  for (const id of [
    'owner-phone-verification-card',
    'owner-phone-target',
    'owner-phone-send-otp',
    'owner-phone-otp',
    'owner-phone-verify-otp',
    'owner-phone-reset-otp',
  ]) {
    assert.match(card, new RegExp(id));
  }
  assert.match(card, /auth\/requires-recent-login/);
  assert.match(card, /auth\/invalid-verification-code/);
  assert.match(card, /auth\/too-many-requests/);
  assert.match(card, /\^\\\+\[1-9\]\\d\{7,14\}\$/);
  assert.match(card, /otp\.length !== 6/);
});

test('Owner profile keeps verified phone read-only and embeds SMS authority workflow', () => {
  assert.match(page, /OwnerPhoneVerificationCard/);
  assert.match(page, /data-testid="owner-verified-phone"/);
  assert.match(page, /InputProps=\{\{ readOnly: true \}\}/);
  assert.match(page, /Use Firebase SMS verification below to change this number/);
  assert.match(page, /onVerified=\{handleVerifiedPhone\}/);
  assert.doesNotMatch(page, /label=\{label\('Verified Mobile Number'[\s\S]{0,300}onChange=/);
});

test('Owner phone sync callable is deployed through the secured runtime', () => {
  assert.match(runtime, /export \* from "\.\/secureOwnerProfileOperations"/);
  assert.match(server, /export const syncVerifiedOwnerPhone/);
});
