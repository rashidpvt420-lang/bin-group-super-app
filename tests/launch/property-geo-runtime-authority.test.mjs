import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const helperSource = readFileSync('functions/propertyGeoAuthority.ts', 'utf8');
const transpiled = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2021 },
}).outputText;
const authority = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`);
const rules = readFileSync('firestore.rules', 'utf8');
const adminReview = readFileSync('functions/adminPropertyReview.ts', 'utf8');
const adminPage = readFileSync('apps/admin-panel/src/pages/admin/AdminPropertyApprovalsPage.tsx', 'utf8');
const pinResolver = readFileSync('apps/admin-panel/src/lib/verifiedPropertyPin.ts', 'utf8');
const tenantTickets = readFileSync('functions/tenantTicketOperations.ts', 'utf8');
const ownerTickets = readFileSync('functions/ownerMaintenanceOperations.ts', 'utf8');
const gpsServer = readFileSync('functions/technicianLiveLocation.ts', 'utf8');
const gpsClient = readFileSync('src/utils/liveTracking.ts', 'utf8');

test('Founder verification produces one atomic versioned dispatch contract', () => {
  const now = 1_720_000_000_000;
  const property = {
    submittedGeo: {
      lat: 24.2,
      lng: 55.3,
      address: 'Al Ain, UAE',
      emirate: 'Abu Dhabi',
      city: 'Al Ain',
      area: 'Central',
      source: 'owner_submission',
    },
  };
  const built = authority.buildFounderVerifiedPropertyGeo(property, 'founder_uid', now);
  const resolved = authority.resolveDispatchReadyPropertyGeo({ ...property, ...built });
  assert.equal(resolved.lat, 24.2);
  assert.equal(resolved.lng, 55.3);
  assert.equal(resolved.verificationVersion, 1);
  assert.throws(() => authority.resolveDispatchReadyPropertyGeo({ location: property.submittedGeo }));
  assert.throws(() => authority.resolveDispatchReadyPropertyGeo({ geo: built.geo }));
  assert.throws(() => authority.resolveDispatchReadyPropertyGeo({
    ...property,
    ...built,
    geoVerification: { ...built.geoVerification, verifiedBy: 'other' },
  }));
});

test('merged Firestore authority remains fail closed for canonical property geography', () => {
  assert.match(rules, /function ownerCannotSupplyCanonicalPropertyGeo/);
  assert.match(rules, /function canonicalPropertyGeoUnchanged/);
  assert.match(rules, /ownerSubmittedPropertyGeoIsUnverified/);
  assert.match(rules, /'technician_live_locations',\s*'properties',\s*'users'/);
  assert.match(rules, /match \/properties\/\{propertyId\}[\s\S]*safeOwnerPropertyCreate/);
});

test('Founder review supports legacy geo-only verification without reversing approval', () => {
  assert.match(adminReview, /buildFounderVerifiedPropertyGeo/);
  assert.match(adminReview, /hasDispatchReadyPropertyGeo/);
  assert.match(adminReview, /geoOnlyReview/);
  assert.match(adminReview, /VERIFY_PROPERTY_GEO/);
  assert.match(adminPage, /APPROVED — GEO REVIEW REQUIRED/);
  assert.match(adminPage, /httpsCallable\(functions, 'adminReviewOwnerProperty'\)/);
  assert.doesNotMatch(adminPage, /updateDoc\(|addDoc\(|serverTimestamp\(/);
});

test('Admin pins and Owner or Tenant tickets use the same server-authoritative geo contract', () => {
  assert.match(pinResolver, /geo\.verificationVersion/);
  assert.match(pinResolver, /FOUNDER_MFA_REVIEW/);
  assert.match(pinResolver, /verifiedBy !== verificationActor/);
  for (const source of [tenantTickets, ownerTickets]) {
    assert.match(source, /resolveDispatchReadyPropertyGeo/);
    assert.match(source, /SERVER_VERIFIED_PROPERTY_GEO/);
    assert.doesNotMatch(source, /property\.location \|\| property\.propertyLocation/);
  }
});

test('the current-main Technician missing-session STOP repair is preserved', () => {
  assert.match(gpsServer, /missingSession: true/);
  assert.match(gpsServer, /TECHNICIAN_LIVE_LOCATION_STOP_SKIPPED/);
  assert.match(gpsClient, /STOP_MISSING_SESSION_RECONCILED/);
  assert.match(gpsClient, /canonicalSessionAbsent: true/);
});
