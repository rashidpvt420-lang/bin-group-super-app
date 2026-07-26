from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one marker, found {count}')
    return source.replace(old, new, 1)


function_path = Path('functions/technicianLiveLocation.ts')
function_source = function_path.read_text(encoding='utf-8')
function_source = replace_once(
    function_source,
    """        if (!ticketSnap.exists) throw new HttpsError("not-found", "Assigned mission not found.");
        if (assignedTechnicianId(ticket) !== technicianUid) {
          throw new HttpsError("permission-denied", "You are not assigned to this mission.");
        }

        tx.set(liveRef, {
""",
    """        if (ticketSnap.exists && assignedTechnicianId(ticket) !== technicianUid) {
          throw new HttpsError("permission-denied", "You are not assigned to this mission.");
        }

        tx.set(liveRef, {
""",
    'missing-ticket STOP authority',
)
function_source = replace_once(
    function_source,
    """          activeTicketId: null,
          isTracking: false,
          trackingSessionId,
""",
    """          activeTicketId: null,
          lastStoppedTicketId: ticketId,
          isTracking: false,
          trackingSessionId,
""",
    'record last stopped ticket',
)
function_source = replace_once(
    function_source,
    """        tx.set(ticketRef, {
          trackingStatus: "STOPPED",
          technicianLocationExpiresAt: now,
          updatedAt: now,
        }, { merge: true });
""",
    """        if (ticketSnap.exists) {
          tx.set(ticketRef, {
            trackingStatus: "STOPPED",
            technicianLocationExpiresAt: now,
            updatedAt: now,
          }, { merge: true });
        }
""",
    'skip missing ticket mirror',
)
function_source = replace_once(
    function_source,
    """          isTracking: true,
          trackingSessionId,
          sequence,
""",
    """          isTracking: true,
          trackingSessionId,
          lastStoppedTicketId: null,
          sequence,
""",
    'clear stopped ticket on active session',
)
function_path.write_text(function_source, encoding='utf-8')

helper_path = Path('functions/technicianLiveLocationCas.ts')
helper = helper_path.read_text(encoding='utf-8')
if 'lastStoppedTicketId: string;' not in helper:
    raise SystemExit('CAS helper is missing the reviewed lastStoppedTicketId field')
helper_path.write_text(helper, encoding='utf-8')

test_path = Path('tests/launch/technician-live-location-cas.test.mjs')
test_source = test_path.read_text(encoding='utf-8')
test_source = replace_once(
    test_source,
    """  activeTicketId: 'ticket-1',
  expiresAtMs: 1_000,
""",
    """  activeTicketId: 'ticket-1',
  lastStoppedTicketId: '',
  expiresAtMs: 1_000,
""",
    'test state stopped ticket field',
)
test_source = replace_once(
    test_source,
    """  assert.equal(cas.classifyStopRequest(state({ isTracking: false, activeTicketId: '' }), 'ticket-1', 'session-A'), 'ALREADY_STOPPED');
""",
    """  assert.equal(
    cas.classifyStopRequest(
      state({ isTracking: false, activeTicketId: '', lastStoppedTicketId: 'ticket-1' }),
      'ticket-1',
      'session-A',
    ),
    'ALREADY_STOPPED',
  );
  assert.equal(
    cas.classifyStopRequest(
      state({ isTracking: false, activeTicketId: '', lastStoppedTicketId: 'ticket-1' }),
      'ticket-2',
      'session-A',
    ),
    'REJECT_SUPERSEDED',
  );
""",
    'ticket-bound duplicate STOP test',
)
test_source += """

test('exact canonical STOP can reconcile when its ticket document is missing', () => {
  assert.match(callableSource, /if \(ticketSnap\.exists && assignedTechnicianId\(ticket\) !== technicianUid\)/);
  assert.match(callableSource, /lastStoppedTicketId: ticketId/);
  assert.match(callableSource, /if \(ticketSnap\.exists\) \{\s*tx\.set\(ticketRef/);
  assert.match(callableSource, /lastStoppedTicketId: null/);
});
"""
test_path.write_text(test_source, encoding='utf-8')
