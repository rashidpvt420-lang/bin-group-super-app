import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('technician credential renewal evidence is server-write-only and Admin-readable', async () => {
  const rules = await read('firestore.rules');
  const block = rules.match(/match \/technician_credential_renewals\/\{requestId\} \{[\s\S]*?\n\s*\}/)?.[0] || '';

  assert.match(block, /allow read: if isAdmin\(\);/);
  assert.match(block, /allow create, update, delete: if false;/);
  assert.doesNotMatch(block, /allow write: if true|allow create: if isAuthenticated/);
});

test('generic Admin fallback cannot mutate technician credential renewals', async () => {
  const rules = await read('firestore.rules');
  const occurrences = rules.match(/'technician_credential_renewals'/g) || [];

  assert.ok(occurrences.length >= 2, 'collection must be excluded from generic create and update authority');
  assert.match(rules, /match \/technician_credential_renewals\/\{requestId\}/);
});
