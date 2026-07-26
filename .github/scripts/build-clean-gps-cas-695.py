from pathlib import Path
import subprocess

SOURCE_COMMIT = '6d1edb943650182c69020e5918718952f43b95dc'


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label} marker count was {count}, expected 1')
    return source.replace(old, new, 1)


def git_show(path: str) -> str:
    return subprocess.check_output(
        ['git', 'show', f'{SOURCE_COMMIT}:{path}'],
        text=True,
        encoding='utf-8',
    )


server_path = Path('functions/technicianLiveLocation.ts')
server = git_show(str(server_path))
server = replace_once(
    server,
    '''          activeTicketId: null,
          isTracking: false,
          trackingSessionId,
''',
    '''          activeTicketId: null,
          lastStoppedTicketId: ticketId,
          isTracking: false,
          trackingSessionId,
''',
    'direct STOP stopped-ticket provenance',
)
server = replace_once(
    server,
    '''        activeTicketId: ticketId,
        propertyId: String(ticket.propertyId || "") || null,
''',
    '''        activeTicketId: ticketId,
        lastStoppedTicketId: null,
        propertyId: String(ticket.propertyId || "") || null,
''',
    'new tracking-session provenance reset',
)
server = replace_once(
    server,
    '''          activeTicketId: null,
          isTracking: false,
          stopReason: "SERVER_EXPIRY_WATCHDOG",
''',
    '''          activeTicketId: null,
          lastStoppedTicketId: ticketId,
          isTracking: false,
          stopReason: "SERVER_EXPIRY_WATCHDOG",
''',
    'watchdog stopped-ticket provenance',
)
if server.count('lastStoppedTicketId: ticketId,') != 2:
    raise SystemExit('direct STOP and watchdog must both persist lastStoppedTicketId')
if server.count('lastStoppedTicketId: null,') != 1:
    raise SystemExit('a new UPDATE session must clear lastStoppedTicketId')
server_path.write_text(server, encoding='utf-8')


maps_path = Path('tests/launch/maps-gps-product-truth.test.mjs')
maps = maps_path.read_text(encoding='utf-8')
maps = replace_once(
    maps,
    '''test('Server watchdog clears abandoned foreground tracking sessions', () => {
  assert.match(locationCallable, /reconcileExpiredTechnicianLiveLocations = onSchedule/);
  assert.match(locationCallable, /schedule: "every 5 minutes"/);
  assert.match(locationCallable, /where\("isTracking", "==", true\)/);
  assert.match(locationCallable, /where\("expiresAt", "<=", now\)/);
  assert.match(locationCallable, /SERVER_EXPIRY_WATCHDOG/);
  assert.match(locationCallable, /TECHNICIAN_LIVE_LOCATION_EXPIRED/);
  const watchdogIndex = indexes.indexes.find((entry) => entry.collectionGroup === 'technician_live_locations');
  assert.deepEqual(watchdogIndex?.fields, [
    { fieldPath: 'isTracking', order: 'ASCENDING' },
    { fieldPath: 'expiresAt', order: 'ASCENDING' },
  ]);
});
''',
    '''test('Server watchdog clears only the exact still-expired canonical tracking session', () => {
  assert.match(locationCallable, /reconcileExpiredTechnicianLiveLocations = onSchedule/);
  assert.match(locationCallable, /schedule: "every 5 minutes"/);
  assert.match(locationCallable, /where\("isTracking", "==", true\)/);
  assert.match(locationCallable, /where\("expiresAt", "<=", queryNow\)/);
  assert.match(locationCallable, /for \(const snapshot of stale\.docs\)[\s\S]*db\.runTransaction/);
  assert.match(locationCallable, /classifyWatchdogCandidate\(/);
  assert.match(locationCallable, /TECHNICIAN_LIVE_LOCATION_EXPIRY_SKIPPED/);
  assert.match(locationCallable, /SERVER_EXPIRY_WATCHDOG/);
  assert.match(locationCallable, /TECHNICIAN_LIVE_LOCATION_EXPIRED/);
  assert.doesNotMatch(locationCallable, /const batch = db\.batch\(\)/);
  const watchdogIndex = indexes.indexes.find((entry) => entry.collectionGroup === 'technician_live_locations');
  assert.deepEqual(watchdogIndex?.fields, [
    { fieldPath: 'isTracking', order: 'ASCENDING' },
    { fieldPath: 'expiresAt', order: 'ASCENDING' },
  ]);
});
''',
    'watchdog launch contract',
)
maps_path.write_text(maps, encoding='utf-8')
