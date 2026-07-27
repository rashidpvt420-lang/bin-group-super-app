import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/utils/gpsRetryQueue.ts', 'utf8');

test('legacy STOP migration structurally removes coordinate material', () => {
  assert.match(source, /const \{ point: _legacyPoint, \.\.\.coordinateFree \} = entry/);
  assert.match(source, /entry\.action !== 'STOP'/);
  assert.doesNotMatch(source, /const coordinateFree = \{ \.\.\.entry, point: undefined \}/);
});

test('legacy STOP migration reads both browser stores and verifies scoped writes before deletion', () => {
  assert.match(source, /const sources = \[local, session\]\.filter\(Boolean\)/);
  assert.match(source, /for \(const \[technicianUid, migratedStops\] of stopsByTechnician\)/);
  const writeIndex = source.indexOf('writeList(target, STOP_QUEUE_KEY');
  const readBackIndex = source.indexOf('const verified = readList(target, STOP_QUEUE_KEY', writeIndex);
  const verificationIndex = source.indexOf("throw new Error('GPS_STOP_MIGRATION_VERIFICATION_FAILED')", readBackIndex);
  const deletionIndex = source.indexOf('storage.removeItem(key)', verificationIndex);
  assert.ok(writeIndex >= 0 && readBackIndex > writeIndex && verificationIndex > readBackIndex && deletionIndex > verificationIndex);
});

test('legacy UPDATE coordinates are never migrated', () => {
  assert.match(source, /Legacy UPDATE coordinates are[\s\S]*never migrated/);
  assert.match(source, /const legacyStops = legacyStopEntriesForMigration/);
  assert.match(source, /if \(!entry \|\| entry\.action !== 'STOP'\) continue/);
});
