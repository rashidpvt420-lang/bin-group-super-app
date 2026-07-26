import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [mapPage, mapTruth, liveTracking, sessionControls] = await Promise.all([
  readFile(new URL('../../apps/admin-panel/src/pages/map/LiveMapPage.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../../apps/admin-panel/src/pages/map/mapTruth.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/utils/liveTracking.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../src/components/PortalSessionControls.tsx', import.meta.url), 'utf8'),
]);

const ordered = (source, fragments) => {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = source.indexOf(fragment, cursor + 1);
    assert.ok(next > cursor, `missing or out-of-order fragment: ${fragment}`);
    cursor = next;
  }
};

test('Admin map resolves ticket markers only through authoritative canonical properties', () => {
  assert.match(mapPage, /collection\(db, 'properties'\)/);
  assert.match(mapPage, /resolveVerifiedTicketPin\(ticket, propertiesById\)/);
  assert.match(mapPage, /verifiedTicketPins/);
  assert.doesNotMatch(mapPage, /const ticketCoordinate/);
  assert.doesNotMatch(mapPage, /ticketsWithCoordinates/);
  assert.match(mapTruth, /geo\.verified === true/);
  assert.match(mapTruth, /dispatchReady === true/);
  assert.match(mapTruth, /requiresGeoReview === true/);
  assert.match(mapTruth, /verifiedBy/);
  assert.match(mapTruth, /verifiedAtMs/);
  assert.match(mapTruth, /adminApproved/);
  assert.match(mapTruth, /trustedSource/);
  assert.doesNotMatch(mapTruth, /resolveVerifiedTicketPin[\s\S]*recordedTicketCoordinate\(ticket\)/);
});

test('unverified recorded coordinates are labelled honestly and never rendered as verified markers', () => {
  assert.match(mapPage, /Recorded coordinate exists but is unverified/);
  assert.match(mapPage, /Open verified property pin/);
  assert.match(mapPage, /Verified property pin missing/);
  assert.match(mapPage, /authoritatively verified property pin/);
  assert.match(mapPage, /Verified canonical property pin/);
  assert.doesNotMatch(mapPage, /Open verified pin/);
  assert.doesNotMatch(mapPage, /verified Firebase ticket pins/);
});

test('GPS freshness expires from a UI clock without waiting for a Firestore snapshot', () => {
  assert.match(mapPage, /setInterval\(\(\) => setNowMs\(Date\.now\(\)\), 15_000\)/);
  assert.match(mapPage, /liveLocationIsFresh\(location, nowMs\)/);
  assert.match(mapPage, /\[liveLocations, nowMs\]/);
  assert.match(mapTruth, /expiresAt <= nowMs/);
  assert.match(mapTruth, /nowMs - updatedAt > 120_000/);
});

test('precise GPS retries use short-lived session storage with expiry and retry caps', () => {
  assert.match(liveTracking, /window\.sessionStorage/);
  assert.doesNotMatch(liveTracking, /window\.localStorage/);
  assert.match(liveTracking, /QUEUE_KEY = 'bin-technician-gps-queue-v2'/);
  assert.match(liveTracking, /UPDATE_TTL_MS = 10 \* 60 \* 1000/);
  assert.match(liveTracking, /STOP_TTL_MS = 30 \* 60 \* 1000/);
  assert.match(liveTracking, /MAX_RETRIES = 5/);
  assert.match(liveTracking, /entry\.expiresAtMs > nowMs/);
  assert.match(liveTracking, /entry\.retryCount < MAX_RETRIES/);
  assert.match(liveTracking, /queueStorage: 'SESSION_ONLY'/);
  assert.match(sessionControls, /sessionStorage\.clear\(\)/);
});

test('pending STOP is replayed before a new session and is not silently discarded', () => {
  ordered(liveTracking, [
    'purgeLiveTrackingQueue(technicianUid)',
    'flushTechnicianQueue(technicianUid)',
    "action === 'STOP'",
    'createTrackingSessionId()',
  ]);
  assert.match(liveTracking, /STOP_REQUEST_QUEUED/);
  assert.match(liveTracking, /STOP_REJECTED/);
  assert.match(liveTracking, /queueHasTechnicianEntries/);
  assert.match(liveTracking, /entry\.technicianUid !== technicianUid[\s\S]*retained\.push\(entry\)/);
  assert.doesNotMatch(liveTracking, /if \(!isCurrentSession\) continue/);
});

test('capture throttling applies before server calls and STOPPED requires acknowledgement', () => {
  ordered(liveTracking, [
    'if (now - _state.lastPushTime < PUSH_INTERVAL_MS) return',
    '_state.lastPushTime = now',
    'await sendAction(action)',
  ]);
  const stopStart = liveTracking.indexOf('export const stopLiveTracking');
  const stopSource = liveTracking.slice(stopStart);
  ordered(stopSource, [
    'await sendAction(stopAction)',
    "status: 'STOPPED'",
  ]);
  assert.match(stopSource, /catch \(error\)[\s\S]*STOP_REQUEST_QUEUED/);
  assert.doesNotMatch(stopSource, /catch \(error\)[\s\S]{0,500}status: 'STOPPED'/);
});
