import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const normalizer = readFileSync('scripts/normalize-security-rules-test.mjs', 'utf8');
const dedicatedSuite = readFileSync('test/push-token-security-rules.test.js', 'utf8');

const blockStart = normalizer.indexOf('const canonicalUserSubcollectionBlock =');
const blockEnd = normalizer.indexOf('const obsoleteCount =', blockStart);
const canonicalBlock = normalizer.slice(blockStart, blockEnd);

test('legacy user subcollection cases are deterministically replaced', () => {
  assert.match(
    normalizer,
    /user subcollection restrictions: Operations and Finance can read top-level user directories but NOT subcollections/,
  );
  assert.match(
    normalizer,
    /user push token and readiness subcollections are server-only while unknown paths fail closed/,
  );
  assert.match(normalizer, /next\.slice\(0, legacyStartIndex\)/);
  assert.match(normalizer, /canonicalUserSubcollectionBlock/);
  assert.match(normalizer, /next\.slice\(nextTestIndex\)/);
  assert.match(normalizer, /canonicalUserSubcollectionCount !== 1/);
});

test('canonical monolithic rule test denies every browser role', () => {
  assert.ok(blockStart >= 0 && blockEnd > blockStart);
  assert.match(canonicalBlock, /seedServerDocument\('users\/user_a\/fcmTokens\/token_seeded'/);
  assert.match(canonicalBlock, /seedServerDocument\('users\/user_a\/deviceReadiness\/push'/);
  assert.match(canonicalBlock, /\[selfDb, otherDb, adminDb, hrDb, opsDb, financeDb\]/);
  assert.match(canonicalBlock, /assertFails\(getDoc\(doc\(database, 'users\/user_a\/fcmTokens\/token_seeded'\)\)\)/);
  assert.match(canonicalBlock, /assertFails\(getDoc\(doc\(database, 'users\/user_a\/deviceReadiness\/push'\)\)\)/);
  assert.match(canonicalBlock, /users\/user_a\/fcmTokens\/forged/);
  assert.match(canonicalBlock, /users\/user_a\/deviceReadiness\/forged/);
  assert.match(canonicalBlock, /users\/user_a\/permissions\/escalated/);
  assert.match(canonicalBlock, /users\/user_a\/security\/session/);
  assert.doesNotMatch(canonicalBlock, /assertSucceeds\([^\n]*(fcmTokens|deviceReadiness)/);
});

test('dedicated push-token emulator suite remains server-authoritative', () => {
  assert.match(
    dedicatedSuite,
    /users and browser Admins cannot read or mutate server-managed push token documents/,
  );
  assert.match(dedicatedSuite, /await assertFails\(getDoc\(tokenRef\)\)/);
  assert.match(
    dedicatedSuite,
    /await assertFails\(setDoc\(doc\(tenantDb, 'users\/tenant_push\/fcmTokens\/forged'/,
  );
  assert.match(
    dedicatedSuite,
    /await assertFails\(getDoc\(doc\(adminDb, 'users\/tenant_push\/fcmTokens\/hash_1'\)\)\)/,
  );
  assert.match(
    dedicatedSuite,
    /users cannot write raw push tokens, push authority summaries or readiness to their root profile/,
  );
});
