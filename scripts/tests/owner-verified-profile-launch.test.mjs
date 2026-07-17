import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const server = readFileSync('functions/secureOwnerProfileOperations.ts', 'utf8');
const runtime = readFileSync('functions/runtime.ts', 'utf8');
const page = readFileSync('src/owner/pages/OwnerProfilePage.tsx', 'utf8');
const phoneCard = readFileSync('src/owner/components/OwnerPhoneVerificationCard.tsx', 'utf8');

test('Owner sensitive profile writes are server-authoritative', () => {
  assert.match(server, /updateVerifiedOwnerProfile/);
  assert.match(server, /admin\.auth\(\)\.getUser\(uid\)/);
  assert.match(server, /authRecord\.phoneNumber/);
  assert.match(server, /Firebase phone authentication/);
  assert.match(server, /Owner KYC identity must be verified/);
  assert.match(server, /Company name must match the verified Owner KYC identity/);
  assert.match(server, /Billing name must match the verified Owner KYC identity/);
  assert.match(server, /Billing email must match the verified account or verified billing email/);
  assert.match(server, /Billing phone must match the verified Owner phone/);
});

test('Owner profile update is fail-closed and auditable', () => {
  assert.match(server, /enforceAppCheck: true/);
  assert.match(server, /OWNER_VERIFIED_PROFILE_UPDATED/);
  assert.match(server, /before,/);
  assert.match(server, /after,/);
  assert.match(server, /phoneAuthority: value\.phone \? "FIREBASE_AUTH_PHONE"/);
  assert.match(server, /identityAuthority: "OWNER_KYC_RECORD"/);
  assert.match(server, /db\.runTransaction/);
  assert.match(server, /Owner account is disabled or suspended/);
  assert.match(server, /Owner role required/);
});

test('Owner Firebase SMS phone sync trusts only Auth authority', () => {
  const start = server.indexOf('export const syncVerifiedOwnerPhone');
  const end = server.indexOf('export const updateVerifiedOwnerProfile');
  const syncBlock = server.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(syncBlock, /authRecord\.phoneNumber/);
  assert.match(syncBlock, /OWNER_PHONE_VERIFIED_SYNCED/);
  assert.match(syncBlock, /phoneAuthority: "FIREBASE_AUTH_PHONE"/);
  assert.doesNotMatch(syncBlock, /request\.data/);
});

test('Owner UI uses callable and does not directly persist sensitive identity', () => {
  assert.match(page, /httpsCallable\(functions, 'updateVerifiedOwnerProfile'\)/);
  assert.doesNotMatch(page, /setDoc\(/);
  assert.doesNotMatch(page, /serverTimestamp/);
  assert.match(page, /OwnerPhoneVerificationCard/);
  assert.match(page, /InputProps=\{\{ readOnly: true \}\}/);
  assert.match(page, /رقم الهاتف المتحرك الموثق/);
  assert.match(page, /سجل اعرف عميلك الموثق للمالك/);
  assert.match(page, /سجل تدقيق غير قابل للتغيير/);
});

test('Owner phone card verifies Firebase SMS before zero-input sync', () => {
  assert.match(phoneCard, /RecaptchaVerifier/);
  assert.match(phoneCard, /PhoneAuthProvider\.credential/);
  assert.match(phoneCard, /updatePhoneNumber/);
  assert.match(phoneCard, /getIdToken\(true\)/);
  assert.match(phoneCard, /httpsCallable\(functions, 'syncVerifiedOwnerPhone'\)/);
  assert.match(phoneCard, /syncPhone\(\{\}\)/);
  assert.doesNotMatch(phoneCard, /setDoc\(|updateDoc\(|addDoc\(/);
});

test('secured Owner callables are exported by runtime', () => {
  assert.match(runtime, /export \* from "\.\/secureOwnerProfileOperations"/);
  assert.match(server, /export const syncVerifiedOwnerPhone/);
  assert.match(server, /export const updateVerifiedOwnerProfile/);
});
