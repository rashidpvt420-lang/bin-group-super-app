import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const helperSource = readFileSync('functions/technicianLiveLocationCas.ts', 'utf8');
const callableSource = readFileSync('functions/technicianLiveLocation.ts', 'utf8');
const clientSource = readFileSync('src/utils/liveTracking.ts', 'utf8');
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
  lastStoppedTicketId: '',
  expiresAtMs: 1_000,
  ...overrides,
});

test('matching active STOP applies and a matching duplicate STOP is idempotent', () => {
  assert.equal(cas.classifyStopRequest(state(), 'ticket-1', 'session-A'), 'APPLY');
  const stopped = state({
    isTracking: false,
    activeTicketId: '',
    lastStoppedTicketId: 'ticket-1',
  });
  assert.equal(cas.classifyStopRequest(stopped, 'ticket-1', 'session-A'), 'ALREADY_STOPPED');
  assert.equal(cas.classifyStopRequest(stopped, 'ticket-2', 'session-A'), 'REJECT_SUPERSEDED');
});

test('delayed STOP from session A cannot terminate newer session B', () => {
  const currentSessionB = state({ trackingSessionId: 'session-B', expiresAtMs: 2_000 });
  assert.equal(cas.classifyStopRequest(currentSessionB, 'ticket-1', 'session-A'), 'REJECT_SUPERSEDED');
});

test('missing canonical STOP is applied so the transaction writes a stopped tombstone', () => {
  assert.equal(cas.classifyStopRequest(state(), 'ticket-2', 'session-A'), 'REJECT_SUPERSEDED');
  assert.equal(cas.classifyStopRequest(state({ exists: false }), 'ticket-1', 'session-A'), 'APPLY');
});

test('a stopped tombstone rejects a delayed UPDATE from the same ticket and session', () => {
  const stopped = state({
    isTracking: false,
    activeTicketId: '',
    lastStoppedTicketId: 'ticket-1',
    expiresAtMs: 0,
  });
  assert.equal(cas.classifyUpdateRequest(stopped, 'ticket-1', 'session-A', 2_000), 'REJECT_SUPERSEDED');
  assert.equal(cas.classifyUpdateRequest(stopped, 'ticket-1', 'session-B', 2_000), 'APPLY');
  assert.equal(cas.classifyUpdateRequest(stopped, 'ticket-2', 'session-A', 2_000), 'APPLY');
});

test('unexpired active session rejects cross-tab UPDATE while expired session permits replacement', () => {
  assert.equal(cas.classifyUpdateRequest(state(), 'ticket-1', 'session-A', 900), 'APPLY');
  assert.equal(cas.classifyUpdateRequest(state(), 'ticket-1', 'session-B', 900), 'REJECT_SUPERSEDED');
  assert.equal(cas.classifyUpdateRequest(state(), 'ticket-2', 'session-A', 900), 'REJECT_SUPERSEDED');
  assert.equal(cas.classifyUpdateRequest(state(), 'ticket-2', 'session-B', 1_001), 'APPLY');
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

test('watchdog cannot clear a superseding session, changed ticket, stopped or missing state', () => {
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
  assert.equal(
    cas.classifyWatchdogCandidate(queried, state({ exists: false }), 2_000),
    'SKIP_MISSING',
  );
});

test('server implementation binds STOP and watchdog changes to canonical transaction state', () => {
  assert.match(callableSource, /classifyStopRequest\(/);
  assert.match(callableSource, /classifyUpdateRequest\(/);
  assert.match(callableSource, /classifyWatchdogCandidate\(/);
  assert.match(callableSource, /for \(const snapshot of stale\.docs\)[\s\S]*db\.runTransaction/);
  assert.match(callableSource, /const ticketExists = ticketSnap\.exists/);
  assert.match(callableSource, /lastStoppedTicketId: ticketId/);
  assert.match(callableSource, /lastStoppedTicketId: null/);
  assert.match(callableSource, /if \(ticketExists\) \{\s*tx\.set\(ticketRef/s);
  assert.match(callableSource, /ticketMissing: !ticketExists/);
  assert.match(callableSource, /TECHNICIAN_LIVE_LOCATION_EXPIRY_SKIPPED/);
  assert.match(callableSource, /reason: decision/);
  assert.match(callableSource, /alreadyStopped: true/);
  assert.match(callableSource, /TECHNICIAN_LIVE_LOCATION_STOP_SKIPPED/);
  assert.match(callableSource, /superseded: true/);
  assert.match(callableSource, /currentTrackingSessionId/);
  assert.match(callableSource, /const ticketSnap = ticketRef \? await tx\.get\(ticketRef\) : null/);
  assert.match(callableSource, /if \(ticketRef && ticketSnap\?\.exists\)/);
  assert.match(callableSource, /ticketMissing: Boolean\(ticketId\) && ticketSnap\?\.exists !== true/);
  assert.doesNotMatch(callableSource, /const batch = db\.batch\(\)/);
});

test('superseded STOP is an audited acknowledged no-op and the client does not claim STOPPED', () => {
  const branchStart = callableSource.indexOf('if (stopDecision === "REJECT_SUPERSEDED")');
  const branchEnd = callableSource.indexOf('if (stopDecision === "ALREADY_STOPPED")', branchStart);
  const branch = callableSource.slice(branchStart, branchEnd);
  assert.match(branch, /TECHNICIAN_LIVE_LOCATION_STOP_SKIPPED/);
  assert.match(branch, /superseded: true/);
  assert.match(branch, /currentTicketId/);
  assert.match(branch, /currentTrackingSessionId/);
  assert.match(branch, /reason: "REJECT_SUPERSEDED"/);
  assert.doesNotMatch(branch, /tx\.set\(liveRef/);
  assert.doesNotMatch(branch, /throw new HttpsError/);

  assert.match(clientSource, /stopSuperseded = response\.superseded/);
  assert.match(clientSource, /STOP_SUPERSEDED_RECONCILED/);
  assert.match(clientSource, /canonicalSessionUnchanged: true/);
  assert.match(clientSource, /if \(stopAcknowledged \|\| stopSuperseded \|\| !uid\) detachOnlineRecovery\(\)/);
});

test('missing ticket cleanup remains explicit and never recreates a ghost ticket', () => {
  assert.match(callableSource, /targetType: ticketExists \? "maintenanceTickets" : "technician_live_locations"/);
  assert.match(callableSource, /requestedTicketId: ticketId/);
  assert.match(callableSource, /ticketMissing: !ticketExists/);
  assert.match(callableSource, /targetType: ticketSnap\?\.exists \? "maintenanceTickets" : "technician_live_locations"/);
  assert.doesNotMatch(callableSource, /if \(ticketId\) \{\s*tx\.set\(db\.collection\("maintenanceTickets"\)\.doc\(ticketId\)/);
});

test('missing canonical STOP reaches the standard transaction tombstone path', () => {
  assert.match(helperSource, /if \(!current\.exists\) return "APPLY"/);
  const standardStopStart = callableSource.indexOf('const ticketExists = ticketSnap.exists;');
  const updateStart = callableSource.indexOf('if (!ticketSnap.exists)', standardStopStart);
  const branch = callableSource.slice(standardStopStart, updateStart);
  assert.ok(standardStopStart >= 0 && updateStart > standardStopStart);
  assert.match(branch, /tx\.set\(liveRef/);
  assert.match(branch, /isTracking: false/);
  assert.match(branch, /trackingSessionId/);
  assert.match(branch, /lastStoppedTicketId: ticketId/);
  assert.match(branch, /expiresAt: now/);
});
