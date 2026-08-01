import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../../apps/admin-panel/src/context/AuthContext.tsx', import.meta.url),
  'utf8',
);

test('every auth callback invalidates the previous verification, including null-user callbacks', () => {
  const callback = source.slice(
    source.indexOf('const unsubscribe = onAuthStateChanged'),
    source.indexOf('return () => {', source.indexOf('const unsubscribe = onAuthStateChanged')),
  );

  const invalidateIndex = callback.indexOf('invalidateActiveAttempt();');
  const nullIndex = callback.indexOf('if (!firebaseUser)');
  assert.ok(invalidateIndex >= 0, 'auth callback must invalidate the active attempt');
  assert.ok(nullIndex >= 0, 'auth callback must handle a null user');
  assert.ok(invalidateIndex < nullIndex, 'invalidation must happen before the null-user branch');
});

test('verification state and timeout are owned by an attempt id and uid', () => {
  assert.match(source, /type VerificationAttempt = \{[\s\S]*id: number;[\s\S]*uid: string;[\s\S]*timer: number \| null;[\s\S]*cancelled: boolean;/);
  assert.match(source, /activeAttempt === attempt/);
  assert.match(source, /verificationGeneration === attempt\.id/);
  assert.match(source, /attempt\.uid\.length > 0/);
  assert.match(source, /attempt\.timer = window\.setTimeout/);
  assert.doesNotMatch(source, /globalTimeoutTimer/);
});

test('post-await mutations and sign-out paths reject stale attempts', () => {
  assert.match(source, /await timeout\(getIdTokenResult[\s\S]*if \(!isCurrentAttempt\(attempt\)\) throw new Error\('STALE_AUTH_ATTEMPT'\)/);
  assert.match(source, /await timeout\(getDoc[\s\S]*if \(!isCurrentAttempt\(attempt\)\) throw new Error\('STALE_AUTH_ATTEMPT'\)/);
  assert.match(source, /const verifiedUser = await verifyAdminUser\(firebaseUser, attempt\);[\s\S]*mutateIfCurrent\(attempt/);
  assert.match(source, /catch \(authError: any\) \{\s*if \(!isCurrentAttempt\(attempt\)\) return;/);
  assert.match(source, /attempt\.cancelled = true;[\s\S]*verificationGeneration \+= 1;[\s\S]*await signOut\(auth\)/);
});

test('unmount invalidates the active attempt before unsubscribe', () => {
  const cleanup = source.slice(source.lastIndexOf('return () => {'));
  const mountedIndex = cleanup.indexOf('mounted = false;');
  const invalidateIndex = cleanup.indexOf('invalidateActiveAttempt();');
  const unsubscribeIndex = cleanup.indexOf('unsubscribe();');
  assert.ok(mountedIndex >= 0 && invalidateIndex > mountedIndex, 'cleanup must mark unmounted then invalidate');
  assert.ok(unsubscribeIndex > invalidateIndex, 'attempt invalidation must occur before unsubscribe');
});
