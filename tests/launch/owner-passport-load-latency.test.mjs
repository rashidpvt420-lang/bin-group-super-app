import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// /owner/property-passport showed Accessing Registry... for 15–20s after auth because
// OwnerPropertyPassportResolvedPage awaited every ownerId/email getDocs lookup in series
// (ownerId × 6 + email × 4). RoleContext #1679 bounds AUTHENTICATING; this page must still
// fan the registry lookups out with Promise.all so wall-clock cost is one round, not N.
const src = readFileSync(
  new URL('../../src/owner/pages/OwnerPropertyPassportResolvedPage.tsx', import.meta.url),
  'utf8',
);
const loadStart = src.indexOf('async function loadPassports');
const loadEnd = src.indexOf('loadPassports();', loadStart);
assert.ok(loadStart >= 0 && loadEnd > loadStart, 'loadPassports body must exist');
const loadBody = src.slice(loadStart, loadEnd);

test('passport registry load fans identity lookups with Promise.all', () => {
  assert.match(loadBody, /Promise\.all\(jobs\.map/);
  // Keep the same authorized identity fields — parallelize only, do not drop lookups.
  assert.match(loadBody, /safeQuery\('propertyPassports', 'ownerId'/);
  assert.match(loadBody, /safeQuery\('propertyPassports', 'ownerUid'/);
  assert.match(loadBody, /safeQuery\('propertyPassports', 'ownerEmail'/);
  assert.match(loadBody, /safeQuery\('properties', 'ownerId'/);
  assert.match(loadBody, /safeQuery\('properties', 'ownerUid'/);
  assert.match(loadBody, /safeQuery\('properties', 'ownerEmail'/);
  assert.match(loadBody, /safeQuery\('contracts', 'ownerId'/);
  assert.match(loadBody, /safeQuery\('contracts', 'ownerUid'/);
  assert.match(loadBody, /safeQuery\('contracts', 'ownerEmail'/);
  assert.match(loadBody, /safeQuery\('contracts', 'emailDelivery\.recipient'/);
});

test('passport registry load never awaits safeQuery inside a for-of loop', () => {
  // Sequential `for (...) { ... await safeQuery ... }` is the measured latency bug.
  assert.doesNotMatch(loadBody, /for\s*\([^)]+\)\s*\{[^}]*await\s+safeQuery/s);
  assert.doesNotMatch(loadBody, /for\s*\(const\s+\w+\s+of\s+await\s+safeQuery/);
});

test('Accessing Registry copy remains the in-page loading gate (not RoleContext)', () => {
  assert.match(src, /Accessing Registry\.\.\./);
  assert.match(src, /setLoading\(true\)/);
  assert.match(src, /setLoading\(false\)/);
});
