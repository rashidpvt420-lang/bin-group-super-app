import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const helperSource = readFileSync('functions/propertyGeoAuthority.ts', 'utf8');
const transpiled = ts.transpileModule(helperSource, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2021 } }).outputText;
const authority = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`);
const rules = readFileSync('firestore.rules', 'utf8');
const hardener = readFileSync('scripts/harden-final-firestore-authority.mjs', 'utf8');
const rootOwner = readFileSync('src/components/onboarding/PropertyLocationStep.tsx', 'utf8');
const ownerApp = readFileSync('apps/owner-app/src/components/onboarding/PropertyLocationStep.tsx', 'utf8');
const adminReview = readFileSync('functions/adminPropertyReview.ts', 'utf8');
const adminPage = readFileSync('apps/admin-panel/src/pages/admin/AdminPropertyApprovalsPage.tsx', 'utf8');
const pinResolver = readFileSync('apps/admin-panel/src/lib/verifiedPropertyPin.ts', 'utf8');
const tenantTickets = readFileSync('functions/tenantTicketOperations.ts', 'utf8');
const ownerTickets = readFileSync('functions/ownerMaintenanceOperations.ts', 'utf8');

test('Founder review builds a versioned canonical geo contract and dispatch resolver rejects browser evidence', () => {
  const now = 1_720_000_000_000;
  const property = { submittedGeo: { lat: 24.2, lng: 55.3, address: 'Al Ain, UAE', emirate: 'Abu Dhabi', city: 'Al Ain', area: 'Central', source: 'owner_submission' } };
  const built = authority.buildFounderVerifiedPropertyGeo(property, 'founder_uid', now);
  const resolved = authority.resolveDispatchReadyPropertyGeo({ ...property, ...built });
  assert.equal(resolved.lat, 24.2);
  assert.equal(resolved.verificationVersion, 1);
  assert.throws(() => authority.resolveDispatchReadyPropertyGeo({ location: property.submittedGeo }));
  assert.throws(() => authority.resolveDispatchReadyPropertyGeo({ geo: built.geo }));
  assert.throws(() => authority.resolveDispatchReadyPropertyGeo({ ...property, ...built, geoVerification: { ...built.geoVerification, verifiedBy: 'other' } }));
});

test('browser rules isolate canonical geo while retaining ordinary Owner and Admin updates', () => {
  assert.match(rules, /function propertyCreateHasNoCanonicalGeo/);
  assert.match(rules, /function canonicalPropertyGeoUnchanged/);
  assert.match(rules, /function safeManagedPropertyUpdate/);
  assert.match(rules, /allow create:[\s\S]*propertyCreateHasNoCanonicalGeo\(request\.resource\.data\)/);
  assert.match(rules, /allow update:[\s\S]*canManageProperties\(\) && safeManagedPropertyUpdate\(\)/);
  assert.match(rules, /safeOwnerPropertyUpdate\(\)[\s\S]*safeManagedPropertyUpdate\(\)/);
  assert.doesNotMatch(rules, /function safeManagedPropertyUpdate\(\)[\s\S]{0,300}propertyCreateHasNoCanonicalGeo/);
  assert.match(rules, /submittedPropertyGeoIsUnverified\(request\.resource\.data\)/);
  assert.match(rules, /'properties',\s*'users'/);
  assert.match(hardener, /const legacyLiveLocationWriteList/);
  assert.match(hardener, /'technician_live_locations',\s*'properties',\s*'users'/);
});

test('Owner onboarding emits submitted evidence only', () => {
  for (const source of [rootOwner, ownerApp]) {
    assert.match(source, /submittedGeo:/);
    assert.match(source, /source: 'owner_submission'/);
    assert.match(source, /verified: false/);
    assert.match(source, /dispatchReady: false/);
    assert.match(source, /requiresGeoReview: true/);
    assert.doesNotMatch(source, /geo: geo as any/);
  }
});

test('Founder callable and Admin page are the only browser review path', () => {
  assert.match(adminReview, /buildFounderVerifiedPropertyGeo/);
  assert.match(adminReview, /hasDispatchReadyPropertyGeo/);
  assert.match(adminReview, /VERIFY_PROPERTY_GEO/);
  assert.match(adminReview, /pending_admin_approval/);
  assert.match(adminReview, /pending_admin_review/);
  assert.match(adminPage, /PENDING ADMIN APPROVAL/);
  assert.match(adminPage, /PENDING ADMIN REVIEW/);
  assert.match(adminReview, /geoDispatchReady/);
  assert.match(adminPage, /httpsCallable\(functions, 'adminReviewOwnerProperty'\)/);
  assert.doesNotMatch(adminPage, /updateDoc\(|addDoc\(|serverTimestamp\(/);
});

test('Admin map and all ticket callables require the same canonical verification', () => {
  assert.match(pinResolver, /geo\.verificationVersion/);
  assert.match(pinResolver, /FOUNDER_MFA_REVIEW/);
  assert.match(pinResolver, /verifiedBy !== verificationActor/);
  for (const source of [tenantTickets, ownerTickets]) {
    assert.match(source, /resolveDispatchReadyPropertyGeo/);
    assert.match(source, /SERVER_VERIFIED_PROPERTY_GEO/);
    assert.doesNotMatch(source, /property\.location \|\| property\.propertyLocation/);
  }
});
