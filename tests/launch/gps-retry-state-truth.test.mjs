import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const queueSource = readFileSync('src/utils/gpsRetryQueue.ts', 'utf8');
const trackingSource = readFileSync('src/utils/liveTracking.ts', 'utf8');
const technicianJobSource = readFileSync('src/technician/pages/TechnicianJobDetailPage.tsx', 'utf8');
const logoutSource = readFileSync('src/components/PortalSessionControls.tsx', 'utf8');
const transpiledQueue = ts.transpileModule(queueSource, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2021 },
}).outputText;
const queue = await import(`data:text/javascript;base64,${Buffer.from(transpiledQueue).toString('base64')}`);

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const storage = () => ({ stop: new MemoryStorage(), update: new MemoryStorage() });
const update = (overrides = {}) => ({
  action: 'UPDATE',
  ticketId: 'ticket-old',
  technicianUid: 'tech-1',
  trackingSessionId: 'session-old',
  point: { latitude: 24.4539, longitude: 54.3773, accuracy: 10, deviceTimestampMs: 1000 },
  queuedAtMs: 1000,
  ...overrides,
});
const stop = (overrides = {}) => ({
  action: 'STOP',
  ticketId: 'ticket-old',
  technicianUid: 'tech-1',
  trackingSessionId: 'session-old',
  queuedAtMs: 1000,
  ...overrides,
});

test('new mission boundary destroys every queued coordinate but retains the authenticated STOP', () => {
  const stores = storage();
  queue.enqueueGpsRetryAction(update(), stores, 1000);
  queue.enqueueGpsRetryAction(stop(), stores, 1000);
  queue.enqueueGpsRetryAction(update({ ticketId: 'ticket-other', trackingSessionId: 'session-other' }), stores, 1100);

  queue.purgeGpsQueuesExceptTechnician('tech-1', stores);
  const remaining = queue.readGpsRetryQueue(stores, 1200);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].action, 'STOP');
  assert.equal(remaining[0].technicianUid, 'tech-1');
  assert.equal('point' in remaining[0], false);
});

test('account change removes another Technician STOP and all coordinate retries', () => {
  const stores = storage();
  queue.enqueueGpsRetryAction(stop({ technicianUid: 'tech-old' }), stores, 1000);
  queue.enqueueGpsRetryAction(update({ technicianUid: 'tech-old' }), stores, 1000);
  queue.enqueueGpsRetryAction(stop({ technicianUid: 'tech-new', ticketId: 'ticket-new', trackingSessionId: 'session-new' }), stores, 1000);

  queue.purgeGpsQueuesExceptTechnician('tech-new', stores);
  const remaining = queue.readGpsRetryQueue(stores, 1100);
  assert.deepEqual(remaining.map((entry) => [entry.action, entry.technicianUid]), [['STOP', 'tech-new']]);
});

test('permanent UPDATE rejection is discarded immediately and never becomes a tombstone', async () => {
  const stores = storage();
  queue.enqueueGpsRetryAction(update(), stores, 1000);
  const result = await queue.replayGpsRetryQueue('tech-1', async () => {
    const error = new Error('denied');
    error.code = 'functions/permission-denied';
    throw error;
  }, stores, 1000);

  assert.equal(result.failed, 1);
  assert.equal(result.discardedPermanentUpdates, 1);
  assert.equal(result.terminal, 0);
  assert.deepEqual(queue.readGpsRetryQueue(stores, 1001), []);
});

test('permanent STOP rejection becomes a coordinate-free terminal tombstone on first attempt', async () => {
  const stores = storage();
  queue.enqueueGpsRetryAction(stop(), stores, 1000);
  const result = await queue.replayGpsRetryQueue('tech-1', async () => {
    const error = new Error('missing');
    error.code = 'not-found';
    throw error;
  }, stores, 1000);

  assert.equal(result.failed, 1);
  assert.equal(result.terminal, 1);
  assert.equal(result.pendingStops, 1);
  const remaining = queue.readGpsRetryQueue(stores, 1001);
  assert.equal(remaining[0].terminal, true);
  assert.equal('point' in remaining[0], false);
});

test('terminal STOP requires an explicit ticket/session reconciliation decision', async () => {
  const stores = storage();
  queue.enqueueGpsRetryAction(stop(), stores, 1000);
  await queue.replayGpsRetryQueue('tech-1', async () => {
    const error = new Error('invalid');
    error.code = 'invalid-argument';
    throw error;
  }, stores, 1000);

  assert.equal(queue.terminalGpsStops('tech-1', stores, 1001).length, 1);
  queue.resolveTerminalGpsStop('tech-1', 'wrong-ticket', 'session-old', stores);
  assert.equal(queue.terminalGpsStops('tech-1', stores, 1001).length, 1);
  queue.resolveTerminalGpsStop('tech-1', 'ticket-old', 'session-old', stores);
  assert.equal(queue.terminalGpsStops('tech-1', stores, 1001).length, 0);
});

test('transient STOP failure remains retryable and blocks later UPDATE replay', async () => {
  const stores = storage();
  queue.enqueueGpsRetryAction(stop(), stores, 1000);
  queue.enqueueGpsRetryAction(update(), stores, 1000);
  const attempted = [];
  const result = await queue.replayGpsRetryQueue('tech-1', async (entry) => {
    attempted.push(entry.action);
    if (entry.action === 'STOP') {
      const error = new Error('offline');
      error.code = 'unavailable';
      throw error;
    }
  }, stores, 1000);

  assert.deepEqual(attempted, ['STOP']);
  assert.equal(result.failed, 1);
  assert.equal(result.pendingStops, 1);
});

test('source contract keeps UPDATE memory-only and removes every legacy persistent queue', () => {
  assert.match(queueSource, /update: memoryUpdateStorage/);
  assert.doesNotMatch(queueSource, /update:\s*safeStorage\('sessionStorage'\)/);
  assert.match(queueSource, /bin-technician-gps-update-queue-v2/);
  assert.match(queueSource, /session\?\.removeItem\(key\)/);
  assert.match(queueSource, /entry\.action === 'STOP' && entry\.technicianUid === uid/);
});

test('tracking start resolves only with installed watch evidence and blocks pending STOPs', () => {
  assert.match(trackingSource, /Promise<LiveTrackingStartResult>/);
  assert.match(trackingSource, /watchInstalled: true/);
  assert.match(trackingSource, /if \(!Number\.isFinite\(watchId\)\)/);
  assert.match(trackingSource, /purgeGpsQueuesExceptTechnician\(technicianUid\)/);
  assert.match(trackingSource, /discardQueuedUpdatesForTechnician\(technicianUid\)/);
  assert.match(trackingSource, /if \(replay\.pendingStops > 0\)/);
  assert.match(trackingSource, /STOP_RECONCILIATION_TERMINAL/);
  assert.match(technicianJobSource, /await startLiveTracking[\s\S]*setIsTracking\(true\)/);
});

test('throttling happens before replay/network and permanent coordinates are not queued', () => {
  const throttleIndex = trackingSource.indexOf('if (now - _state.lastPushTime < CAPTURE_INTERVAL_MS) return;');
  const replayIndex = trackingSource.indexOf('await replayForTechnician(technicianUid, ticketId);', throttleIndex);
  assert.ok(throttleIndex >= 0 && replayIndex > throttleIndex);
  assert.match(trackingSource, /if \(isPermanentGpsCallableError\(error\)\)[\s\S]*coordinateRetainedInBrowserStorage: false/);
  assert.match(trackingSource, /LOCATION_SYNC_QUEUED_MEMORY_ONLY/);
});

test('secure logout explicitly purges authenticated GPS retry state before storage clear', () => {
  const purgeIndex = logoutSource.indexOf('purgeTechnicianGpsRetryQueue(authenticatedUid)');
  const localClearIndex = logoutSource.indexOf('localStorage.clear()');
  assert.ok(purgeIndex >= 0 && localClearIndex > purgeIndex);
});
