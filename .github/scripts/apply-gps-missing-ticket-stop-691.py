from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label} marker count was {count}, expected 1')
    return source.replace(old, new, 1)


source_path = Path('functions/technicianLiveLocation.ts')
source = source_path.read_text(encoding='utf-8')

old_authorization = '''        if (!ticketSnap.exists) throw new HttpsError("not-found", "Assigned mission not found.");
        if (assignedTechnicianId(ticket) !== technicianUid) {
          throw new HttpsError("permission-denied", "You are not assigned to this mission.");
        }

        tx.set(liveRef, {'''
new_authorization = '''        const ticketExists = ticketSnap.exists;
        if (ticketExists && assignedTechnicianId(ticket) !== technicianUid) {
          throw new HttpsError("permission-denied", "You are not assigned to this mission.");
        }

        tx.set(liveRef, {'''
if old_authorization in source:
    source = replace_once(source, old_authorization, new_authorization, 'matching STOP ticket existence handling')
elif new_authorization not in source:
    raise SystemExit('matching STOP authorization is neither reviewed old nor reviewed new form')

old_ticket_write = '''        tx.set(ticketRef, {
          trackingStatus: "STOPPED",
          technicianLocationExpiresAt: now,
          updatedAt: now,
        }, { merge: true });
        tx.set(diagnosticRef, {'''
new_ticket_write = '''        if (ticketExists) {
          tx.set(ticketRef, {
            trackingStatus: "STOPPED",
            technicianLocationExpiresAt: now,
            updatedAt: now,
          }, { merge: true });
        }
        tx.set(diagnosticRef, {'''
if old_ticket_write in source:
    source = replace_once(source, old_ticket_write, new_ticket_write, 'skip only missing ticket write')
elif new_ticket_write not in source:
    raise SystemExit('ticket write is neither reviewed old nor reviewed conditional form')

old_audit = '''          action: "TECHNICIAN_LIVE_LOCATION_STOPPED",
          targetType: "maintenanceTickets",
          targetId: ticketId,
          trackingSessionId,
          createdAt: now,'''
new_audit = '''          action: "TECHNICIAN_LIVE_LOCATION_STOPPED",
          targetType: ticketExists ? "maintenanceTickets" : "technician_live_locations",
          targetId: ticketExists ? ticketId : technicianUid,
          requestedTicketId: ticketId,
          ticketMissing: !ticketExists,
          trackingSessionId,
          createdAt: now,'''
if old_audit in source:
    source = replace_once(source, old_audit, new_audit, 'missing ticket audit binding')
elif new_audit not in source:
    raise SystemExit('STOP audit is neither reviewed old nor reviewed missing-ticket form')

if 'lastStoppedTicketId: ticketId' not in source:
    raise SystemExit('STOP must persist lastStoppedTicketId before missing-ticket reconciliation')

source_path.write_text(source, encoding='utf-8')

test_path = Path('tests/launch/technician-live-location-cas.test.mjs')
tests = test_path.read_text(encoding='utf-8')
old_assertions = '''  assert.match(callableSource, /lastStoppedTicketId: ticketId/);
  assert.match(callableSource, /lastStoppedTicketId: null/);
  const idempotentIndex = callableSource.indexOf('stopDecision === "ALREADY_STOPPED"');
  const stopTicketCheckIndex = callableSource.indexOf('if (!ticketSnap.exists)', idempotentIndex);
  assert.ok(idempotentIndex >= 0 && stopTicketCheckIndex > idempotentIndex, 'duplicate STOP must succeed before ticket assignment is rechecked');
  assert.match(callableSource, /Another unexpired tracking session is active; stale or cross-tab coordinates were rejected/);'''
new_assertions = '''  assert.match(callableSource, /lastStoppedTicketId: ticketId/);
  assert.match(callableSource, /lastStoppedTicketId: null/);
  assert.match(callableSource, /const ticketExists = ticketSnap\\.exists/);
  assert.match(callableSource, /if \\(ticketExists && assignedTechnicianId\\(ticket\\) !== technicianUid\\)/);
  assert.match(callableSource, /if \\(ticketExists\\) \\{\\s*tx\\.set\\(ticketRef/s);
  assert.match(callableSource, /ticketMissing: !ticketExists/);
  assert.match(callableSource, /targetType: ticketExists \\? "maintenanceTickets" : "technician_live_locations"/);
  const idempotentIndex = callableSource.indexOf('stopDecision === "ALREADY_STOPPED"');
  const ticketExistsIndex = callableSource.indexOf('const ticketExists = ticketSnap.exists', idempotentIndex);
  assert.ok(idempotentIndex >= 0 && ticketExistsIndex > idempotentIndex, 'duplicate STOP must succeed before ticket assignment is rechecked');
  const updateTicketCheckIndex = callableSource.indexOf('if (!ticketSnap.exists)', ticketExistsIndex);
  const stopBlock = callableSource.slice(callableSource.indexOf('if (action === "STOP")'), updateTicketCheckIndex);
  assert.doesNotMatch(stopBlock, /throw new HttpsError\\("not-found", "Assigned mission not found\\."\\)/);
  assert.match(callableSource, /Another unexpired tracking session is active; stale or cross-tab coordinates were rejected/);'''
if old_assertions in tests:
    tests = replace_once(tests, old_assertions, new_assertions, 'missing-ticket STOP source contracts')
elif 'ticketMissing: !ticketExists' not in tests:
    raise SystemExit('CAS tests are neither reviewed old nor reviewed missing-ticket form')

test_path.write_text(tests, encoding='utf-8')

for required in [
    'lastStoppedTicketId: ticketId',
    'const ticketExists = ticketSnap.exists',
    'ticketMissing: !ticketExists',
    'if (ticketExists) {',
]:
    if required not in source:
        raise SystemExit(f'missing final STOP marker: {required}')
