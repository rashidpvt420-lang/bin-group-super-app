import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const helperSource = readFileSync('functions/technicianLiveLocationCas.ts', 'utf8');
const callableSource = readFileSync('functions/technicianLiveLocation.ts', 'utf8');
const transpiled = ts.transpileModule(helperSource, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2021,
  },
}).outputText;
const cas = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`);

const state = (overrides = {}) => ({
  exists: true,
  isTracking: true,
  trackingSessionId: 'session-A',
  activeTicketId: 'ticket-1',
  lastStoppedTicketId: 'ticket-1',
  expiresAtMs: 1_000,
  ...overrides,
});

test('matching active STOP applies and a duplicate matching STOP is idempotent', () => {
  assert.equal(cas.classifyStopRequest(state(), 'ticket-1', 'session-A'), 'APPLY');
  assert.equal(
    cas.classifyStopRequest(state({ isTracking: false, activeTicketId: '' }), 'ticket-1', 'session-A'),
    'ALREADY_STOPPED',
  );
  assert.equal(
    cas.classifyStopRequest(
      state({ isTracking: false, activeTicketId: '', lastStoppedTicketId: 'ticket-2' }),
      'ticket-1',
      'session-A',
    ),
    'REJECT_SUPERSEDED',
  );
});

test('delayed STOP from session A cannot terminate newer session B', () => {
  const currentSessionB = state({ trackingSessionId: 'session-B', expiresAtMs: 2_000 });
  assert.equal(cas.classifyStopRequest(currentSessionB, 'ticket-1', 'session-A'), 'REJECT_SUPERSEDED');
});

test('an unexpired active session accepts only its exact ticket and session', () => {
  assert.equal(cas.classifyUpdateRequest(state({ expiresAtMs: 5_000 }), 'ticket-1', 'session-A', 2_000), 'APPLY');
  assert.equal(cas.classifyUpdateRequest(state({ expiresAtMs: 5_000 }), 'ticket-1', 'session-B', 2_000), 'REJECT_SUPERSEDED');
  assert.equal(cas.classifyUpdateRequest(state({ expiresAtMs: 5_000 }), 'ticket-2', 'session-A', 2_000), 'REJECT_SUPERSEDED');
  assert.equal(cas.classifyUpdateRequest(state({ expiresAtMs: 1_000 }), 'ticket-1', 'session-B', 2_000), 'APPLY');
  assert.equal(cas.classifyUpdateRequest(state({ isTracking: false }), 'ticket-1', 'session-B', 2_000), 'APPLY');
});

test('STOP for another ticket or missing canonical state fails closed', () => {
  assert.equal(cas.classifyStopRequest(state(), 'ticket-2', 'session-A'), 'REJECT_SUPERSEDED');
  assert.equal(cas.classifyStopRequest(state({ exists: false }), 'ticket-1', 'session-A'), 'REJECT_MISSING');
});

test('watchdog reconciles only the exact still-expired queried session', () => {
  const queried = state({ expiresAtMs: 1_000 });
  assert.equal(cas.classifyWatchdogCandidate(queried, state({ expiresAtMs: 1_000 }), 1_001), 'RECONCILE');
  assert.equal(cas.classifyWatchdogCandidate(queried, state({ expiresAtMs: 1_000 }), 999), 'SKIP_NOT_EXPIRED');
});

test('renewal between watchdog query and transaction commit is skipped', () => {
  const queried = state({ expiresAtMs: 1_000 });
  const renewed = state({ expiresAtMs: 5_000 });
  assert.equal(cas.classifyWatchdogCandidate(queried, renewed, 2_000), 'SKIP_EXPIRY_CHANGED');
});

test('watchdog cannot clear a superseding session or changed ticket', () => {
  const queried = state();
  assert.equal(
    cas.classifyWatchdogCandidate(queried, state({ trackingSessionId: 'session-B' }), 2_000),
    'SKIP_SESSION_SUPERSEDED',
  );
  assert.equal(
    cas.classifyWatchdogCandidate(queried, state({ activeTicketId: 'ticket-2' }), 2_000),
    'SKIP_TICKET_CHANGED',
  );
  assert.equal(
    cas.classifyWatchdogCandidate(queried, state({ isTracking: false }), 2_000),
    'SKIP_NOT_TRACKING',
  );
});

test('server implementation performs STOP, UPDATE and watchdog comparison inside transactions', () => {
  assert.match(callableSource, /classifyStopRequest\(/);
  assert.match(callableSource, /classifyUpdateRequest\(/);
  assert.match(callableSource, /classifyWatchdogCandidate\(/);
  assert.match(callableSource, /for \(const snapshot of stale\.docs\)[\s\S]*db\.runTransaction/);
  assert.doesNotMatch(callableSource, /const batch = db\.batch\(\)/);
  assert.match(callableSource, /TECHNICIAN_LIVE_LOCATION_EXPIRY_SKIPPED/);
  assert.match(callableSource, /reason: decision/);
  assert.match(callableSource, /alreadyStopped: true/);
  assert.match(callableSource, /lastStoppedTicketId: ticketId/);
  assert.match(callableSource, /lastStoppedTicketId: null/);
  const idempotentIndex = callableSource.indexOf('stopDecision === "ALREADY_STOPPED"');
  const stopTicketCheckIndex = callableSource.indexOf('if (!ticketSnap.exists)', idempotentIndex);
  assert.ok(idempotentIndex >= 0 && stopTicketCheckIndex > idempotentIndex, 'duplicate STOP must succeed before ticket assignment is rechecked');
  assert.match(callableSource, /Another unexpired tracking session is active; stale or cross-tab coordinates were rejected/);
});
