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

test('canonical property geo stays server-authoritative and inspection-first promotion uses physical evidence', async () => {
  const [rules, authority, completionWrapper, reviewBackend, paymentGate, rootLocation, ownerLocation, adminPage, pinResolver, hardener] = await Promise.all([
    Promise.resolve(preparedPropertyRules()),
    read('functions/propertyGeoAuthority.ts'),
    read('functions/canonicalOwnerInspectionCompletion.ts'),
    read('functions/adminPropertyReview.ts'),
    read('functions/securePaymentApproval.ts'),
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
  assert.match(rules, /function propertyActivationAuthorityUnchanged/);
  assert.match(rules, /function propertyCreateHasNoActivationAuthority/);
  assert.doesNotMatch(rules, /function safeOwnerPropertyCreate\(/);
  assert.doesNotMatch(rules, /function safeOwnerPropertyUpdate\(/);
  assert.match(rules, /'geoVerification'/);
  assert.match(rules, /canManageProperties\(\)[\s\S]{0,240}propertyCreateHasNoActivationAuthority\(request\.resource\.data\)/);
  assert.match(rules, /canManageProperties\(\)[\s\S]{0,120}safeManagedPropertyUpdate\(\)/);
  assert.match(hardener, /Owner property writes are server-callable only/);

  for (const component of [rootLocation, ownerLocation]) {
    assert.match(component, /submittedGeo:/);
    assert.match(component, /source: 'owner_submission'/);
    assert.match(component, /verified: false/);
    assert.match(component, /dispatchReady: false/);
    assert.match(component, /requiresGeoReview: true/);
    assert.doesNotMatch(component, /geo: geo as any/);
  }

  assert.match(authority, /export function buildInspectionVerifiedPropertyGeo/);
  assert.match(authority, /source: "physical_inspection"/);
  assert.match(authority, /source: "PHYSICAL_INSPECTION_EVIDENCE"/);
  assert.match(authority, /verificationVersion: 2/);
  assert.match(authority, /evidenceHash/);
  assert.match(authority, /evidenceGeneration/);
  assert.match(authority, /arrival\?\.withinRadius !== true/);
  assert.match(completionWrapper, /buildInspectionVerifiedPropertyGeo/);
  assert.match(completionWrapper, /geo: canonical\.geo/);
  assert.match(completionWrapper, /geoVerification: canonical\.geoVerification/);
  assert.match(completionWrapper, /PHYSICAL_INSPECTION_EVIDENCE_V2/);
  assert.match(paymentGate, /hasDispatchReadyPropertyGeo\(property\)/);
  assert.match(paymentGate, /OWNER_FIVE_PAGE_INSPECTION_FIRST_V1/);

  assert.match(reviewBackend, /Inspection-first properties cannot be approved or made dispatch-ready/);
  assert.match(reviewBackend, /status === "draft"/);
  assert.match(adminPage, /Inspection-first Owner properties are verified by evidence-backed physical site visits/);
  assert.doesNotMatch(adminPage, />Approve & verify geo</);
  assert.doesNotMatch(adminPage, /updateDoc\s*\(/);
  assert.doesNotMatch(adminPage, /addDoc\s*\(/);
  assert.doesNotMatch(pinResolver, /owner_submission/);

  // Founder-MFA v1 remains compatibility-only for previously reviewed records.
  assert.match(authority, /export function buildFounderVerifiedPropertyGeo/);
  assert.match(authority, /source: "FOUNDER_MFA_REVIEW"/);
  assert.match(authority, /verificationVersion: 1/);
});

test('property browser writes keep lifecycle authority server-side', async () => {
  const [rules, emulatorTest] = await Promise.all([
    Promise.resolve(preparedPropertyRules()),
    read('test/property-geo-authority-rules.test.js'),
  ]);
  const managedUpdate = ruleFunction(rules, 'safeManagedPropertyUpdate');
  assert.match(managedUpdate, /canonicalPropertyGeoUnchanged\(\)/);
  assert.match(managedUpdate, /submittedPropertyGeoIsUnverified\(request\.resource\.data\)/);
  assert.match(managedUpdate, /propertyActivationAuthorityUnchanged\(\)/);
  assert.doesNotMatch(rules, /function safeOwnerPropertyUpdate\(/);
  assert.doesNotMatch(rules, /function safeOwnerPropertyCreate\(/);

  const propertyBlock = rules.slice(
    rules.indexOf('match /properties/{propertyId}'),
    rules.indexOf('match /units/{unitId}'),
  );
  assert.doesNotMatch(propertyBlock, /ownerDraftCreate\(/);
  assert.doesNotMatch(propertyBlock, /safeOwnerPropertyUpdate\(/);
  assert.match(emulatorTest, /Owner browser direct edit is forbidden/);
  assert.match(emulatorTest, /assertFails\(updateDoc\(refAdmin, \{ status: 'ACTIVE' \}\)\)/);
  assert.match(emulatorTest, /assertFails\(updateDoc\(refAdmin, \{ inspectionVerified: true \}\)\)/);
});
