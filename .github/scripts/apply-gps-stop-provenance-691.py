from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label} marker count was {count}, expected 1')
    return source.replace(old, new, 1)


callable_path = Path('functions/technicianLiveLocation.ts')
source = callable_path.read_text(encoding='utf-8')
source = replace_once(
    source,
    '''          activeTicketId: null,
          isTracking: false,
          trackingSessionId,
''',
    '''          activeTicketId: null,
          lastStoppedTicketId: ticketId,
          isTracking: false,
          trackingSessionId,
''',
    'direct STOP provenance',
)
source = replace_once(
    source,
    '''        activeTicketId: ticketId,
        propertyId: String(ticket.propertyId || "") || null,
''',
    '''        activeTicketId: ticketId,
        lastStoppedTicketId: null,
        propertyId: String(ticket.propertyId || "") || null,
''',
    'new session provenance reset',
)
source = replace_once(
    source,
    '''          activeTicketId: null,
          isTracking: false,
          stopReason: "SERVER_EXPIRY_WATCHDOG",
''',
    '''          activeTicketId: null,
          lastStoppedTicketId: ticketId,
          isTracking: false,
          stopReason: "SERVER_EXPIRY_WATCHDOG",
''',
    'watchdog STOP provenance',
)
if source.count('lastStoppedTicketId: ticketId,') != 2:
    raise SystemExit('expected direct and watchdog stopped-ticket provenance')
if source.count('lastStoppedTicketId: null,') != 1:
    raise SystemExit('expected one new-session provenance reset')
callable_path.write_text(source, encoding='utf-8')


test_path = Path('tests/launch/technician-live-location-cas.test.mjs')
tests = test_path.read_text(encoding='utf-8')
tests = replace_once(
    tests,
    '''  activeTicketId: 'ticket-1',
  expiresAtMs: 1_000,
''',
    '''  activeTicketId: 'ticket-1',
  lastStoppedTicketId: '',
  expiresAtMs: 1_000,
''',
    'state stopped-ticket default',
)
tests = replace_once(
    tests,
    "assert.equal(cas.classifyStopRequest(state({ isTracking: false, activeTicketId: '' }), 'ticket-1', 'session-A'), 'ALREADY_STOPPED');",
    "assert.equal(cas.classifyStopRequest(state({ isTracking: false, activeTicketId: '', lastStoppedTicketId: 'ticket-1' }), 'ticket-1', 'session-A'), 'ALREADY_STOPPED');",
    'idempotent STOP scenario',
)
tests = replace_once(
    tests,
    "  assert.equal(cas.classifyStopRequest(state(), 'ticket-2', 'session-A'), 'REJECT_SUPERSEDED');\n",
    "  assert.equal(cas.classifyStopRequest(state(), 'ticket-2', 'session-A'), 'REJECT_SUPERSEDED');\n  assert.equal(cas.classifyStopRequest(state({ isTracking: false, activeTicketId: '', lastStoppedTicketId: 'ticket-1' }), 'ticket-2', 'session-A'), 'REJECT_SUPERSEDED');\n",
    'wrong-ticket duplicate STOP scenario',
)
tests = replace_once(
    tests,
    '''  assert.match(callableSource, /alreadyStopped: true/);
''',
    '''  assert.match(callableSource, /alreadyStopped: true/);
  assert.equal((callableSource.match(/lastStoppedTicketId: ticketId/g) || []).length, 2);
  assert.match(callableSource, /lastStoppedTicketId: null/);
''',
    'server provenance assertions',
)
test_path.write_text(tests, encoding='utf-8')
