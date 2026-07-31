#!/usr/bin/env node

import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import { parseCsvRequired } from './lib/hard-launch-control.mjs';

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

const authorizedFounderEmails = parseCsvRequired(
  process.env.AUTHORIZED_FOUNDER_EMAILS,
  'AUTHORIZED_FOUNDER_EMAILS',
);
const configuredFounderEmail = text(process.env.E2E_FOUNDER_EMAIL).toLowerCase();
const founderEmail = configuredFounderEmail || (
  authorizedFounderEmails.length === 1 ? authorizedFounderEmails[0] : ''
);
if (!founderEmail) {
  fail('E2E_FOUNDER_EMAIL is required when AUTHORIZED_FOUNDER_EMAILS does not resolve to exactly one address.');
}
if (!authorizedFounderEmails.includes(founderEmail)) {
  fail('Founder evidence email is not listed in AUTHORIZED_FOUNDER_EMAILS.');
}

const projectId = resolveFirebaseAdminProjectId();
if (projectId !== PROJECT_ID) fail(`Expected Firebase project ${PROJECT_ID}; got ${projectId}.`);
initializeFirebaseAdmin(admin, PROJECT_ID);

const founder = await admin.auth().getUserByEmail(founderEmail);
if (founder.disabled || founder.emailVerified !== true) fail('The Founder evidence account must be enabled and email verified.');
const founderRole = text(founder.customClaims?.role || founder.customClaims?.primaryRole).toLowerCase();
if (!['ceo', 'super_admin', 'admin'].includes(founderRole)) fail(`Founder account role is not privileged: ${founderRole || 'missing'}.`);

const technicianEmail = text(process.env.E2E_TECHNICIAN_EMAIL).toLowerCase();
if (!technicianEmail) fail('E2E_TECHNICIAN_EMAIL is required for protected Tenant and Technician lifecycle evidence.');
const technician = await admin.auth().getUserByEmail(technicianEmail);
if (technician.disabled || technician.emailVerified !== true) fail('The Technician evidence account must be enabled and email verified.');
const technicianRole = text(technician.customClaims?.role || technician.customClaims?.primaryRole).toLowerCase();
if (technicianRole !== 'technician') fail(`Technician account role is invalid: ${technicianRole || 'missing'}.`);

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

const technicianShiftId = `protected-five-role-${text(process.env.GITHUB_RUN_ID) || 'unknown'}-${technician.uid.slice(0, 20)}`;
const credentialExpiry = admin.firestore.Timestamp.fromMillis(Date.now() + (30 * 24 * 60 * 60 * 1000));
const technicianReadiness = {
  role: 'technician',
  userRole: 'technician',
  primaryRole: 'technician',
  status: 'active',
  approvalStatus: 'approved',
  suspended: false,
  onDuty: true,
  dutyStatus: 'on_duty',
  isAvailable: true,
  available: true,
  currentShiftId: technicianShiftId,
  shiftStatus: 'active',
  deviceRegistered: true,
  deviceVerified: true,
  registeredDeviceId: 'protected-five-role-browser',
  medicalCardStatus: 'valid',
  medicalCardExpiry: credentialExpiry,
  drivingLicenseStatus: 'valid',
  drivingLicenseExpiry: credentialExpiry,
  certificationsStatus: 'valid',
  certifications: [{ name: 'Protected E2E Trade', status: 'valid', expiryAt: credentialExpiry }],
  lastGpsAt: verifiedAt,
  gpsMaxAgeMs: 60 * 60 * 1000,
  activeJobCount: 0,
  maxConcurrentJobs: 10,
  protectedFiveRoleEvidenceReady: true,
  protectedFiveRoleEvidenceRunId: text(process.env.GITHUB_RUN_ID),
  updatedAt: serverNow,
};
await Promise.all([
  db.collection('users').doc(technician.uid).set(technicianReadiness, { merge: true }),
  db.collection('technicians').doc(technician.uid).set(technicianReadiness, { merge: true }),
]);
const [technicianUserSnap, technicianProfileSnap] = await Promise.all([
  db.collection('users').doc(technician.uid).get(),
  db.collection('technicians').doc(technician.uid).get(),
]);
for (const [label, record] of [
  ['users', technicianUserSnap.data() || {}],
  ['technicians', technicianProfileSnap.data() || {}],
]) {
  if (
    text(record.status).toLowerCase() !== 'active' ||
    text(record.approvalStatus).toLowerCase() !== 'approved' ||
    record.suspended === true ||
    record.onDuty !== true ||
    record.isAvailable !== true ||
    record.deviceRegistered !== true ||
    record.deviceVerified !== true ||
    text(record.medicalCardStatus).toLowerCase() !== 'valid' ||
    text(record.drivingLicenseStatus).toLowerCase() !== 'valid' ||
    text(record.certificationsStatus).toLowerCase() !== 'valid' ||
    !Array.isArray(record.certifications) || record.certifications.length !== 1 ||
    !text(record.currentShiftId) ||
    !record.lastGpsAt ||
    Number(record.activeJobCount) >= Number(record.maxConcurrentJobs)
  ) {
    fail(`Protected Technician readiness did not persist in ${label}/${technician.uid}.`);
  }
}

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
