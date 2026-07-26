from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label} marker count was {count}, expected 1')
    return source.replace(old, new, 1)


path = Path('functions/technicianLiveLocation.ts')
source = path.read_text(encoding='utf-8')
source = replace_once(
    source,
    """  classifyStopRequest,
  classifyWatchdogCandidate,
""",
    """  classifyStopRequest,
  classifyUpdateRequest,
  classifyWatchdogCandidate,
""",
    'update classifier import',
)
source = replace_once(
    source,
    """      const [ticketSnap, liveSnap] = await Promise.all([tx.get(ticketRef), tx.get(liveRef)]);
      if (!ticketSnap.exists) throw new HttpsError("not-found", "Assigned mission not found.");

      const ticket = ticketSnap.data() || {};
      if (assignedTechnicianId(ticket) !== technicianUid) {
        throw new HttpsError("permission-denied", "You are not assigned to this mission.");
      }

      const now = admin.firestore.Timestamp.now();
""",
    """      const [ticketSnap, liveSnap] = await Promise.all([tx.get(ticketRef), tx.get(liveRef)]);
      const ticket = ticketSnap.data() || {};
      const now = admin.firestore.Timestamp.now();
""",
    'defer ticket authorization until mutation is required',
)
source = replace_once(
    source,
    """        if (stopDecision === "ALREADY_STOPPED") {
          const previousExpiryMs = previous.expiresAt?.toMillis?.();
          return {
            action,
            sequence: previousSequence,
            expiresAtMs: Number.isFinite(previousExpiryMs) ? previousExpiryMs : now.toMillis(),
            alreadyStopped: true,
          };
        }

        tx.set(liveRef, {
""",
    """        if (stopDecision === "ALREADY_STOPPED") {
          const previousExpiryMs = previous.expiresAt?.toMillis?.();
          return {
            action,
            sequence: previousSequence,
            expiresAtMs: Number.isFinite(previousExpiryMs) ? previousExpiryMs : now.toMillis(),
            alreadyStopped: true,
          };
        }

        if (!ticketSnap.exists) throw new HttpsError("not-found", "Assigned mission not found.");
        if (assignedTechnicianId(ticket) !== technicianUid) {
          throw new HttpsError("permission-denied", "You are not assigned to this mission.");
        }

        tx.set(liveRef, {
""",
    'authorize mutating STOP after idempotence',
)
source = replace_once(
    source,
    """      if (!ACTIVE_TRACKING_STATUSES.has(upper(ticket.status || ticket.trackingStatus))) {
""",
    """      if (!ticketSnap.exists) throw new HttpsError("not-found", "Assigned mission not found.");
      if (assignedTechnicianId(ticket) !== technicianUid) {
        throw new HttpsError("permission-denied", "You are not assigned to this mission.");
      }

      if (!ACTIVE_TRACKING_STATUSES.has(upper(ticket.status || ticket.trackingStatus))) {
""",
    'authorize update mutation',
)
source = replace_once(
    source,
    """      const trackingSessionId = requireSessionId(request.data?.trackingSessionId);
      if (
        previous.isTracking === true &&
        previous.activeTicketId &&
        previous.activeTicketId !== ticketId &&
        previous.expiresAt?.toMillis?.() > now.toMillis()
      ) {
        throw new HttpsError("failed-precondition", "Another live tracking session is still active.");
      }

      const deviceTimestampMs = Math.max(0, finiteNumber(request.data?.deviceTimestampMs || Date.now(), "deviceTimestampMs"));
""",
    """      const trackingSessionId = requireSessionId(request.data?.trackingSessionId);
      const updateDecision = classifyUpdateRequest(
        liveSessionState(previous, liveSnap.exists),
        ticketId,
        trackingSessionId,
        now.toMillis(),
      );
      if (updateDecision === "REJECT_SUPERSEDED") {
        throw new HttpsError(
          "failed-precondition",
          "Another unexpired tracking session is active; stale or cross-tab coordinates were rejected.",
        );
      }

      const deviceTimestampMs = Math.max(0, finiteNumber(request.data?.deviceTimestampMs || Date.now(), "deviceTimestampMs"));
""",
    'active update session CAS',
)
path.write_text(source, encoding='utf-8')

test_path = Path('tests/launch/technician-live-location-cas.test.mjs')
tests = test_path.read_text(encoding='utf-8')
tests = replace_once(
    tests,
    """test('STOP for another ticket or missing canonical state fails closed', () => {
""",
    """test('an unexpired active session accepts only its exact ticket and session', () => {
  assert.equal(cas.classifyUpdateRequest(state({ expiresAtMs: 5_000 }), 'ticket-1', 'session-A', 2_000), 'APPLY');
  assert.equal(cas.classifyUpdateRequest(state({ expiresAtMs: 5_000 }), 'ticket-1', 'session-B', 2_000), 'REJECT_SUPERSEDED');
  assert.equal(cas.classifyUpdateRequest(state({ expiresAtMs: 5_000 }), 'ticket-2', 'session-A', 2_000), 'REJECT_SUPERSEDED');
  assert.equal(cas.classifyUpdateRequest(state({ expiresAtMs: 1_000 }), 'ticket-1', 'session-B', 2_000), 'APPLY');
  assert.equal(cas.classifyUpdateRequest(state({ isTracking: false }), 'ticket-1', 'session-B', 2_000), 'APPLY');
});

test('STOP for another ticket or missing canonical state fails closed', () => {
""",
    'pure update CAS scenarios',
)
tests = replace_once(
    tests,
    """  assert.match(callableSource, /classifyStopRequest\(/);
  assert.match(callableSource, /classifyWatchdogCandidate\(/);
""",
    """  assert.match(callableSource, /classifyStopRequest\(/);
  assert.match(callableSource, /classifyUpdateRequest\(/);
  assert.match(callableSource, /classifyWatchdogCandidate\(/);
""",
    'callable update CAS assertion',
)
tests = replace_once(
    tests,
    """  assert.match(callableSource, /alreadyStopped: true/);
});
""",
    """  assert.match(callableSource, /alreadyStopped: true/);
  const idempotentIndex = callableSource.indexOf('stopDecision === "ALREADY_STOPPED"');
  const stopTicketCheckIndex = callableSource.indexOf('if (!ticketSnap.exists)', idempotentIndex);
  assert.ok(idempotentIndex >= 0 && stopTicketCheckIndex > idempotentIndex, 'duplicate STOP must succeed before ticket assignment is rechecked');
  assert.match(callableSource, /Another unexpired tracking session is active; stale or cross-tab coordinates were rejected/);
});
""",
    'idempotent STOP ordering assertions',
)
test_path.write_text(tests, encoding='utf-8')

for required in [
    'classifyUpdateRequest(',
    'Another unexpired tracking session is active',
    'stopDecision === "ALREADY_STOPPED"',
]:
    if required not in source:
        raise SystemExit(f'missing final session CAS marker: {required}')
