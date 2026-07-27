import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

function preparedPropertyRules() {
  const directory = mkdtempSync(join(tmpdir(), 'bin-property-geo-rules-'));
  try {
    copyFileSync(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), join(directory, 'firestore.rules'));
    execFileSync(
      process.execPath,
      [fileURLToPath(new URL('../../scripts/harden-property-geo-authority.mjs', import.meta.url))],
      { cwd: directory, stdio: 'pipe' },
    );
    return readFileSync(join(directory, 'firestore.rules'), 'utf8');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function ruleFunction(rules, name) {
  const start = rules.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const open = rules.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < rules.length; index += 1) {
    if (rules[index] === '{') depth += 1;
    if (rules[index] === '}') {
      depth -= 1;
      if (depth === 0) return rules.slice(start, index + 1);
    }
  }
  return '';
}

test('canonical property geo is server-authoritative and Owner submissions remain unverified', async () => {
  const [rules, backend, authority, rootLocation, ownerLocation, adminPage, pinResolver, hardener] = await Promise.all([
    Promise.resolve(preparedPropertyRules()),
    read('functions/adminPropertyReview.ts'),
    read('functions/propertyGeoAuthority.ts'),
    read('src/components/onboarding/PropertyLocationStep.tsx'),
    read('apps/owner-app/src/components/onboarding/PropertyLocationStep.tsx'),
    read('apps/admin-panel/src/pages/admin/AdminPropertyApprovalsPage.tsx'),
    read('apps/admin-panel/src/lib/verifiedPropertyPin.ts'),
    read('scripts/harden-property-geo-authority.mjs'),
  ]);

  assert.match(rules, /function submittedPropertyGeoIsUnverified/);
  assert.match(rules, /function propertyCreateHasNoCanonicalGeo/);
  assert.match(rules, /function canonicalPropertyGeoUnchanged/);
  assert.match(rules, /function safeManagedPropertyUpdate/);
  assert.match(rules, /function safeOwnerPropertyCreate[\s\S]*ownerDraftCreate\(data\)[\s\S]*propertyCreateHasNoCanonicalGeo\(data\)/);
  assert.match(rules, /'geoVerification'/);
  assert.match(rules, /canManageProperties\(\) && safeManagedPropertyUpdate\(\)/);
  assert.doesNotMatch(rules, /function ownerCannotSupplyCanonicalPropertyGeo/);
  assert.doesNotMatch(rules, /function ownerSubmittedPropertyGeoIsUnverified/);
  assert.match(hardener, /Browser property writes are evidence-only/);

  for (const component of [rootLocation, ownerLocation]) {
    assert.match(component, /submittedGeo:/);
    assert.match(component, /source: 'owner_submission'/);
    assert.match(component, /verified: false/);
    assert.match(component, /dispatchReady: false/);
    assert.match(component, /requiresGeoReview: true/);
    assert.doesNotMatch(component, /geo: geo as any/);
  }

  assert.match(authority, /export function buildFounderVerifiedPropertyGeo/);
  assert.match(authority, /source: "admin_manual"/);
  assert.match(authority, /verified: true/);
  assert.match(authority, /dispatchReady: true/);
  assert.match(authority, /requiresGeoReview: false/);
  assert.match(authority, /verificationVersion: 1/);
  assert.match(backend, /buildFounderVerifiedPropertyGeo\(property, actor\.uid, now\)/);
  assert.match(backend, /update\.geo = canonical\.geo/);
  assert.match(backend, /update\.geoVerification = canonical\.geoVerification/);
  assert.match(backend, /geoDispatchReady/);

  assert.match(adminPage, /httpsCallable\(functions, 'adminReviewOwnerProperty'\)/);
  assert.doesNotMatch(adminPage, /updateDoc\s*\(/);
  assert.doesNotMatch(adminPage, /addDoc\s*\(/);
  assert.doesNotMatch(pinResolver, /owner_submission/);
});

test('verified properties keep ordinary Owner updates while canonical geo stays immutable', async () => {
  const [rules, emulatorTest] = await Promise.all([
    Promise.resolve(preparedPropertyRules()),
    read('test/property-geo-authority-rules.test.js'),
  ]);
  const managedUpdate = ruleFunction(rules, 'safeManagedPropertyUpdate');
  const ownerUpdate = ruleFunction(rules, 'safeOwnerPropertyUpdate');
  assert.match(managedUpdate, /canonicalPropertyGeoUnchanged\(\)/);
  assert.match(managedUpdate, /submittedPropertyGeoIsUnverified\(request\.resource\.data\)/);
  assert.match(ownerUpdate, /safeManagedPropertyUpdate\(\)/);
  assert.doesNotMatch(ownerUpdate, /ownerCannotSupplyCanonicalPropertyGeo/);
  assert.match(emulatorTest, /Owner-updated ordinary property name/);
  assert.match(emulatorTest, /assertFails\(updateDoc\(refOwner, \{ geo:/);
});
