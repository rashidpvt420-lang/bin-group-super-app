import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('src/technician/pages/TechnicianJobDetailPage.tsx', 'utf8');

test('en-route technician tracking resumes after refresh or reconnect', () => {
  assert.match(source, /\['EN_ROUTE', 'ON_THE_WAY'\]\.includes\(lifecycleStatus\)/);
  assert.match(source, /readNativeTechnicianInstallationHash\(\)/);
  assert.match(source, /ensureTechnicianInstallationRegistered\(installationHash\)/);
  assert.match(source, /startLiveTracking\(id, user\.uid/);
  assert.match(source, /\[id, user\?\.uid, ticket\?\.status, online, isTracking\]/);
});

test('live tracking startup is idempotent for the same technician mission', () => {
  const tracking = readFileSync('src/utils/liveTracking.ts', 'utf8');
  assert.match(tracking, /let trackingStartPromise: Promise<void> \| null = null/);
  assert.match(tracking, /let trackingStartKey: string \| null = null/);
  assert.match(tracking, /_state\.activeTicketId === ticketId/);
  assert.match(tracking, /_state\.technicianUid === technicianUid/);
  assert.match(tracking, /if \(trackingStartKey === startKey\) return trackingStartPromise/);
});
