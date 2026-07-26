import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const tracking = read('src/utils/liveTracking.ts');
const technicianApp = read('src/technician/TechnicianApp.tsx');
const sessionControls = read('src/components/PortalSessionControls.tsx');
const privacyDoc = read('docs/TECHNICIAN_GPS_RETRY_PRIVACY.md');

test('pending STOP actions replay after reload and before a new session', () => {
  assert.match(tracking, /export async function resumeTechnicianTrackingQueue/);
  assert.match(technicianApp, /resumeTechnicianTrackingQueue\(user\.uid\)/);
  assert.match(tracking, /left\.action === 'STOP' \? -1 : 1/);
  assert.match(tracking, /const replay = await resumeTechnicianTrackingQueue\(technicianUid\)/);
  assert.match(tracking, /replay\.pendingStops > 0 \|\| replay\.terminalStops > 0/);
  assert.match(tracking, /STOP_RECONCILIATION_REQUIRED/);
  assert.match(tracking, /previous GPS STOP request/);
});

test('failed STOP remains queued and never produces a false STOPPED diagnostic', () => {
  assert.match(tracking, /status: 'STOP_REQUEST_QUEUED'/);
  assert.match(tracking, /status: 'STOP_RECONCILIATION_FAILED'/);
  assert.match(tracking, /await enqueueAction\(uid, stopAction\)/);
  assert.match(tracking, /status: 'STOPPED'[\s\S]*await sendAction\(stopAction\)/s);
  const failedStopBlock = tracking.slice(
    tracking.indexOf("} catch (error) {\n                try {\n                    await enqueueAction(uid, stopAction)"),
  );
  assert.doesNotMatch(failedStopBlock.slice(0, failedStopBlock.indexOf('} finally {')), /status: 'STOPPED'/);
});

test('capture throttle advances before network work and UPDATEs are coalesced', () => {
  const throttleIndex = tracking.indexOf('_state.lastPushTime = now;');
  const flushIndex = tracking.indexOf('await flushTechnicianTrackingQueue(technicianUid);', throttleIndex);
  const sendIndex = tracking.indexOf('await sendAction(action);', throttleIndex);
  assert.ok(throttleIndex > 0 && flushIndex > throttleIndex && sendIndex > throttleIndex);
  assert.match(tracking, /entry\.action === 'UPDATE'[\s\S]*entry\.trackingSessionId === action\.trackingSessionId/);
  assert.match(tracking, /next\.splice\(oldestUpdateIndex, 1\)/);
  assert.match(tracking, /GPS_QUEUE_SATURATED_WITH_STOP_ACTIONS/);
});

test('queue has explicit retry, expiry and terminal-error handling', () => {
  assert.match(tracking, /MAX_RETRY_ATTEMPTS = 6/);
  assert.match(tracking, /UPDATE_TTL_MS = 15 \* 60 \* 1000/);
  assert.match(tracking, /STOP_TTL_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(tracking, /attempts: entry\.attempts \+ 1|const attempts = entry\.attempts \+ 1/);
  assert.match(tracking, /TERMINAL_CALLABLE_CODES/);
  assert.match(tracking, /retry-limit-exceeded/);
  assert.match(tracking, /entry\.expiresAtMs > nowMs/);
  assert.match(tracking, /scheduleReplay/);
});

test('precise retry data is session-only, UID-hashed and purged on account change/logout', () => {
  assert.match(tracking, /window\.sessionStorage/);
  assert.match(tracking, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(tracking, /purgeForeignTrackingQueues/);
  assert.match(tracking, /export async function purgeTechnicianTrackingQueue/);
  assert.match(tracking, /window\.localStorage\.removeItem\(LEGACY_QUEUE_KEY\)/);
  assert.match(sessionControls, /role === 'technician'/);
  assert.match(sessionControls, /purgeTechnicianTrackingQueue\(auth\.currentUser\?\.uid \|\| undefined\)/);
  assert.doesNotMatch(tracking, /localStorage\.setItem/);
  assert.doesNotMatch(tracking, /type QueuedTrackingAction = \{[\s\S]*technicianUid:/);
  assert.match(privacyDoc, /sessionStorage/);
  assert.match(privacyDoc, /15 minutes/);
  assert.match(privacyDoc, /24 hours/);
  assert.match(privacyDoc, /logout/i);
});

test('STOP queue records contain no coordinates and acknowledged replay clears the old session', () => {
  assert.match(tracking, /if \(value\.action === 'STOP' && value\.point !== undefined\) return false/);
  assert.match(tracking, /queue = queue\.filter\(\(candidate\) => !\([\s\S]*candidate\.trackingSessionId === entry\.trackingSessionId/);
  assert.match(tracking, /stopReplayedAt: serverTimestamp\(\)/);
  assert.match(tracking, /finalStatus: entry\.finalStatus \|\| 'PRESERVE'/);
});
