from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one marker, found {count}")
    return source.replace(old, new, 1)


rules_path = Path("firestore.rules")
rules = rules_path.read_text(encoding="utf-8")
old_owner_update = """    function safeOwnerPropertyUpdate() {
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
"""
new_owner_update = """    function ownerSubmittedPropertyGeoIsUnverified(data) {
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
        ]) &&
        (!('submittedGeo' in data) || (
          data.submittedGeo is map &&
          data.submittedGeo.get('verified', false) == false &&
          data.submittedGeo.get('dispatchReady', false) == false &&
          data.submittedGeo.get('requiresGeoReview', true) == true &&
          data.submittedGeo.get('verifiedBy', null) == null &&
          data.submittedGeo.get('verifiedAt', null) == null
        ));
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

    function safeOwnerPropertyCreate(data) {
      return ownerDraftCreate(data) && ownerSubmittedPropertyGeoIsUnverified(data);
    }

    function safeOwnerPropertyUpdate() {
      return signedIn() &&
        owns(resource.data) &&
        request.resource.data.get('ownerId', null) == resource.data.get('ownerId', null) &&
        request.resource.data.get('ownerUid', null) == resource.data.get('ownerUid', null) &&
        canonicalPropertyGeoUnchanged() &&
        ownerSubmittedPropertyGeoIsUnverified(request.resource.data) &&
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
"""
rules = replace_once(rules, old_owner_update, new_owner_update, "owner property geo helpers")
rules = replace_once(
    rules,
    """      allow create: if isNotSuspended() && (canManageProperties() || ownerDraftCreate(request.resource.data));
      allow update: if isNotSuspended() && (canManageProperties() || safeOwnerPropertyUpdate());
""",
    """      allow create: if isNotSuspended() && (
        (canManageProperties() && ownerSubmittedPropertyGeoIsUnverified(request.resource.data)) ||
        safeOwnerPropertyCreate(request.resource.data)
      );
      allow update: if isNotSuspended() && (
        (canManageProperties() && canonicalPropertyGeoUnchanged()) ||
        safeOwnerPropertyUpdate()
      );
""",
    "properties client authority",
)
rules_path.write_text(rules, encoding="utf-8")


for component_name in [
    "src/components/onboarding/PropertyLocationStep.tsx",
    "apps/owner-app/src/components/onboarding/PropertyLocationStep.tsx",
]:
    path = Path(component_name)
    source = path.read_text(encoding="utf-8")
    source = replace_once(
        source,
        """                verified: payload.verified ?? !isManual,
                requiresGeoReview: payload.requiresGeoReview ?? isManual,
                dispatchReady: payload.dispatchReady ?? !isManual,
""",
        """                // Owner-selected coordinates are evidence for Founder review, never
                // canonical dispatch authority in the browser.
                verified: false,
                requiresGeoReview: true,
                dispatchReady: false,
""",
        f"{component_name} owner review flags",
    )
    source = replace_once(
        source,
        """                geo: geo as any,
""",
        """                submittedGeo: {
                    ...geo,
                    source: 'owner_submission',
                    verified: false,
                    verifiedBy: null,
                    verifiedAt: null,
                    requiresGeoReview: true,
                    dispatchReady: false,
                } as any,
""",
        f"{component_name} submitted geo field",
    )
    source = replace_once(
        source,
        """                    quality: geo.verified ? 'VERIFIED_EXACT_GPS' : 'REVIEW_REQUIRED',
                    source: geo.source,
                    verified: geo.verified,
                    dispatchReady: geo.dispatchReady,
                    requiresGeoReview: geo.requiresGeoReview,
""",
        """                    quality: 'OWNER_SUBMITTED_REVIEW_REQUIRED',
                    source: 'owner_submission',
                    verified: false,
                    dispatchReady: false,
                    requiresGeoReview: true,
""",
        f"{component_name} location review truth",
    )
    path.write_text(source, encoding="utf-8")


backend_path = Path("functions/adminPropertyReview.ts")
backend = backend_path.read_text(encoding="utf-8")
backend = replace_once(
    backend,
    """  "onboarding",
]);
""",
    """  "onboarding",
  "submitted",
  "draft",
  "pending review",
  "admin review",
]);
""",
    "reviewable property states",
)
backend = replace_once(
    backend,
    """const lower = (value: unknown, max = 500) => text(value, max).toLowerCase();

function roleOf""",
    """const lower = (value: unknown, max = 500) => text(value, max).toLowerCase();
const finite = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function canonicalVerifiedGeo(property: Record<string, any>, actorUid: string, now: unknown) {
  const candidate = property.submittedGeo || property.geo || property.location;
  if (!candidate || typeof candidate !== "object") {
    throw new HttpsError("failed-precondition", "A reviewed property location is required before approval.");
  }
  const lat = finite(candidate.lat ?? candidate.latitude);
  const lng = finite(candidate.lng ?? candidate.longitude);
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) {
    throw new HttpsError("failed-precondition", "The submitted property coordinates are invalid.");
  }
  const address = text(candidate.address || property.address, 500);
  const emirate = text(candidate.emirate || property.emirate, 120);
  const city = text(candidate.city || property.city, 120);
  const area = text(candidate.area || property.area, 160);
  if (!address || !emirate || (!city && !area)) {
    throw new HttpsError("failed-precondition", "Address, emirate, and city or area are required before geo verification.");
  }
  const accuracy = finite(candidate.accuracyMeters);
  return {
    point: new admin.firestore.GeoPoint(lat, lng),
    lat,
    lng,
    geohash: text(candidate.geohash, 120),
    address,
    emirate,
    city,
    area,
    placeId: text(candidate.placeId || property.googlePlaceId, 240) || null,
    source: "admin_manual",
    submittedSource: text(candidate.source, 80) || "owner_submission",
    verified: true,
    verifiedBy: actorUid,
    verifiedAt: now,
    updatedAt: now,
    requiresGeoReview: false,
    dispatchReady: true,
    accuracyMeters: accuracy === null ? null : Math.max(0, accuracy),
    capturedAt: candidate.capturedAt || now,
    verificationVersion: 1,
  };
}

function roleOf""",
    "canonical geo validator",
)
backend = replace_once(
    backend,
    """      if (decision === "APPROVE") {
        update.approvedAt = now;
        update.approvedBy = actor.uid;
        update.rejectionReason = FieldValue.delete();
      } else {
""",
    """      let geoDispatchReady = false;
      if (decision === "APPROVE") {
        const canonicalGeo = canonicalVerifiedGeo(property, actor.uid, now);
        update.approvedAt = now;
        update.approvedBy = actor.uid;
        update.rejectionReason = FieldValue.delete();
        update.geo = canonicalGeo;
        update.geoVerification = {
          state: "VERIFIED",
          source: "FOUNDER_MFA_REVIEW",
          verifiedBy: actor.uid,
          verifiedAt: now,
          submittedSource: canonicalGeo.submittedSource,
          verificationVersion: 1,
        };
        geoDispatchReady = true;
      } else {
""",
    "server canonical geo promotion",
)
backend = replace_once(
    backend,
    """        after: { status: nextStatus, reason: decision === "REJECT" ? rejectionReason : null },
""",
    """        after: {
          status: nextStatus,
          reason: decision === "REJECT" ? rejectionReason : null,
          geoDispatchReady,
        },
""",
    "geo audit truth",
)
backend = replace_once(
    backend,
    """      return { propertyName, nextStatus, notificationCreated: Boolean(recipientId) };
""",
    """      return { propertyName, nextStatus, notificationCreated: Boolean(recipientId), geoDispatchReady };
""",
    "transaction result geo truth",
)
backend = replace_once(
    backend,
    """      notificationCreated: result.notificationCreated,
      hardLaunchClaim: false,
""",
    """      notificationCreated: result.notificationCreated,
      geoDispatchReady: result.geoDispatchReady,
      hardLaunchClaim: false,
""",
    "callable response geo truth",
)
backend_path.write_text(backend, encoding="utf-8")


admin_page = Path("apps/admin-panel/src/pages/admin/AdminPropertyApprovalsPage.tsx")
admin_page.write_text("""import React from 'react';
import { Alert, Box, Button, Chip, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { collection, db, functions, httpsCallable, onSnapshot } from '../../lib/firebase';

const pendingStates = ['PENDING', 'PENDING REVIEW', 'ADMIN REVIEW', 'SUBMITTED', 'DRAFT', 'UNKNOWN'];
const normalize = (value: unknown) => String(value || 'UNKNOWN').replace(/_/g, ' ').toUpperCase();
const toMillis = (value: any) => {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value.seconds) return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function AdminPropertyApprovalsPage() {
  const [rows, setRows] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [note, setNote] = React.useState('');
  const [message, setMessage] = React.useState('');
  const [busyId, setBusyId] = React.useState('');

  React.useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'properties'), (snapshot) => {
      const nextRows = snapshot.docs.map((item: any) => ({ id: item.id, ...(item.data() || {}) }));
      nextRows.sort((a, b) => toMillis(b.createdAt || b.updatedAt) - toMillis(a.createdAt || a.updatedAt));
      setRows(nextRows);
      setLoading(false);
    }, () => {
      setMessage('Could not load properties. Check admin Firestore access.');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const pending = rows.filter((row) => pendingStates.some((state) => normalize(row.approvalStatus || row.status || row.onboardingStatus).includes(state)));

  const decide = async (row: any, decision: 'APPROVE' | 'REJECT') => {
    if (decision === 'REJECT' && note.trim().length < 8) {
      setMessage('A rejection reason of at least 8 characters is required.');
      return;
    }
    setBusyId(row.id);
    setMessage('');
    try {
      const reviewOwnerProperty = httpsCallable(functions, 'adminReviewOwnerProperty');
      const response: any = await reviewOwnerProperty({
        propertyId: row.id,
        decision,
        ...(decision === 'REJECT' ? { reason: note.trim() } : {}),
      });
      const geoReady = response?.data?.geoDispatchReady === true;
      setMessage(decision === 'APPROVE'
        ? `Property approved${geoReady ? ' with verified dispatch geography' : ''}.`
        : 'Property rejected and the Owner was notified.');
      setNote('');
    } catch (error: any) {
      setMessage(error?.message || 'Property review failed. No approval state was claimed.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <Box sx={{ p: 4, bgcolor: '#020617', minHeight: '100%', color: '#fff' }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight="950">Property Review Command</Typography>
          <Typography color="rgba(255,255,255,0.6)">Founder-MFA review promotes Owner-submitted coordinates into canonical dispatch geography.</Typography>
        </Box>
        {message && <Alert severity={message.includes('failed') || message.includes('Could not') || message.includes('required') ? 'error' : 'success'}>{message}</Alert>}
        <Paper sx={{ p: 2, bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between">
            <Box><Typography variant="overline" sx={{ color: '#DAA520', fontWeight: 950 }}>Pending review</Typography><Typography variant="h5" color="#fff" fontWeight="950">{pending.length}</Typography></Box>
            <TextField size="small" label="Founder review note / rejection reason" value={note} onChange={(event) => setNote(event.target.value)} sx={{ minWidth: 320 }} />
          </Stack>
        </Paper>
        <Paper sx={{ bgcolor: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
          <Table size="small">
            <TableHead><TableRow><TableCell>Property</TableCell><TableCell>Owner</TableCell><TableCell>Submitted location</TableCell><TableCell>Status</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
            <TableBody>
              {pending.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>{row.propertyName || row.name || row.title || row.id}</TableCell>
                  <TableCell>{row.ownerName || row.ownerEmail || 'Not linked'}</TableCell>
                  <TableCell>{row.submittedGeo?.address || row.address || row.city || row.emirate || 'Not recorded'}</TableCell>
                  <TableCell><Chip size="small" label={normalize(row.approvalStatus || row.status || row.onboardingStatus)} /></TableCell>
                  <TableCell align="right"><Stack direction="row" justifyContent="flex-end" spacing={1}>
                    <Button size="small" variant="contained" disabled={busyId === row.id} onClick={() => decide(row, 'APPROVE')}>Approve & verify geo</Button>
                    <Button size="small" color="error" variant="outlined" disabled={busyId === row.id} onClick={() => decide(row, 'REJECT')}>Reject</Button>
                  </Stack></TableCell>
                </TableRow>
              ))}
              {!loading && pending.length === 0 && <TableRow><TableCell colSpan={5} align="center">No properties pending review.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Paper>
      </Stack>
    </Box>
  );
}
""", encoding="utf-8")


security_path = Path("test/security-rules.test.js")
security = security_path.read_text(encoding="utf-8")
security = replace_once(
    security,
    """import './push-token-security-rules.test.js';
""",
    """import './push-token-security-rules.test.js';
import './property-geo-authority-rules.test.js';
""",
    "property geo rules import",
)
security_path.write_text(security, encoding="utf-8")


Path("test/property-geo-authority-rules.test.js").write_text("""import { after, before, beforeEach, describe, it } from 'node:test';
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

  it('Owner can submit unverified geo evidence but cannot create a verified canonical pin', async () => {
    const ownerDb = testEnv.authenticatedContext('owner_geo', { role: 'owner' }).firestore();
    await assertSucceeds(setDoc(doc(ownerDb, 'properties/submitted'), {
      ownerId: 'owner_geo',
      status: 'pending_admin_approval',
      name: 'Submitted Property',
      submittedGeo,
    }));
    await assertFails(setDoc(doc(ownerDb, 'properties/forged-canonical'), {
      ownerId: 'owner_geo',
      status: 'pending_admin_approval',
      name: 'Forged Property',
      geo: { ...submittedGeo, verified: true, dispatchReady: true, requiresGeoReview: false, verifiedBy: 'owner_geo' },
    }));
    await assertFails(setDoc(doc(ownerDb, 'properties/forged-submission'), {
      ownerId: 'owner_geo',
      status: 'pending_admin_approval',
      name: 'Forged Submission',
      submittedGeo: { ...submittedGeo, verified: true, dispatchReady: true, requiresGeoReview: false },
    }));
  });

  it('Owner and Admin browsers cannot mutate canonical geo, while ordinary fields remain usable', async () => {
    await seed('properties/canonical', {
      ownerId: 'owner_geo',
      ownerUid: 'owner_geo',
      status: 'APPROVED',
      name: 'Canonical Property',
      submittedGeo,
      geo: { ...submittedGeo, source: 'admin_manual', verified: true, dispatchReady: true, requiresGeoReview: false, verifiedBy: 'founder', verifiedAt: 'server-time' },
      geoVerification: { state: 'VERIFIED', verifiedBy: 'founder' },
    });
    const ownerDb = testEnv.authenticatedContext('owner_geo', { role: 'owner' }).firestore();
    const adminDb = testEnv.authenticatedContext('admin_geo', { admin: true, role: 'admin' }).firestore();
    const refOwner = doc(ownerDb, 'properties/canonical');
    const refAdmin = doc(adminDb, 'properties/canonical');

    await assertFails(updateDoc(refOwner, { geo: { ...submittedGeo, verified: true, dispatchReady: true } }));
    await assertFails(updateDoc(refOwner, { geoVerification: { state: 'VERIFIED', verifiedBy: 'owner_geo' } }));
    await assertFails(updateDoc(refAdmin, { geo: { ...submittedGeo, verified: true, dispatchReady: true, verifiedBy: 'admin_geo' } }));
    await assertSucceeds(updateDoc(refAdmin, { adminReviewNote: 'Non-geo administrative correction.' }));
  });

  it('Owner can revise submitted evidence only while it remains explicitly unverified', async () => {
    await seed('properties/review-pending', {
      ownerId: 'owner_geo',
      ownerUid: 'owner_geo',
      status: 'pending_admin_approval',
      name: 'Review Pending',
      submittedGeo,
    });
    const ownerDb = testEnv.authenticatedContext('owner_geo', { role: 'owner' }).firestore();
    const ref = doc(ownerDb, 'properties/review-pending');
    await assertSucceeds(updateDoc(ref, {
      submittedGeo: { ...submittedGeo, area: 'Updated owner evidence' },
      address: 'Updated owner evidence, Al Ain',
    }));
    await assertFails(updateDoc(ref, {
      submittedGeo: { ...submittedGeo, verified: true, dispatchReady: true, requiresGeoReview: false },
    }));
  });
});
""", encoding="utf-8")


launch_test = Path("tests/launch/property-geo-authority.test.mjs")
launch_test.write_text("""import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('canonical property geo is server-authoritative and Owner submissions remain unverified', async () => {
  const [rules, backend, rootLocation, ownerLocation, legacyAdminPage, pinResolver] = await Promise.all([
    read('firestore.rules'),
    read('functions/adminPropertyReview.ts'),
    read('src/components/onboarding/PropertyLocationStep.tsx'),
    read('apps/owner-app/src/components/onboarding/PropertyLocationStep.tsx'),
    read('apps/admin-panel/src/pages/admin/AdminPropertyApprovalsPage.tsx'),
    read('apps/admin-panel/src/lib/verifiedPropertyPin.ts'),
  ]);

  assert.match(rules, /function ownerSubmittedPropertyGeoIsUnverified/);
  assert.match(rules, /function canonicalPropertyGeoUnchanged/);
  assert.match(rules, /safeOwnerPropertyCreate/);
  assert.match(rules, /'geoVerification'/);
  assert.match(rules, /canManageProperties\(\) && canonicalPropertyGeoUnchanged\(\)/);

  for (const component of [rootLocation, ownerLocation]) {
    assert.match(component, /submittedGeo:/);
    assert.match(component, /source: 'owner_submission'/);
    assert.match(component, /verified: false/);
    assert.match(component, /dispatchReady: false/);
    assert.match(component, /requiresGeoReview: true/);
    assert.doesNotMatch(component, /geo: geo as any/);
  }

  assert.match(backend, /canonicalVerifiedGeo/);
  assert.match(backend, /new admin\.firestore\.GeoPoint/);
  assert.match(backend, /update\.geo = canonicalGeo/);
  assert.match(backend, /source: "admin_manual"/);
  assert.match(backend, /verified: true/);
  assert.match(backend, /dispatchReady: true/);
  assert.match(backend, /requiresGeoReview: false/);
  assert.match(backend, /geoDispatchReady/);

  assert.match(legacyAdminPage, /httpsCallable\(functions, 'adminReviewOwnerProperty'\)/);
  assert.doesNotMatch(legacyAdminPage, /updateDoc\s*\(/);
  assert.doesNotMatch(legacyAdminPage, /addDoc\s*\(/);
  assert.doesNotMatch(pinResolver, /owner_submission/);
});
""", encoding="utf-8")


review_test_path = Path("tests/launch/admin-property-review-authority.test.mjs")
review_test = review_test_path.read_text(encoding="utf-8")
review_test = replace_once(
    review_test,
    """  assert.match(backend, /SERVER_AUTHORITATIVE/);
""",
    """  assert.match(backend, /SERVER_AUTHORITATIVE/);
  assert.match(backend, /canonicalVerifiedGeo/);
  assert.match(backend, /update\\.geo = canonicalGeo/);
  assert.match(backend, /geoDispatchReady/);
""",
    "admin property geo assertions",
)
review_test_path.write_text(review_test, encoding="utf-8")
