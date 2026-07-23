import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const adminFirebaseSource = await readFile(
  new URL('../../apps/admin-panel/src/lib/firebase.ts', import.meta.url),
  'utf8',
);

const verifierSource = await readFile(
  new URL('../../scripts/verify-admin-firebase-build.mjs', import.meta.url),
  'utf8',
);

const expectedAdminAppId = '1:123413252227:web:285cb53bc26626d699f3b6';
const expectedAdminAppIdSuffix = '285cb53bc26626d699f3b6';

test('Admin Firebase config cannot inherit the main web app ID', () => {
  assert.match(adminFirebaseSource, /REACT_APP_ADMIN_FIREBASE_APP_ID/);
  assert.doesNotMatch(adminFirebaseSource, /process\.env\.REACT_APP_FIREBASE_APP_ID/);
  assert.match(adminFirebaseSource, new RegExp(expectedAdminAppId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(adminFirebaseSource, /appId:\s*clean\(process\.env\.REACT_APP_ADMIN_FIREBASE_APP_ID\)\s*\|\|\s*ADMIN_FIREBASE_APP_ID/);
});

test('Admin build verifier enforces the canonical Firebase app ID suffix', () => {
  assert.match(verifierSource, new RegExp(expectedAdminAppIdSuffix));
  assert.match(verifierSource, /appIdSuffix/);
});
