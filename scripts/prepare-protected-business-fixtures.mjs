#!/usr/bin/env node

import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';

const PROJECT_ID = 'bin-group-57c60';
const PRODUCTION_URL = 'https://bin-group-57c60.web.app';
const PAYMENT_CONFIG_PATH = 'system_payment_config/current';
const E2E_PROPERTY_ID = 'e2e-live-role-property';
const BENEFICIARY = 'BIN GROUP L.L.C - S.P.C';
const OFFICE_LOCATION = String(
  process.env.PHASE1_CASH_CHEQUE_OFFICE_LOCATION
  || 'BIN GROUP Headquarters, Al Ain, United Arab Emirates',
).trim();

const fail = (message) => {
  throw new Error(`[protected-business-fixtures] ${message}`);
};
const text = (value) => String(value ?? '').trim();
const finite = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

if (process.env.GITHUB_ACTIONS !== 'true') fail('GitHub Actions is required.');
if (process.env.GITHUB_WORKFLOW !== 'Firebase Production Deploy') fail('Firebase Production Deploy workflow is required.');
if (process.env.GITHUB_REF !== 'refs/heads/main') fail('refs/heads/main is required.');
if (text(process.env.DEPLOYMENT_ENVIRONMENT).toLowerCase() !== 'production') fail('DEPLOYMENT_ENVIRONMENT=production is required.');
if (text(process.env.PAYMENT_POLICY).toLowerCase() !== 'phase1-manual') fail('PAYMENT_POLICY=phase1-manual is required.');
if (text(process.env.E2E_STRICT_LIVE).toLowerCase() !== 'true') fail('E2E_STRICT_LIVE=true is required.');
if (text(process.env.E2E_BASE_URL).replace(/\/+$/, '') !== PRODUCTION_URL) fail(`E2E_BASE_URL must equal ${PRODUCTION_URL}.`);
if (!OFFICE_LOCATION) fail('A Cash/Cheque office location is required.');

const projectId = resolveFirebaseAdminProjectId();
if (projectId !== PROJECT_ID) fail(`Expected Firebase project ${PROJECT_ID}; got ${projectId}.`);
initializeFirebaseAdmin(admin, PROJECT_ID);

const db = admin.firestore();
const paymentRef = db.doc(PAYMENT_CONFIG_PATH);
const propertyRef = db.collection('properties').doc(E2E_PROPERTY_ID);
const now = admin.firestore.Timestamp.now();
const serverNow = admin.firestore.FieldValue.serverTimestamp();

await db.runTransaction(async (transaction) => {
  const [paymentSnap, propertySnap] = await Promise.all([
    transaction.get(paymentRef),
    transaction.get(propertyRef),
  ]);
  if (!propertySnap.exists) fail(`${propertyRef.path} is missing. Run the protected five-role seeder first.`);

  const existingPayment = paymentSnap.data() || {};
  transaction.set(paymentRef, {
    status: 'ACTIVE',
    version: 'phase1-cash-cheque-v1',
    effectiveAt: existingPayment.effectiveAt || now,
    updatedAt: serverNow,
    legalBeneficiary: BENEFICIARY,
    beneficiaryName: BENEFICIARY,
    currency: 'AED',
    approvedMethods: ['CASH', 'CHEQUE'],
    officeLocation: OFFICE_LOCATION,
    cashOfficeLocation: OFFICE_LOCATION,
    bankTransferEnabled: false,
    stripeEnabled: false,
    bankName: admin.firestore.FieldValue.delete(),
    accountNumber: admin.firestore.FieldValue.delete(),
    iban: admin.firestore.FieldValue.delete(),
    swiftBic: admin.firestore.FieldValue.delete(),
    swift: admin.firestore.FieldValue.delete(),
    bic: admin.firestore.FieldValue.delete(),
    source: 'protected-production-phase1-policy',
  }, { merge: true });

  const property = propertySnap.data() || {};
  const existingGeo = property.geo && typeof property.geo === 'object' ? property.geo : {};
  const existingVerification = property.geoVerification && typeof property.geoVerification === 'object'
    ? property.geoVerification
    : {};
  const lat = finite(existingGeo.lat ?? existingGeo.latitude ?? property.lat ?? property.latitude);
  const lng = finite(existingGeo.lng ?? existingGeo.longitude ?? property.lng ?? property.longitude);
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) {
    fail(`${propertyRef.path} has invalid coordinates.`);
  }
  const verifiedBy = text(existingGeo.verifiedBy || existingVerification.verifiedBy || property.ownerUid || property.ownerId);
  if (!verifiedBy) fail(`${propertyRef.path} has no verification actor.`);
  const address = text(existingGeo.address || property.address || 'E2E Live Role Tower, Al Ain, UAE');
  const emirate = text(existingGeo.emirate || property.emirate || 'Abu Dhabi');
  const city = text(existingGeo.city || property.city || 'Al Ain');
  const area = text(existingGeo.area || property.area || 'Al Ain');
  const verifiedAt = now;

  transaction.set(propertyRef, {
    address,
    emirate,
    city,
    area,
    geo: {
      ...existingGeo,
      lat,
      lng,
      latitude: lat,
      longitude: lng,
      address,
      emirate,
      city,
      area,
      placeId: existingGeo.placeId || null,
      geohash: text(existingGeo.geohash),
      source: 'admin_manual',
      submittedSource: text(existingGeo.submittedSource) || 'protected_e2e_fixture',
      verified: true,
      verifiedBy,
      verifiedAt,
      dispatchReady: true,
      requiresGeoReview: false,
      accuracyMeters: finite(existingGeo.accuracyMeters ?? existingGeo.accuracy),
      capturedAt: existingGeo.capturedAt || verifiedAt,
      verificationVersion: 1,
    },
    geoVerification: {
      ...existingVerification,
      state: 'VERIFIED',
      source: 'FOUNDER_MFA_REVIEW',
      verifiedBy,
      verifiedAt,
      submittedSource: text(existingVerification.submittedSource) || 'protected_e2e_fixture',
      verificationVersion: 1,
    },
    updatedAt: serverNow,
  }, { merge: true });

  transaction.create(db.collection('audit_logs').doc(), {
    action: 'PROTECTED_BUSINESS_FIXTURES_PREPARED',
    actorId: 'github-actions[bot]',
    actorRole: 'system',
    targetType: 'production_launch_evidence',
    targetId: process.env.GITHUB_RUN_ID || 'unknown',
    metadata: {
      paymentPolicy: 'phase1-manual',
      paymentConfigPath: PAYMENT_CONFIG_PATH,
      propertyId: E2E_PROPERTY_ID,
      sensitiveValuesExcluded: true,
      hardLaunchClaim: false,
    },
    createdAt: serverNow,
  });
});

console.log('[protected-business-fixtures] PASS payment=CASH,CHEQUE bankTransfer=false stripe=false geo=canonical');
