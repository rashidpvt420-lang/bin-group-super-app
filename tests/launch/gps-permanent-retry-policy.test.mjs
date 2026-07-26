import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync('src/utils/gpsRetryQueue.ts', 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2021,
  },
}).outputText;
const queue = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`);

const createStorage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
};

const storage = () => ({ stop: createStorage(), update: createStorage() });
const stopInput = (overrides = {}) => ({
  action: 'STOP',
  ticketId: 'ticket-1',
  technicianUid: 'tech-1',
  trackingSessionId: 'session-1',
  queuedAtMs: 1_000,
  ...overrides,
});

test('permanent Firebase callable codes are classified terminal immediately', () => {
  for (const code of [
    'functions/permission-denied',
    'functions/unauthenticated',
    'functions/invalid-argument',
    'functions/not-found',
  ]) {
    assert.deepEqual(queue.classifyGpsRetryError({ code }), { code, terminal: true });
  }
  assert.deepEqual(
    queue.classifyGpsRetryError({ code: 'functions/unavailable' }),
    { code: 'functions/unavailable', terminal: false },
  );
});

test('a permanent STOP failure becomes a coordinate-free terminal tombstone on first attempt', async () => {
  const selected = storage();
  queue.enqueueGpsRetryAction(stopInput(), selected, 1_000);
  const result = await queue.replayGpsRetryQueue(
    'tech-1',
    async () => { throw Object.assign(new Error('denied'), { code: 'functions/permission-denied' }); },
    selected,
    1_000,
  );

  assert.deepEqual(result, { attempted: 1, succeeded: 0, failed: 1, terminal: 1, pendingStops: 1 });
  const [entry] = queue.readGpsRetryQueue(selected, 1_000);
  assert.equal(entry.action, 'STOP');
  assert.equal(entry.point, undefined);
  assert.equal(entry.terminal, true);
  assert.equal(entry.retryCount, 8);
  assert.equal(entry.terminalReason, 'PERMANENT_CALLABLE_ERROR');
  assert.equal(entry.lastErrorCode, 'functions/permission-denied');

  let senderCalls = 0;
  const second = await queue.replayGpsRetryQueue('tech-1', async () => { senderCalls += 1; }, selected, 2_000);
  assert.equal(senderCalls, 0);
  assert.equal(second.terminal, 1);
  assert.equal(second.pendingStops, 1);

  // Terminal STOP intent remains after the ordinary 24-hour TTL.
  assert.equal(queue.readGpsRetryQueue(selected, 1_000 + (48 * 60 * 60 * 1000)).length, 1);
});

test('a transient callable failure retains exponential retry semantics', async () => {
  const selected = storage();
  queue.enqueueGpsRetryAction(stopInput(), selected, 10_000);
  const result = await queue.replayGpsRetryQueue(
    'tech-1',
    async () => { throw Object.assign(new Error('offline'), { code: 'functions/unavailable' }); },
    selected,
    10_000,
  );
  assert.equal(result.terminal, 0);
  assert.equal(result.pendingStops, 1);
  const [entry] = queue.readGpsRetryQueue(selected, 10_000);
  assert.equal(entry.terminal, false);
  assert.equal(entry.retryCount, 1);
  assert.equal(entry.terminalReason, undefined);
  assert.ok(entry.nextAttemptAtMs > 10_000);
});

test('manual terminal STOP removal requires exact server reconciliation proof', async () => {
  const selected = storage();
  queue.enqueueGpsRetryAction(stopInput(), selected, 20_000);
  await queue.replayGpsRetryQueue(
    'tech-1',
    async () => { throw Object.assign(new Error('missing'), { code: 'functions/not-found' }); },
    selected,
    20_000,
  );

  assert.throws(() => queue.clearTerminalGpsStopAfterServerReconciliation({
    technicianUid: 'tech-1',
    ticketId: 'ticket-1',
    trackingSessionId: 'session-1',
    serverReconciled: false,
  }, selected), /GPS_STOP_RECONCILIATION_PROOF_REQUIRED/);

  assert.throws(() => queue.clearTerminalGpsStopAfterServerReconciliation({
    technicianUid: 'tech-1',
    ticketId: 'wrong-ticket',
    trackingSessionId: 'session-1',
    serverReconciled: true,
  }, selected), /GPS_TERMINAL_STOP_NOT_FOUND/);

  queue.clearTerminalGpsStopAfterServerReconciliation({
    technicianUid: 'tech-1',
    ticketId: 'ticket-1',
    trackingSessionId: 'session-1',
    serverReconciled: true,
  }, selected);
  assert.equal(queue.hasPendingGpsStop('tech-1', selected, 20_001), false);
});

test('new mission disposal removes all precise UPDATE retries but preserves STOP intent', () => {
  const selected = storage();
  queue.enqueueGpsRetryAction(stopInput(), selected, 30_000);
  queue.enqueueGpsRetryAction({
    action: 'UPDATE',
    ticketId: 'ticket-old',
    technicianUid: 'tech-1',
    trackingSessionId: 'session-old',
    point: { latitude: 24.2, longitude: 55.7, accuracy: 8 },
    queuedAtMs: 30_001,
  }, selected, 30_001);
  queue.discardAllQueuedUpdates('tech-1', selected);
  const entries = queue.readGpsRetryQueue(selected, 30_002);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].action, 'STOP');
  assert.equal(entries[0].point, undefined);
});

test('source contract never retries permanent failures to the generic cap', () => {
  assert.match(source, /PERMANENT_CALLABLE_CODES/);
  assert.match(source, /classifyGpsRetryError\(error\)/);
  assert.match(source, /disposition\.terminal \? MAX_RETRY_COUNT : nextRetryCount/);
  assert.match(source, /PERMANENT_CALLABLE_ERROR/);
  assert.match(source, /GPS_STOP_RECONCILIATION_PROOF_REQUIRED/);
  assert.match(source, /terminalGpsStopsForTechnician/);
});
