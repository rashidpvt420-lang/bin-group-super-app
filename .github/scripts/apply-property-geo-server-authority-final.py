from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one marker, found {count}')
    return source.replace(old, new, 1)


# Firestore client authority: submitted evidence may change, canonical verification may not.
rules_path = Path('firestore.rules')
rules = rules_path.read_text(encoding='utf-8')
old_owner = '''    function safeOwnerPropertyUpdate() {
      return signedIn() &&
        owns(resource.data) &&
        request.resource.data.get('ownerId', null) == resource.data.get('ownerId', null) &&
        request.resource.data.get('ownerUid', null) == resource.data.get('ownerUid', null) &&
        !request.resource.data.diff(resource.data).affectedKeys().hasAny([
          'status',
          'activationStatus',
          'paymentStatus',
          'paymentVerified',
          'adminApproved',
          'approved',
          'contractActivated',
          'dashboardUnlocked',
          'dashboardUnlockApproved',
          'unlocksDashboard',
          'activeContractId',
          'quoteHash',
          'quoteSnapshot',
          'quoteVersion',
          'ownerId',
          'ownerUid'
        ]);
    }
'''
new_owner = '''    function submittedPropertyGeoIsUnverified(data) {
      return !('submittedGeo' in data) || (
        data.submittedGeo is map &&
        data.submittedGeo.get('lat', null) is number &&
        data.submittedGeo.get('lng', null) is number &&
        data.submittedGeo.get('lat', 0) >= -90 &&
        data.submittedGeo.get('lat', 0) <= 90 &&
        data.submittedGeo.get('lng', 0) >= -180 &&
        data.submittedGeo.get('lng', 0) <= 180 &&
        !(data.submittedGeo.get('lat', 0) == 0 && data.submittedGeo.get('lng', 0) == 0) &&
        data.submittedGeo.get('source', '') == 'owner_submission' &&
        data.submittedGeo.get('verified', false) == false &&
        data.submittedGeo.get('dispatchReady', false) == false &&
        data.submittedGeo.get('requiresGeoReview', true) == true &&
        data.submittedGeo.get('verifiedBy', null) == null &&
        data.submittedGeo.get('verifiedAt', null) == null
      );
    }

    function propertyCreateHasNoCanonicalGeo(data) {
      return !data.keys().hasAny([
        'geo',
        'geoAnchor',
        'verifiedGeo',
        'geoVerification',
        'verified',
        'verifiedBy',
        'verifiedAt',
        'dispatchReady',
        'requiresGeoReview',
        'geoReviewStatus',
        'geoVerifiedAt',
        'geoVerifiedBy'
      ]) && submittedPropertyGeoIsUnverified(data);
    }

    function canonicalPropertyGeoUnchanged() {
      return !request.resource.data.diff(resource.data).affectedKeys().hasAny([
        'geo',
        'geoAnchor',
        'verifiedGeo',
        'geoVerification',
        'verified',
        'verifiedBy',
        'verifiedAt',
        'dispatchReady',
        'requiresGeoReview',
        'geoReviewStatus',
        'geoVerifiedAt',
        'geoVerifiedBy'
      ]);
    }

    function safeManagedPropertyUpdate() {
      return canonicalPropertyGeoUnchanged() &&
        submittedPropertyGeoIsUnverified(request.resource.data);
    }

    function safeOwnerPropertyUpdate() {
      return signedIn() &&
        owns(resource.data) &&
        request.resource.data.get('ownerId', null) == resource.data.get('ownerId', null) &&
        request.resource.data.get('ownerUid', null) == resource.data.get('ownerUid', null) &&
        safeManagedPropertyUpdate() &&
        !request.resource.data.diff(resource.data).affectedKeys().hasAny([
          'status',
          'activationStatus',
          'paymentStatus',
          'paymentVerified',
          'adminApproved',
          'approved',
          'contractActivated',
          'dashboardUnlocked',
          'dashboardUnlockApproved',
          'unlocksDashboard',
          'activeContractId',
          'quoteHash',
          'quoteSnapshot',
          'quoteVersion',
          'ownerId',
          'ownerUid'
        ]);
    }
'''
rules = replace_once(rules, old_owner, new_owner, 'property geo rule helpers')
rules = replace_once(
    rules,
    '''      allow create: if isNotSuspended() && (canManageProperties() || ownerDraftCreate(request.resource.data));
      allow update: if isNotSuspended() && (canManageProperties() || safeOwnerPropertyUpdate());
''',
    '''      allow create: if isNotSuspended() &&
        propertyCreateHasNoCanonicalGeo(request.resource.data) &&
        (canManageProperties() || ownerDraftCreate(request.resource.data));
      allow update: if isNotSuspended() && (
        (canManageProperties() && safeManagedPropertyUpdate()) ||
        safeOwnerPropertyUpdate()
      );
''',
    'explicit properties browser authority',
)
catchall_marker = "          'system_secrets',\n          'users',"
if rules.count(catchall_marker) != 2:
    raise SystemExit(f'generic write catch-all marker count was {rules.count(catchall_marker)}, expected 2')
rules = rules.replace(catchall_marker, "          'system_secrets',\n          'properties',\n          'users',")
rules_path.write_text(rules, encoding='utf-8')


# Preserve the properties exclusion whenever CI normalizes Firestore rules.
hardener_path = Path('scripts/harden-final-firestore-authority.mjs')
hardener = hardener_path.read_text(encoding='utf-8')
old_list = '''const liveLocationWriteList = `          'system_secrets',
          'technician_live_locations',
          'users',
          'audit_logs',
          'admin_security_sessions',
          'private_hr_profiles',`;
'''
new_lists = '''const legacyLiveLocationWriteList = `          'system_secrets',
          'technician_live_locations',
          'users',
          'audit_logs',
          'admin_security_sessions',
          'private_hr_profiles',`;
const liveLocationWriteList = `          'system_secrets',
          'technician_live_locations',
          'properties',
          'users',
          'audit_logs',
          'admin_security_sessions',
          'private_hr_profiles',`;
'''
hardener = replace_once(hardener, old_list, new_lists, 'canonical properties catch-all list')
hardener = replace_once(
    hardener,
    '''if (text.includes(liveLocationWriteList)) {
  // Already canonical.
} else if (text.includes(privateHrWriteList)) {
''',
    '''if (text.includes(liveLocationWriteList)) {
  // Already canonical.
} else if (text.includes(legacyLiveLocationWriteList)) {
  text = text.replaceAll(legacyLiveLocationWriteList, liveLocationWriteList);
} else if (text.includes(privateHrWriteList)) {
''',
    'catch-all migration router',
)
hardener = replace_once(
    hardener,
    '''  legacyWriteList,
  privateHrWriteList,
];
''',
    '''  legacyWriteList,
  privateHrWriteList,
  legacyLiveLocationWriteList,
];
''',
    'legacy properties catch-all forbidden list',
)
hardener_path.write_text(hardener, encoding='utf-8')


# Owner onboarding surfaces store review evidence, never canonical dispatch authority.
root_path = Path('src/components/onboarding/PropertyLocationStep.tsx')
root = root_path.read_text(encoding='utf-8')
root = root.replace('activeProperty?.location?.lat || activeProperty?.geo?.lat', 'activeProperty?.submittedGeo?.lat || activeProperty?.location?.lat || activeProperty?.geo?.lat')
root = root.replace('activeProperty?.location?.lng || activeProperty?.geo?.lng', 'activeProperty?.submittedGeo?.lng || activeProperty?.location?.lng || activeProperty?.geo?.lng')
root = root.replace('!activeProperty?.location?.lat && !activeProperty?.geo?.lat', '!activeProperty?.submittedGeo?.lat && !activeProperty?.location?.lat && !activeProperty?.geo?.lat')
root = replace_once(
    root,
    '''                source,
                verified: payload.verified ?? !isManual,
                requiresGeoReview: payload.requiresGeoReview ?? isManual,
                dispatchReady: payload.dispatchReady ?? !isManual,
''',
    '''                source,
                verified: false,
                requiresGeoReview: true,
                dispatchReady: false,
''',
    'root owner evidence flags',
)
root = replace_once(
    root,
    '''                geo: geo as any,
                location: {
''',
    '''                geo: undefined,
                submittedGeo: {
                    ...geo,
                    source: 'owner_submission',
                    submittedSource: source,
                    verified: false,
                    verifiedBy: null,
                    verifiedAt: null,
                    dispatchReady: false,
                    requiresGeoReview: true,
                } as any,
                location: {
''',
    'root submitted geo field',
)
root = replace_once(
    root,
    '''                    quality: geo.verified ? 'VERIFIED_EXACT_GPS' : 'REVIEW_REQUIRED',
                    source: geo.source,
                    verified: geo.verified,
                    dispatchReady: geo.dispatchReady,
                    requiresGeoReview: geo.requiresGeoReview,
''',
    '''                    quality: 'OWNER_SUBMITTED_REVIEW_REQUIRED',
                    source: 'owner_submission',
                    submittedSource: source,
                    verified: false,
                    dispatchReady: false,
                    requiresGeoReview: true,
''',
    'root display evidence truth',
)
root = root.replace("activeProperty?.geo && !isManualMode", "activeProperty?.submittedGeo && !isManualMode")
root_path.write_text(root, encoding='utf-8')

owner_app_path = Path('apps/owner-app/src/components/onboarding/PropertyLocationStep.tsx')
owner_app = owner_app_path.read_text(encoding='utf-8')
owner_app = replace_once(
    owner_app,
    '''                source: payload.source || (isManual ? 'admin_manual' : 'google_maps'),
                verified: payload.verified ?? !isManual,
                requiresGeoReview: isManual ? true : Boolean(payload.requiresGeoReview),
                dispatchReady: isManual ? false : payload.dispatchReady ?? true
''',
    '''                source: payload.source || (isManual ? 'admin_manual' : 'google_maps'),
                verified: false,
                requiresGeoReview: true,
                dispatchReady: false
''',
    'owner app evidence flags',
)
owner_app = replace_once(
    owner_app,
    '''                geo: geo as any,
                location: { lat: geo.lat, lng: geo.lng }
''',
    '''                geo: undefined,
                submittedGeo: {
                    ...geo,
                    source: 'owner_submission',
                    submittedSource: geo.source,
                    verified: false,
                    verifiedBy: null,
                    verifiedAt: null,
                    dispatchReady: false,
                    requiresGeoReview: true,
                } as any,
                location: {
                    lat: geo.lat,
                    lng: geo.lng,
                    quality: 'OWNER_SUBMITTED_REVIEW_REQUIRED',
                    source: 'owner_submission',
                    submittedSource: geo.source,
                    verified: false,
                    dispatchReady: false,
                    requiresGeoReview: true,
                }
''',
    'owner app submitted geo field',
)
owner_app = owner_app.replace('activeProperty?.geo && !isManualMode', 'activeProperty?.submittedGeo && !isManualMode')
owner_app_path.write_text(owner_app, encoding='utf-8')


# Every dispatch ticket consumes only the same canonical server-verified geo.
tenant_path = Path('functions/tenantTicketOperations.ts')
tenant = tenant_path.read_text(encoding='utf-8')
tenant = replace_once(
    tenant,
    'import { HttpsError, onCall } from "firebase-functions/v2/https";\n',
    'import { HttpsError, onCall } from "firebase-functions/v2/https";\nimport { PropertyGeoAuthorityError, resolveDispatchReadyPropertyGeo } from "./propertyGeoAuthority";\n',
    'tenant geo authority import',
)
tenant = replace_once(
    tenant,
    '''      const propertyName = text(property.name || property.propertyName || property.address, 240);
      const ownerId = text(property.ownerUid || property.ownerId || unit.ownerUid || unit.ownerId, 160);
      const common: Record<string, unknown> = {
''',
    '''      let canonicalGeo;
      try {
        canonicalGeo = resolveDispatchReadyPropertyGeo(property);
      } catch (error) {
        throw error instanceof PropertyGeoAuthorityError
          ? new HttpsError("failed-precondition", error.message)
          : error;
      }
      const propertyName = text(property.name || property.propertyName || property.address, 240);
      const ownerId = text(property.ownerUid || property.ownerId || unit.ownerUid || unit.ownerId, 160);
      const common: Record<string, unknown> = {
''',
    'tenant canonical geo resolution',
)
tenant = replace_once(
    tenant,
    '''        propertyName,
        unitId,
''',
    '''        propertyName,
        jobLocation: {
          lat: canonicalGeo.lat,
          lng: canonicalGeo.lng,
          latitude: canonicalGeo.lat,
          longitude: canonicalGeo.lng,
          address: canonicalGeo.address,
          source: "SERVER_VERIFIED_PROPERTY_GEO",
          verificationVersion: canonicalGeo.verificationVersion,
          verifiedBy: canonicalGeo.verifiedBy,
        },
        unitId,
''',
    'tenant canonical job location',
)
tenant = replace_once(
    tenant,
    '''        const location = property.location || property.propertyLocation || property.geoPoint || {};
        const lat = Number((location as any).lat ?? (location as any).latitude);
        const lng = Number((location as any).lng ?? (location as any).longitude);
        Object.assign(common, {
''',
    '''        Object.assign(common, {
''',
    'tenant browser location fallback',
)
tenant = replace_once(
    tenant,
    '''          slaMinutes: priority === "emergency" ? 60 : priority === "urgent" ? 240 : 1440,
          ...(Number.isFinite(lat) && Number.isFinite(lng)
            ? { jobLocation: { lat, lng, latitude: lat, longitude: lng, address: text(property.address, 500), source: "property" } }
            : {}),
''',
    '''          slaMinutes: priority === "emergency" ? 60 : priority === "urgent" ? 240 : 1440,
''',
    'tenant conditional browser job location',
)
tenant_path.write_text(tenant, encoding='utf-8')

owner_ops_path = Path('functions/ownerMaintenanceOperations.ts')
owner_ops = owner_ops_path.read_text(encoding='utf-8')
owner_ops = replace_once(
    owner_ops,
    'import * as admin from "firebase-admin";\n',
    'import * as admin from "firebase-admin";\nimport { PropertyGeoAuthorityError, resolveDispatchReadyPropertyGeo } from "./propertyGeoAuthority";\n',
    'owner geo authority import',
)
owner_ops = replace_once(
    owner_ops,
    '''  { cors: true, region: "europe-west3" },
''',
    '''  { cors: true, region: "europe-west3", enforceAppCheck: true },
''',
    'owner maintenance App Check',
)
owner_ops = replace_once(
    owner_ops,
    '''    const sourceLocation = property.location || property.propertyLocation || property.geoPoint || property.geo || {};
    const lat = Number(sourceLocation.lat ?? sourceLocation.latitude);
    const lng = Number(sourceLocation.lng ?? sourceLocation.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
      throw new HttpsError("failed-precondition", "Verified property GPS coordinates are required before dispatch.");
    }
''',
    '''    let canonicalGeo;
    try {
      canonicalGeo = resolveDispatchReadyPropertyGeo(property);
    } catch (error) {
      throw error instanceof PropertyGeoAuthorityError
        ? new HttpsError("failed-precondition", error.message)
        : error;
    }
''',
    'owner browser location fallback',
)
owner_ops = owner_ops.replace('        lat,\n        lng,\n        latitude: lat,\n        longitude: lng,', '        lat: canonicalGeo.lat,\n        lng: canonicalGeo.lng,\n        latitude: canonicalGeo.lat,\n        longitude: canonicalGeo.lng,')
owner_ops = replace_once(
    owner_ops,
    '''        address: text(property.address || property.addressLine, 500),
        source: "SERVER_PROPERTY_RECORD",
''',
    '''        address: canonicalGeo.address,
        source: "SERVER_VERIFIED_PROPERTY_GEO",
        verificationVersion: canonicalGeo.verificationVersion,
        verifiedBy: canonicalGeo.verifiedBy,
''',
    'owner canonical job location metadata',
)
owner_ops_path.write_text(owner_ops, encoding='utf-8')


# Firestore emulator and launch contracts.
security_path = Path('test/security-rules.test.js')
security = security_path.read_text(encoding='utf-8')
security = replace_once(
    security,
    "import './push-token-security-rules.test.js';\n",
    "import './push-token-security-rules.test.js';\nimport './property-geo-authority-rules.test.js';\n",
    'property geo rules import',
)
security_path.write_text(security, encoding='utf-8')

Path('test/property-geo-authority-rules.test.js').write_text("""import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
const submittedGeo = {
  lat: 24.222222,
  lng: 55.333333,
  address: 'Al Ain, UAE',
  emirate: 'Abu Dhabi',
  city: 'Al Ain',
  area: 'Central District',
  source: 'owner_submission',
  verified: false,
  verifiedBy: null,
  verifiedAt: null,
  requiresGeoReview: true,
  dispatchReady: false,
};

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

describe('Canonical property geo authority', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-57c60',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });
  beforeEach(async () => testEnv.clearFirestore());
  after(async () => testEnv.cleanup());

  it('Owner and Admin browsers can submit unverified evidence but cannot create canonical geo', async () => {
    const ownerDb = testEnv.authenticatedContext('owner_geo', { role: 'owner' }).firestore();
    const adminDb = testEnv.authenticatedContext('admin_geo', { admin: true, role: 'admin' }).firestore();
    await assertSucceeds(setDoc(doc(ownerDb, 'properties/submitted'), {
      ownerId: 'owner_geo', status: 'pending_admin_approval', name: 'Submitted Property', submittedGeo,
    }));
    await assertSucceeds(setDoc(doc(adminDb, 'properties/admin-submitted'), {
      ownerId: 'owner_geo', status: 'pending_admin_approval', name: 'Admin Submitted Property', submittedGeo,
    }));
    await assertFails(setDoc(doc(ownerDb, 'properties/forged-owner'), {
      ownerId: 'owner_geo', status: 'pending_admin_approval', geo: { ...submittedGeo, verified: true, dispatchReady: true },
    }));
    await assertFails(setDoc(doc(adminDb, 'properties/forged-admin'), {
      ownerId: 'owner_geo', status: 'pending_admin_approval', geo: { ...submittedGeo, verified: true, dispatchReady: true },
    }));
  });

  it('Owner and Admin browsers cannot mutate canonical geo while ordinary fields remain usable', async () => {
    await seed('properties/canonical', {
      ownerId: 'owner_geo', ownerUid: 'owner_geo', status: 'APPROVED', name: 'Canonical Property', submittedGeo,
      geo: { ...submittedGeo, source: 'admin_manual', verified: true, dispatchReady: true, requiresGeoReview: false, verifiedBy: 'founder', verifiedAt: 'server-time', verificationVersion: 1 },
      geoVerification: { state: 'VERIFIED', source: 'FOUNDER_MFA_REVIEW', verifiedBy: 'founder', verifiedAt: 'server-time', verificationVersion: 1 },
    });
    const ownerDb = testEnv.authenticatedContext('owner_geo', { role: 'owner' }).firestore();
    const adminDb = testEnv.authenticatedContext('admin_geo', { admin: true, role: 'admin' }).firestore();
    const ownerRef = doc(ownerDb, 'properties/canonical');
    const adminRef = doc(adminDb, 'properties/canonical');
    await assertFails(updateDoc(ownerRef, { geo: { ...submittedGeo, verified: true, dispatchReady: true } }));
    await assertFails(updateDoc(adminRef, { geoVerification: { state: 'VERIFIED', verifiedBy: 'admin_geo' } }));
    await assertSucceeds(updateDoc(ownerRef, { address: 'Owner ordinary correction, Al Ain' }));
    await assertSucceeds(updateDoc(adminRef, { adminReviewNote: 'Non-geo administrative correction.' }));
  });

  it('Owner may revise submitted evidence only while it remains explicitly unverified', async () => {
    await seed('properties/review-pending', {
      ownerId: 'owner_geo', ownerUid: 'owner_geo', status: 'pending_admin_approval', name: 'Review Pending', submittedGeo,
    });
    const ownerDb = testEnv.authenticatedContext('owner_geo', { role: 'owner' }).firestore();
    const ref = doc(ownerDb, 'properties/review-pending');
    await assertSucceeds(updateDoc(ref, { submittedGeo: { ...submittedGeo, area: 'Updated owner evidence' } }));
    await assertFails(updateDoc(ref, { submittedGeo: { ...submittedGeo, verified: true, dispatchReady: true, requiresGeoReview: false } }));
  });
});
""", encoding='utf-8')

Path('tests/launch/property-geo-authority.test.mjs').write_text("""import assert from 'node:assert/strict';
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
""", encoding='utf-8')

Path('tests/launch/property-geo-catchall-authority.test.mjs').write_text("""import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const rules = readFileSync('firestore.rules', 'utf8');
const hardener = readFileSync('scripts/harden-final-firestore-authority.mjs', 'utf8');

test('generic Admin browser fallback excludes properties for create and update', () => {
  const catchall = rules.slice(rules.indexOf('match /{collection}/{document=**}'));
  const occurrences = catchall.match(/'properties'/g) || [];
  assert.equal(occurrences.length, 2);
  assert.match(catchall, /allow create:[\s\S]*'system_secrets',\s*'properties',\s*'users'/);
  assert.match(catchall, /allow update, delete:[\s\S]*'system_secrets',\s*'properties',\s*'users'/);
});

test('canonical Firestore hardener migrates and forbids the prior properties-writable list', () => {
  assert.match(hardener, /const legacyLiveLocationWriteList/);
  assert.match(hardener, /text\.replaceAll\(legacyLiveLocationWriteList, liveLocationWriteList\)/);
  assert.match(hardener, /forbidden = \[[\s\S]*legacyLiveLocationWriteList/);
});
""", encoding='utf-8')
