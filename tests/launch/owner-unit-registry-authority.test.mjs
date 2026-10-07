import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../../src/owner/pages/OwnerUnitRegistryPage.tsx', import.meta.url), 'utf8');

test('Owner unit registry uses canonical ownerId list authority only', () => {
  assert.match(source, /where\('ownerId', '==', user\.uid\)/);
  assert.doesNotMatch(source, /where\('ownerEmail', '==', email\)/);
  assert.doesNotMatch(source, /where\('ownerUid', '==', user\.uid\)/);
});

test('Owner unit registry cannot remain stuck when identity or reads fail', () => {
  assert.match(source, /if \(!user\?\.uid\) \{[\s\S]*setUnits\(\[\]\);[\s\S]*setLoading\(false\)/);
  assert.match(source, /load\(\)\.catch[\s\S]*setProperties\(\[\]\);[\s\S]*setUnits\(\[\]\);[\s\S]*setNotice/);
  assert.match(source, /setLoading\(false\)/);
});

test('Owner unit generation remains server-authoritative and double-submit guarded', () => {
  assert.match(source, /httpsCallable\(functions, 'ownerGenerateUnits'\)/);
  assert.match(source, /setWizardSaving\(true\)/);
  assert.match(source, /setWizardSaving\(false\)/);
  assert.match(source, /disabled=\{wizardSaving/);
});
