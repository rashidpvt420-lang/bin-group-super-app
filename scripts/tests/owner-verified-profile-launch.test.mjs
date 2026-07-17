import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const server = readFileSync('functions/secureOwnerProfileOperations.ts', 'utf8');
const runtime = readFileSync('functions/runtime.ts', 'utf8');
const page = readFileSync('src/owner/pages/OwnerProfilePage.tsx', 'utf8');

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

test('Owner UI uses callable and does not directly persist sensitive identity', () => {
  assert.match(page, /httpsCallable\(functions, 'updateVerifiedOwnerProfile'\)/);
  assert.doesNotMatch(page, /setDoc\(/);
  assert.doesNotMatch(page, /serverTimestamp/);
  assert.match(page, /رقم الهاتف المتحرك الموثق/);
  assert.match(page, /سجل اعرف عميلك الموثق للمالك/);
  assert.match(page, /سجل تدقيق غير قابل للتغيير/);
});

test('secured Owner callable is exported by runtime', () => {
  assert.match(runtime, /export \* from "\.\/secureOwnerProfileOperations"/);
});
