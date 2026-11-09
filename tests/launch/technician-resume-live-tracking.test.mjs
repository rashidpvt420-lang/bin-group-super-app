import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/technician/pages/TechnicianJobDetailPage.tsx', 'utf8');
const liveTracking = readFileSync('src/utils/liveTracking.ts', 'utf8');

test('en-route technician tracking resumes after refresh or reconnect', () => {
  assert.match(source, /\['EN_ROUTE', 'ON_THE_WAY'\]\.includes\(lifecycleStatus\)/);
  assert.match(source, /readNativeTechnicianInstallationHash\(\)/);
  assert.match(source, /ensureTechnicianInstallationRegistered\(installationHash\)/);
  assert.match(source, /startLiveTracking\(id, user\.uid/);
  assert.match(source, /\[id, user\?\.uid, ticket\?\.status, online, isTracking, actionLoading\]/);
});

test('live tracking startup is idempotent for the same technician mission', () => {
  const tracking = readFileSync('src/utils/liveTracking.ts', 'utf8');
  assert.match(tracking, /let trackingStartPromise: Promise<void> \| null = null/);
  assert.match(tracking, /let trackingStartKey: string \| null = null/);
  assert.match(tracking, /_state\.activeTicketId === ticketId/);
  assert.match(tracking, /_state\.technicianUid === technicianUid/);
  assert.match(tracking, /if \(trackingStartKey === startKey\) return trackingStartPromise/);
});

// P1-6 (audit 9 Nov 2026): the technician shell owns GPS cleanup. Leaving the job page must not stop
// tracking for an en-route job; the shell stops it when the job leaves EN_ROUTE or the shell closes.
test('GPS cleanup follows the hydrated technician identity when the technician shell unmounts', () => {
  const owner = readFileSync('src/technician/hooks/useEnRouteTrackingOwner.ts', 'utf8');
  assert.match(owner, /stopLiveTracking\(uid, undefined, 'PRESERVE'\)/);
  assert.match(owner, /\}, \[uid\]\);/);
  assert.match(readFileSync('src/technician/TechnicianApp.tsx', 'utf8'), /useEnRouteTrackingOwner\(user\?\.uid\)/);
  assert.doesNotMatch(source, /if \(user\?\.uid\) stopLiveTracking\(user\.uid\)\.catch/);
});


test('refresh continuity reuses the recent server-recognized tracking session without persisting coordinates', () => {
  assert.match(liveTracking, /TRACKING_SESSION_STORAGE_PREFIX = 'bin_group_gps_session_v1'/);
  assert.match(liveTracking, /readReusableTrackingSessionId\(technicianUid, ticketId\) \|\| createTrackingSessionId\(\)/);
  assert.match(liveTracking, /persistTrackingSession\(technicianUid, ticketId, sessionId, now\)/);
  assert.match(liveTracking, /clearPersistedTrackingSession\(uid, activeTicketId\)/);
});
