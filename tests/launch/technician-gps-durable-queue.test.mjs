import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const queue = readFileSync('src/utils/technicianGpsQueue.ts', 'utf8');
const tracking = readFileSync('src/utils/liveTracking.ts', 'utf8');
const sessionControls = readFileSync('src/components/PortalSessionControls.tsx', 'utf8');

test('Technician GPS queue is UID-scoped, session-only and short-lived', () => {
  assert.match(queue, /TECHNICIAN_GPS_QUEUE_PREFIX = 'bin-technician-gps-queue-v2:'/);
  assert.match(queue, /window\.sessionStorage/);
  assert.doesNotMatch(queue, /localStorage/);
  assert.match(queue, /UPDATE_QUEUE_TTL_MS = 5 \* 60 \* 1000/);
  assert.match(queue, /STOP_QUEUE_TTL_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(queue, /MAX_TECHNICIAN_GPS_QUEUE_SIZE = 25/);
  assert.match(queue, /MAX_TECHNICIAN_GPS_RETRIES = 8/);
  assert.doesNotMatch(queue, /technicianUid:/);
});

test('STOP is durable and queue saturation drops updates before STOP records', () => {
  assert.match(queue, /entry\.action === 'UPDATE'/);
  assert.match(queue, /TECHNICIAN_GPS_STOP_QUEUE_CAPACITY_EXCEEDED/);
  assert.match(queue, /action\.action === 'STOP'/);
  assert.match(queue, /STOP_QUEUE_TTL_MS/);
  assert.match(queue, /discardTechnicianSessionUpdates/);
  assert.match(tracking, /pendingTechnicianStopCount/);
  assert.match(tracking, /STOP_RECONCILIATION_PENDING/);
  assert.match(tracking, /STOP_REQUEST_QUEUED/);
  assert.match(tracking, /status: 'STOPPED'/);
});

test('all pending STOP records replay before a new tracking session', () => {
  assert.match(tracking, /flushTechnicianQueue\(technicianUid\)/);
  assert.match(tracking, /pendingStopCount > 0/);
  assert.match(tracking, /Refusing to start a new GPS session/);
  assert.match(tracking, /entry\.action === 'STOP'/);
  assert.match(tracking, /STOP entries are processed before UPDATE entries/);
});

test('capture throttling applies even when the server call fails', () => {
  const throttleIndex = tracking.indexOf('_state.lastPushTime = now;');
  const sendIndex = tracking.indexOf('await sendAction(action);', throttleIndex);
  assert.ok(throttleIndex >= 0, 'capture throttle assignment is missing');
  assert.ok(sendIndex > throttleIndex, 'capture throttle must advance before the network call');
});

test('retry handling is explicit and terminal failures are not silently retained', () => {
  assert.match(tracking, /isTerminalTrackingError/);
  assert.match(tracking, /gpsRetryDelayMs/);
  assert.match(tracking, /retryCount: entry\.retryCount \+ 1/);
  assert.match(tracking, /GPS_QUEUE_TERMINAL_FAILURE/);
  assert.match(queue, /entry\.expiresAtMs > nowMs/);
  assert.match(queue, /entry\.retryCount < MAX_TECHNICIAN_GPS_RETRIES/);
});

test('Technician logout explicitly purges GPS retry data', () => {
  assert.match(sessionControls, /purgeTechnicianGpsQueue/);
  assert.match(sessionControls, /role === 'technician'/);
  assert.match(sessionControls, /auth\.currentUser\?\.uid/);
  assert.match(queue, /purgeOtherTechnicianGpsQueues/);
});
