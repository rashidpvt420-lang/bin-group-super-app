from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label} marker count was {count}, expected 1')
    return source.replace(old, new, 1)


source_path = Path('functions/technicianLiveLocation.ts')
source = source_path.read_text(encoding='utf-8')

source = replace_once(
    source,
    '''        if (!ticketSnap.exists) throw new HttpsError("not-found", "Assigned mission not found.");
        if (assignedTechnicianId(ticket) !== technicianUid) {
          throw new HttpsError("permission-denied", "You are not assigned to this mission.");
        }

        tx.set(liveRef, {''',
    '''        const ticketExists = ticketSnap.exists;
        if (ticketExists && assignedTechnicianId(ticket) !== technicianUid) {
          throw new HttpsError("permission-denied", "You are not assigned to this mission.");
        }

        tx.set(liveRef, {''',
    'matching STOP ticket existence handling',
)

source = replace_once(
    source,
    '''          isTracking: false,
          trackingSessionId,
          stopReason: "TECHNICIAN_REQUESTED",''',
    '''          isTracking: false,
          trackingSessionId,
          lastStoppedTicketId: ticketId,
          stopReason: "TECHNICIAN_REQUESTED",''',
    'persist last stopped ticket identity',
)

source = replace_once(
    source,
    '''        tx.set(ticketRef, {
          trackingStatus: "STOPPED",
          technicianLocationExpiresAt: now,
          updatedAt: now,
        }, { merge: true });
        tx.set(diagnosticRef, {''',
    '''        if (ticketExists) {
          tx.set(ticketRef, {
            trackingStatus: "STOPPED",
            technicianLocationExpiresAt: now,
            updatedAt: now,
          }, { merge: true });
        }
        tx.set(diagnosticRef, {''',
    'skip only missing ticket write',
)

source = replace_once(
    source,
    '''          action: "TECHNICIAN_LIVE_LOCATION_STOPPED",
          targetType: "maintenanceTickets",
          targetId: ticketId,
          trackingSessionId,
          createdAt: now,''',
    '''          action: "TECHNICIAN_LIVE_LOCATION_STOPPED",
          targetType: ticketExists ? "maintenanceTickets" : "technician_live_locations",
          targetId: ticketExists ? ticketId : technicianUid,
          requestedTicketId: ticketId,
          ticketMissing: !ticketExists,
          trackingSessionId,
          createdAt: now,''',
    'missing ticket audit binding',
)

source_path.write_text(source, encoding='utf-8')

test_path = Path('tests/launch/technician-live-location-cas.test.mjs')
tests = test_path.read_text(encoding='utf-8')

tests = replace_once(
    tests,
    '''  activeTicketId: 'ticket-1',
  expiresAtMs: 1_000,''',
    '''  activeTicketId: 'ticket-1',
  lastStoppedTicketId: 'ticket-1',
  expiresAtMs: 1_000,''',
    'idempotent STOP state fixture',
)

tests = replace_once(
    tests,
    '''  assert.match(callableSource, /alreadyStopped: true/);
  const idempotentIndex = callableSource.indexOf('stopDecision === "ALREADY_STOPPED"');
  const stopTicketCheckIndex = callableSource.indexOf('if (!ticketSnap.exists)', idempotentIndex);
  assert.ok(idempotentIndex >= 0 && stopTicketCheckIndex > idempotentIndex, 'duplicate STOP must succeed before ticket assignment is rechecked');
  assert.match(callableSource, /Another unexpired tracking session is active; stale or cross-tab coordinates were rejected/);''',
    '''  assert.match(callableSource, /alreadyStopped: true/);
  assert.match(callableSource, /lastStoppedTicketId: ticketId/);
  assert.match(callableSource, /const ticketExists = ticketSnap\.exists/);
  assert.match(callableSource, /if \(ticketExists && assignedTechnicianId\(ticket\) !== technicianUid\)/);
  assert.match(callableSource, /if \(ticketExists\) \{\s*tx\.set\(ticketRef/s);
  assert.match(callableSource, /ticketMissing: !ticketExists/);
  assert.match(callableSource, /targetType: ticketExists \? "maintenanceTickets" : "technician_live_locations"/);
  const idempotentIndex = callableSource.indexOf('stopDecision === "ALREADY_STOPPED"');
  const ticketExistsIndex = callableSource.indexOf('const ticketExists = ticketSnap.exists', idempotentIndex);
  assert.ok(idempotentIndex >= 0 && ticketExistsIndex > idempotentIndex, 'duplicate STOP must succeed before ticket assignment is rechecked');
  const stopBlock = callableSource.slice(callableSource.indexOf('if (action === "STOP")'), callableSource.indexOf('if (!ticketSnap.exists)', ticketExistsIndex));
  assert.doesNotMatch(stopBlock, /throw new HttpsError\("not-found", "Assigned mission not found\."\)/);
  assert.match(callableSource, /Another unexpired tracking session is active; stale or cross-tab coordinates were rejected/);''',
    'missing ticket and duplicate STOP source contracts',
)

test_path.write_text(tests, encoding='utf-8')

for required in [
    'lastStoppedTicketId: ticketId',
    'const ticketExists = ticketSnap.exists',
    'ticketMissing: !ticketExists',
    'if (ticketExists) {',
]:
    if required not in source:
        raise SystemExit(f'missing final STOP marker: {required}')
