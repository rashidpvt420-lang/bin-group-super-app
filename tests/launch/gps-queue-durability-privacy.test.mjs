import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const tracking = readFileSync('src/utils/liveTracking.ts', 'utf8');
const sessionControls = readFileSync('src/components/PortalSessionControls.tsx', 'utf8');

const ordered = (source, fragments) => {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = source.indexOf(fragment, cursor + 1);
    assert.notEqual(next, -1, `missing fragment: ${fragment}`);
    assert.ok(next > cursor, `fragment is out of order: ${fragment}`);
    cursor = next;
  }
};

test('pending STOP actions replay before a new tracking session can start', () => {
  ordered(tracking, [
    'purgeOtherTechnicianQueues(technicianUid);',
    'ensureQueueReplayListener(technicianUid);',
    'const replay = await flushLiveTrackingQueue(technicianUid);',
    'if (replay.pendingStopCount > 0 || replay.terminalStopCount > 0)',
    '_state.trackingSessionId = createTrackingSessionId();',
    'navigator.geolocation.watchPosition(',
  ]);
  assert.match(tracking, /A previous GPS STOP is still queued/);
  assert.match(tracking, /STOP_RECONCILIATION_REQUIRED/);
  assert.doesNotMatch(tracking, /if \(!isCurrentSession\) continue/);
});

test('STOPPED is recorded only after the server acknowledges STOP', () => {
  const stopStart = tracking.indexOf('export const stopLiveTracking');
  const stopSource = tracking.slice(stopStart);
  ordered(stopSource, [
    'let acknowledged = false;',
    'await sendAction(stopAction);',
    'acknowledged = true;',
    "status: 'STOP_REQUEST_QUEUED'",
    'if (acknowledged)',
    "status: 'STOPPED'",
  ]);
  assert.match(tracking, /stopAcknowledgedAt: serverTimestamp\(\)/);
  assert.match(tracking, /stopRequestedAt: serverTimestamp\(\)/);
});

test('capture throttling advances before a failed network call can enqueue again', () => {
  ordered(tracking, [
    'if (now - _state.lastPushTime < CAPTURE_THROTTLE_MS) return;',
    '_state.lastPushTime = now;',
    'await sendAction(action);',
    'enqueueAction(technicianUid, action);',
  ]);
  assert.match(tracking, /CAPTURE_THROTTLE_MS = 10_000/);
});

test('queue has retry, expiry, terminal and explicit saturation disposal policy', () => {
  assert.match(tracking, /QUEUE_TTL_MS = 30 \* 60_000/);
  assert.match(tracking, /MAX_RETRY_ATTEMPTS = 5/);
  assert.match(tracking, /RETRY_BASE_DELAY_MS = 5_000/);
  assert.match(tracking, /status: terminal \? 'TERMINAL' : 'RETRYING'/);
  assert.match(tracking, /nextAttemptAtMs/);
  assert.match(tracking, /expiresAtMs/);
  assert.match(tracking, /Explicitly disposed .* expired\/saturated queue actions/);
  assert.match(tracking, /entry\.status === 'TERMINAL'/);
  assert.match(tracking, /entry\.action === 'UPDATE'/);
});

test('precise retry data is UID-scoped, session-only and purged on account change/logout', () => {
  assert.match(tracking, /QUEUE_KEY_PREFIX = 'bin-technician-gps-queue-v2:'/);
  assert.match(tracking, /window\.sessionStorage/);
  assert.match(tracking, /encodeURIComponent\(technicianUid\)/);
  assert.match(tracking, /function minimalPoint/);
  assert.match(tracking, /value\.toFixed\(decimals\)/);
  assert.match(tracking, /round\(Number\(point\.latitude \?\? point\.lat\), 6\)/);
  assert.match(tracking, /round\(Number\(point\.longitude \?\? point\.lng\), 6\)/);
  assert.match(tracking, /purgeOtherTechnicianQueues/);
  assert.match(tracking, /export function purgeLiveTrackingQueue/);
  assert.doesNotMatch(tracking, /window\.localStorage/);

  const queueType = tracking.slice(tracking.indexOf('type QueuedTrackingAction'), tracking.indexOf('type QueueFlushResult'));
  assert.doesNotMatch(queueType, /technicianUid|email|displayName|authToken|idToken/);

  assert.match(sessionControls, /import \{ purgeLiveTrackingQueue \} from '\.\.\/utils\/liveTracking'/);
  assert.match(sessionControls, /role === 'technician'/);
  assert.match(sessionControls, /purgeLiveTrackingQueue\(auth\.currentUser\?\.uid \|\| undefined\)/);
});

test('online replay listener remains until the UID-scoped queue is empty', () => {
  assert.match(tracking, /function ensureQueueReplayListener/);
  assert.match(tracking, /window\.addEventListener\('online', _state\.onlineHandler\)/);
  assert.match(tracking, /function releaseQueueReplayListenerIfIdle/);
  assert.match(tracking, /if \(readQueue\(technicianUid\)\.length > 0\) return/);
  assert.match(tracking, /window\.removeEventListener\('online', _state\.onlineHandler\)/);
});
