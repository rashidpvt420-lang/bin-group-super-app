#!/usr/bin/env node

import crypto from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';

const PROJECT_ID = 'bin-group-57c60';
const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const OUTPUT_PATH = 'launch_package/operational-proof.json';
const SHA256_RE = /^[0-9a-f]{64}$/i;
const COMPLETE_STATUSES = ['COMPLETED_PENDING_APPROVAL', 'COMPLETED', 'CLOSED'];
const MAX_GPS_ACCURACY_METERS = 100;
const MAX_PROPERTY_DISTANCE_METERS = 500;
const text = (value) => String(value ?? '').trim();
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fail = (message) => {
  console.error(`[technician-physical-evidence] FAIL — ${message}`);
  process.exit(1);
};
const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (Number.isFinite(Number(value?._seconds))) return new Date(Number(value._seconds) * 1000);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed) : null;
};
const millis = (value) => toDate(value)?.getTime() || 0;
const canonicalId = (value, label) => {
  const id = text(value);
  if (!/^[A-Za-z0-9_-]{3,180}$/.test(id)) fail(`${label} is missing or invalid`);
  return id;
};
const list = (value) => Array.isArray(value) ? value : [];
const coordinates = (value) => {
  if (!value || typeof value !== 'object') return null;
  const lat = Number(value.lat ?? value.latitude?._latitude ?? value.latitude);
  const lng = Number(value.lng ?? value.longitude?._longitude ?? value.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};
const firstCoordinates = (...values) => values.map(coordinates).find(Boolean) || null;
const radians = (degrees) => degrees * Math.PI / 180;
const haversineMeters = (left, right) => {
  const earthRadiusMeters = 6_371_000;
  const deltaLat = radians(right.lat - left.lat);
  const deltaLng = radians(right.lng - left.lng);
  const lat1 = radians(left.lat);
  const lat2 = radians(right.lat);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

if (process.env.GITHUB_ACTIONS !== 'true') fail('verifier may only run in GitHub Actions');
if (process.env.GITHUB_REPOSITORY !== REPOSITORY || process.env.GITHUB_REF !== 'refs/heads/main') fail('verifier requires protected main');
if (process.env.GITHUB_WORKFLOW !== 'Technician Physical Evidence' || process.env.GITHUB_JOB !== 'verify-physical-evidence') fail('unexpected workflow context');
if (process.env.GITHUB_ACTOR !== 'rashidpvt420-lang') fail('only the authorized founder may run physical evidence');
const commitSha = text(process.env.GITHUB_SHA);
const sourceRunId = text(process.env.GITHUB_RUN_ID);
if (!/^[0-9a-f]{40}$/.test(commitSha) || !/^\d+$/.test(sourceRunId)) fail('exact commit SHA and workflow run ID are required');

const projectId = resolveFirebaseAdminProjectId();
if (projectId !== PROJECT_ID) fail(`unexpected Firebase project: ${projectId}`);
initializeFirebaseAdmin(admin, projectId);
const db = admin.firestore();
const bucket = admin.storage().bucket();

const candidateSnapshots = await Promise.all(
  COMPLETE_STATUSES.map((status) => db.collection('maintenanceTickets').where('status', '==', status).limit(100).get()),
);
const candidates = candidateSnapshots
  .flatMap((snapshot) => snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() || {} })))
  .sort((left, right) => millis(right.data.completedAt || right.data.updatedAt) - millis(left.data.completedAt || left.data.updatedAt));

const ticketRecord = candidates.find(({ data }) => {
  const location = data.arrivedLocation || data.technicianLocation || {};
  const accuracy = Number(location.accuracy);
  return data.physicalDeviceBound === true
    && data.gpsVerified === true
    && text(data.onSiteVerification).toUpperCase() === 'GPS_VERIFIED'
    && SHA256_RE.test(text(data.arrivalInstallationHash))
    && ['android', 'ios'].includes(text(data.arrivalDevicePlatform).toLowerCase())
    && coordinates(location)
    && Number.isFinite(accuracy)
    && accuracy > 0
    && accuracy <= MAX_GPS_ACCURACY_METERS
    && millis(data.arrivedAt) > 0
    && millis(data.startedAt) >= millis(data.arrivedAt)
    && millis(data.completedAt) >= millis(data.startedAt);
});
if (!ticketRecord) fail('no completed production ticket has physical-device binding, verified GPS and ordered lifecycle timestamps');

const ticketId = canonicalId(ticketRecord.id, 'ticket_id');
const ticket = ticketRecord.data;
const technicianId = canonicalId(ticket.assignedTechnicianId || ticket.technicianId, 'technician_id');
const propertyId = canonicalId(ticket.propertyId, 'property_id');
const [userSnap, technicianSnap, propertySnap] = await Promise.all([
  db.collection('users').doc(technicianId).get(),
  db.collection('technicians').doc(technicianId).get(),
  db.collection('properties').doc(propertyId).get(),
]);
if (!propertySnap.exists) fail('ticket property record is missing');
const profile = { ...(userSnap.data() || {}), ...(technicianSnap.data() || {}) };
const property = propertySnap.data() || {};
const registeredHash = text(profile.registeredInstallationHash || profile.registeredDeviceIdHash);
const arrivalHash = text(ticket.arrivalInstallationHash);
const platform = text(ticket.arrivalDevicePlatform).toLowerCase();
if (profile.deviceRegistered !== true || !SHA256_RE.test(registeredHash) || registeredHash !== arrivalHash) fail('ticket installation hash does not match the registered technician installation');
if (text(profile.registeredDevicePlatform).toLowerCase() !== platform) fail('ticket platform does not match the registered technician platform');

const arrivalCoordinates = coordinates(ticket.arrivedLocation || ticket.technicianLocation);
const propertyCoordinates = firstCoordinates(
  ticket.jobLocation,
  ticket.propertyLocation,
  ticket.serviceLocation,
  property.location,
  property.coordinates,
  property.geo,
  property.gps,
  property,
);
if (!arrivalCoordinates || !propertyCoordinates) fail('arrival or property GPS coordinates are missing');
const propertyDistanceMeters = haversineMeters(arrivalCoordinates, propertyCoordinates);
if (!Number.isFinite(propertyDistanceMeters) || propertyDistanceMeters > MAX_PROPERTY_DISTANCE_METERS) {
  fail(`technician arrival is ${Math.round(propertyDistanceMeters)}m from the property; maximum is ${MAX_PROPERTY_DISTANCE_METERS}m`);
}

const beforeRefs = [
  ticket.beforePhotoUrl,
  ...list(ticket.beforePhotos),
  ...list(ticket.tenantPhotos),
  ...list(ticket.photos),
  ...list(ticket.initialPhotoUrls),
].map(text).filter(Boolean);
const afterRefs = [
  ticket.afterPhotoUrl,
  ...list(ticket.afterPhotos),
  ...list(ticket.completionPhotos),
  ...list(ticket.proofPhotos),
  ...list(ticket.evidencePhotos),
].map(text).filter(Boolean);

const storagePath = (value) => {
  if (value.startsWith('gs://')) {
    const withoutScheme = value.slice(5);
    const slash = withoutScheme.indexOf('/');
    if (slash < 1 || withoutScheme.slice(0, slash) !== bucket.name) return '';
    return withoutScheme.slice(slash + 1);
  }
  const firebaseMatch = value.match(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?]+)/i);
  if (firebaseMatch && firebaseMatch[1] === bucket.name) return decodeURIComponent(firebaseMatch[2]);
  const googleMatch = value.match(/^https:\/\/storage\.googleapis\.com\/([^/]+)\/(.+)$/i);
  if (googleMatch && googleMatch[1] === bucket.name) return decodeURIComponent(googleMatch[2]);
  if (/^(maintenanceTickets|tickets|maintenance-requests)\//.test(value)) return value;
  return '';
};
const [maintenanceTicketFiles] = await bucket.getFiles({ prefix: 'maintenanceTickets/', autoPaginate: true });
const [ticketFiles] = await bucket.getFiles({ prefix: 'tickets/', autoPaginate: true });
const [maintenanceRequestFiles] = await bucket.getFiles({ prefix: 'maintenance-requests/', autoPaginate: true });
const storedObjectNames = new Set([
  ...maintenanceTicketFiles.map((file) => file.name),
  ...ticketFiles.map((file) => file.name),
  ...maintenanceRequestFiles.map((file) => file.name),
]);
const findStoredEvidence = (references) => {
  for (const reference of references) {
    const objectPath = storagePath(reference);
    if (objectPath && storedObjectNames.has(objectPath)) return { objectPath, referenceHash: hash(reference) };
  }
  return null;
};

const beforeStored = findStoredEvidence(beforeRefs);
const afterStored = findStoredEvidence(afterRefs);
if (!beforeStored) fail('before-photo evidence does not resolve to an existing production Storage object');
if (!afterStored) fail('after-photo evidence does not resolve to an existing production Storage object');
if (text(ticket.technicianNotes || ticket.notes).length < 10) fail('completion notes are missing');

const observedAt = new Date().toISOString();
const proof = {
  schemaVersion: 1,
  status: 'passed',
  generatedByWorkflow: true,
  gateKey: 'technicianPhysicalGpsEvidence',
  evidenceType: 'physical-device-report',
  commitSha,
  projectId,
  sourceRunId,
  sourceSystem: 'Firebase technician lifecycle, registered installation, property geofence and Cloud Storage',
  observedAt,
  physicalDevice: true,
  gpsCaptured: true,
  beforePhotoStored: true,
  afterPhotoStored: true,
  ticketId,
  deviceIdHash: arrivalHash,
  technicianUidHash: hash(technicianId),
  platform,
  gpsAccuracyMeters: Number((ticket.arrivedLocation || ticket.technicianLocation).accuracy),
  propertyDistanceMeters: Math.round(propertyDistanceMeters * 100) / 100,
  arrivedAt: toDate(ticket.arrivedAt).toISOString(),
  startedAt: toDate(ticket.startedAt).toISOString(),
  completedAt: toDate(ticket.completedAt).toISOString(),
  beforeObjectHash: hash(beforeStored.objectPath),
  afterObjectHash: hash(afterStored.objectPath),
  checks: [
    { name: 'registered mobile installation matched arrival', status: 'passed', reference: `firestore://maintenanceTickets/${ticketId}#physical-device` },
    { name: 'arrival GPS accuracy and property distance recomputed', status: 'passed', reference: `firestore://maintenanceTickets/${ticketId}#gps-geofence` },
    { name: 'before evidence exists in Cloud Storage inventory', status: 'passed', reference: `storage-sha256://${beforeStored.referenceHash}` },
    { name: 'after evidence exists in Cloud Storage inventory', status: 'passed', reference: `storage-sha256://${afterStored.referenceHash}` },
  ],
};
mkdirSync('launch_package', { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
console.log(`[technician-physical-evidence] PASS ticket=${ticketId} platform=${platform} distance=${Math.round(propertyDistanceMeters)}m`);
