#!/usr/bin/env node

import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';

const PROJECT_ID = 'bin-group-57c60';
const PRODUCTION_URL = 'https://bin-group-57c60.web.app';
const E2E_PROPERTY_ID = 'e2e-live-role-property';

const text = (value) => String(value ?? '').trim();
const finite = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const fail = (message) => {
  throw new Error(`[protected-business-fixtures] ${message}`);
};

if (process.env.GITHUB_ACTIONS !== 'true') fail('GitHub Actions is required.');
if (process.env.GITHUB_WORKFLOW !== 'Firebase Production Deploy') fail('Firebase Production Deploy workflow is required.');
if (process.env.GITHUB_REF !== 'refs/heads/main') fail('refs/heads/main is required.');
if (text(process.env.DEPLOYMENT_ENVIRONMENT).toLowerCase() !== 'production') fail('DEPLOYMENT_ENVIRONMENT=production is required.');
if (text(process.env.PAYMENT_POLICY).toLowerCase() !== 'phase1-manual') fail('PAYMENT_POLICY=phase1-manual is required.');
if (text(process.env.E2E_STRICT_LIVE).toLowerCase() !== 'true') fail('E2E_STRICT_LIVE=true is required.');
if (text(process.env.E2E_BASE_URL).replace(/\/+$/, '') !== PRODUCTION_URL) fail(`E2E_BASE_URL must equal ${PRODUCTION_URL}.`);

const founderEmail = text(process.env.E2E_FOUNDER_EMAIL).toLowerCase();
if (!founderEmail) fail('E2E_FOUNDER_EMAIL is required for Founder-MFA geography authority.');

const projectId = resolveFirebaseAdminProjectId();
if (projectId !== PROJECT_ID) fail(`Expected Firebase project ${PROJECT_ID}; got ${projectId}.`);
initializeFirebaseAdmin(admin, PROJECT_ID);

const founder = await admin.auth().getUserByEmail(founderEmail);
if (founder.disabled || founder.emailVerified !== true) fail('The Founder evidence account must be enabled and email verified.');
const founderRole = text(founder.customClaims?.role || founder.customClaims?.primaryRole).toLowerCase();
if (!['ceo', 'super_admin', 'admin'].includes(founderRole)) fail(`Founder account role is not privileged: ${founderRole || 'missing'}.`);

const db = admin.firestore();
const propertyRef = db.collection('properties').doc(E2E_PROPERTY_ID);
const propertySnap = await propertyRef.get();
if (!propertySnap.exists) fail(`${propertyRef.path} is missing. Run the protected five-role seeder first.`);
const property = propertySnap.data() || {};
const candidate = property.submittedGeo && typeof property.submittedGeo === 'object'
  ? property.submittedGeo
  : property.geo && typeof property.geo === 'object'
    ? property.geo
    : property.location && typeof property.location === 'object'
      ? property.location
      : {};
const lat = finite(candidate.lat ?? candidate.latitude ?? property.lat ?? property.latitude);
const lng = finite(candidate.lng ?? candidate.longitude ?? property.lng ?? property.longitude);
if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) {
  fail(`${propertyRef.path} has invalid coordinates.`);
}

const address = text(candidate.address || property.address || 'E2E Live Role Tower, Al Ain, UAE');
const emirate = text(candidate.emirate || property.emirate || 'Abu Dhabi');
const city = text(candidate.city || property.city || 'Al Ain');
const area = text(candidate.area || property.area || city);
if (!address || !emirate || (!city && !area)) fail(`${propertyRef.path} is missing canonical address evidence.`);
const submittedSource = text(candidate.submittedSource || candidate.source) || 'protected_e2e_fixture';
const accuracy = finite(candidate.accuracyMeters ?? candidate.accuracy);
const verifiedAt = admin.firestore.Timestamp.now();
const serverNow = admin.firestore.FieldValue.serverTimestamp();

const geo = {
  lat,
  lng,
  latitude: lat,
  longitude: lng,
  address,
  emirate,
  city,
  area,
  placeId: text(candidate.placeId || property.googlePlaceId) || null,
  geohash: text(candidate.geohash),
  source: 'admin_manual',
  submittedSource,
  verified: true,
  verifiedBy: founder.uid,
  verifiedAt,
  dispatchReady: true,
  requiresGeoReview: false,
  accuracyMeters: accuracy === null ? null : Math.max(0, accuracy),
  capturedAt: candidate.capturedAt || verifiedAt,
  verificationVersion: 1,
};
const geoVerification = {
  state: 'VERIFIED',
  source: 'FOUNDER_MFA_REVIEW',
  verifiedBy: founder.uid,
  verifiedAt,
  submittedSource,
  verificationVersion: 1,
};

await db.runTransaction(async (transaction) => {
  const fresh = await transaction.get(propertyRef);
  if (!fresh.exists) fail(`${propertyRef.path} disappeared during verification.`);
  transaction.set(propertyRef, {
    address,
    emirate,
    city,
    area,
    geo,
    geoVerification,
    updatedAt: serverNow,
  }, { merge: true });
  transaction.create(db.collection('audit_logs').doc(), {
    action: 'PROTECTED_TENANT_DISPATCH_GEO_VERIFIED',
    actorId: 'github-actions[bot]',
    actorRole: 'system',
    targetType: 'property',
    targetId: E2E_PROPERTY_ID,
    metadata: {
      founderUid: founder.uid,
      founderEmailDomain: founderEmail.split('@')[1] || '',
      verificationSource: 'FOUNDER_MFA_REVIEW',
      workflowRunId: text(process.env.GITHUB_RUN_ID),
      commitSha: text(process.env.GITHUB_SHA),
      sensitiveValuesExcluded: true,
      hardLaunchClaim: false,
    },
    createdAt: serverNow,
  });
});

const verifiedSnap = await propertyRef.get();
const verified = verifiedSnap.data() || {};
const verifiedGeo = verified.geo || {};
const verification = verified.geoVerification || {};
const geoMs = verifiedGeo.verifiedAt?.toMillis?.() || 0;
const verificationMs = verification.verifiedAt?.toMillis?.() || 0;
if (
  verifiedGeo.verified !== true ||
  verifiedGeo.dispatchReady !== true ||
  verifiedGeo.requiresGeoReview === true ||
  verifiedGeo.source !== 'admin_manual' ||
  Number(verifiedGeo.verificationVersion) !== 1 ||
  verification.state !== 'VERIFIED' ||
  verification.source !== 'FOUNDER_MFA_REVIEW' ||
  Number(verification.verificationVersion) !== 1 ||
  text(verifiedGeo.verifiedBy) !== founder.uid ||
  text(verification.verifiedBy) !== founder.uid ||
  !geoMs || geoMs !== verificationMs
) {
  fail('Canonical Founder-MFA geography did not persist exactly.');
}
console.log(`[protected-business-fixtures] PASS property=${E2E_PROPERTY_ID} founder=${founder.uid} dispatchReady=true hardLaunchClaim=false`);
