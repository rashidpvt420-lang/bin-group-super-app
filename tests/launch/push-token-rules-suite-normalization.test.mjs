import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const normalizer = readFileSync('scripts/normalize-security-rules-test.mjs', 'utf8');
const dedicatedSuite = readFileSync('test/push-token-security-rules.test.js', 'utf8');

const canonicalStart = normalizer.indexOf("user push-token and readiness subcollections are server-only for every browser role");
const canonicalEnd = normalizer.indexOf("unknown and privileged user subcollections remain denied to every browser role");
const canonicalBlock = normalizer.slice(canonicalStart, canonicalEnd);

test('legacy user subcollection cases are replaced by server-only push authority assertions', () => {
  assert.match(normalizer, /user subcollection restrictions: Operations and Finance can read top-level user directories but NOT subcollections/);
  assert.match(normalizer, /user push-token and readiness subcollections are server-only for every browser role/);
  assert.match(normalizer, /seedServerDocument\('users\/some_user\/fcmTokens\/hash_123'/);
  assert.match(normalizer, /seedServerDocument\('users\/some_user\/deviceReadiness\/current'/);
  assert.match(normalizer, /next\.slice\(0, obsoleteUserStartIndex\).*canonicalUserSubcollectionBlock.*next\.slice\(followingTestIndex\)/s);
});

test('canonical monolithic rules cases deny every browser role push document access', () => {
  assert.ok(canonicalStart >= 0 && canonicalEnd > canonicalStart);
  assert.match(canonicalBlock, /\[selfDb, adminDb, hrDb, opsDb, financeDb, otherDb\]/);
  assert.match(canonicalBlock, /assertFails\(getDoc\(tokenRef\)\)/);
  assert.match(canonicalBlock, /assertFails\(setDoc\(doc\(database, 'users\/some_user\/fcmTokens\/forged'/);
  assert.match(canonicalBlock, /assertFails\(updateDoc\(tokenRef, \{ active: false \}\)\)/);
  assert.match(canonicalBlock, /assertFails\(deleteDoc\(tokenRef\)\)/);
  assert.match(canonicalBlock, /assertFails\(getDoc\(readinessRef\)\)/);
  assert.doesNotMatch(canonicalBlock, /assertSucceeds\([^\n]*(fcmTokens|deviceReadiness)/);
});

test('dedicated push-token emulator suite remains server-authoritative', () => {
  assert.match(dedicatedSuite, /users and browser Admins cannot read or mutate server-managed push token documents/);
  assert.match(dedicatedSuite, /await assertFails\(getDoc\(tokenRef\)\)/);
  assert.match(dedicatedSuite, /await assertFails\(setDoc\(doc\(tenantDb, 'users\/tenant_push\/fcmTokens\/forged'/);
  assert.match(dedicatedSuite, /await assertFails\(getDoc\(doc\(adminDb, 'users\/tenant_push\/fcmTokens\/hash_1'\)\)\)/);
  assert.match(dedicatedSuite, /users cannot write raw push tokens, push authority summaries or readiness to their root profile/);
});
