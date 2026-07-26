import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const rules = readFileSync('firestore.rules', 'utf8');
const hardener = readFileSync('scripts/harden-final-firestore-authority.mjs', 'utf8');
const privateHrHardener = readFileSync('scripts/harden-private-hr-authority.mjs', 'utf8');

test('generic Admin browser fallback excludes properties for create and update', () => {
  const catchall = rules.slice(rules.indexOf('match /{collection}/{document=**}'));
  const occurrences = catchall.match(/'properties'/g) || [];
  assert.equal(occurrences.length, 2);
  assert.match(catchall, /allow create:[\s\S]*'system_secrets',\s*'properties',\s*'users'/);
  assert.match(catchall, /allow update, delete:[\s\S]*'system_secrets',\s*'properties',\s*'users'/);
});

test('canonical Firestore hardener migrates and forbids the prior properties-writable list', () => {
  assert.match(hardener, /const propertyAdminSecurityWriteList/);
  assert.match(hardener, /const propertyPrivateHrWriteList/);
  assert.match(hardener, /const legacyLiveLocationWriteList/);
  assert.match(hardener, /text\.replaceAll\(legacyLiveLocationWriteList, liveLocationWriteList\)/);
  assert.match(hardener, /forbidden = \[[\s\S]*legacyLiveLocationWriteList/);
});

test('Private-HR hardening preserves property and live-location exclusions in every supported order', () => {
  assert.match(privateHrHardener, /const propertyLegacyWritePrefix/);
  assert.match(privateHrHardener, /const propertyHardenedWritePrefix/);
  assert.match(privateHrHardener, /const propertyLiveLocationWritePrefix/);
  assert.match(privateHrHardener, /source\.replaceAll\(propertyLegacyWritePrefix, propertyHardenedWritePrefix\)/);
  assert.match(privateHrHardener, /canonicalWritePrefix = propertyLiveLocationWritePrefix/);
});
