import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('protected Owner production evidence isolates synthetic identity without weakening duplicate detection', async () => {
  const [wrapper, suite, submission] = await Promise.all([
    read('scripts/run-owner-inspection-first-production-evidence-unique.mjs'),
    read('scripts/run-owner-business-suite-evidence.mjs'),
    read('functions/canonicalOwnerSubmission.ts'),
  ]);

  assert.match(wrapper, /run-owner-inspection-first-production-evidence\.mjs/);
  assert.match(wrapper, /propertyNameCount !== 1/);
  assert.match(wrapper, /latitudeCount !== 3/);
  assert.match(wrapper, /longitudeCount !== 3/);
  assert.match(wrapper, /syntheticPropertyName/);
  assert.match(wrapper, /coordinateOffset/);
  assert.doesNotMatch(wrapper, /property_identity_registry/);
  assert.doesNotMatch(wrapper, /deleteQuery/);

  assert.match(suite, /run-owner-inspection-first-production-evidence-unique\.mjs/);
  assert.match(submission, /property_identity_registry/);
  assert.match(submission, /already-exists/);
  assert.match(submission, /This property already exists in BIN GROUP or is already being onboarded/);
});
