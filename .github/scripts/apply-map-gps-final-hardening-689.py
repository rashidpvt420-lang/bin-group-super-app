from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label} marker count was {count}, expected 1')
    return source.replace(old, new, 1)


queue_path = Path('src/utils/gpsRetryQueue.ts')
queue = queue_path.read_text(encoding='utf-8')

queue = replace_once(
    queue,
    """  const retryCount = Math.max(0, Math.floor(finite(source.retryCount) ?? 0));
  const nextAttemptAtMs = Math.max(0, Math.floor(finite(source.nextAttemptAtMs) ?? queuedAtMs ?? nowMs));
  if (!ticketId || !technicianUid || !trackingSessionId || queuedAtMs === null || expiresAtMs === null) return null;
  if (expiresAtMs <= nowMs) return null;
  const point = action === 'UPDATE' ? sanitizePoint(source.point) : undefined;
""",
    """  const retryCount = Math.max(0, Math.floor(finite(source.retryCount) ?? 0));
  const terminal = source.terminal === true || retryCount >= MAX_RETRY_COUNT;
  const nextAttemptAtMs = Math.max(0, Math.floor(finite(source.nextAttemptAtMs) ?? queuedAtMs ?? nowMs));
  if (!ticketId || !technicianUid || !trackingSessionId || queuedAtMs === null || expiresAtMs === null) return null;
  // Terminal STOP records are coordinate-free reconciliation tombstones. They
  // survive the ordinary STOP TTL until explicit secure purge or successful
  // operational reconciliation; otherwise a new mission could start falsely.
  if (expiresAtMs <= nowMs && !(action === 'STOP' && terminal)) return null;
  const point = action === 'UPDATE' ? sanitizePoint(source.point) : undefined;
""",
    'terminal STOP TTL preservation',
)
queue = replace_once(
    queue,
    """    terminal: source.terminal === true || retryCount >= MAX_RETRY_COUNT,
""",
    """    terminal,
""",
    'sanitized terminal flag',
)
queue = replace_once(
    queue,
    """const writeQueues = (storage: QueueStorage, entries: QueuedGpsAction[]) => {
  writeList(storage.stop, STOP_QUEUE_KEY, entries.filter((entry) => entry.action === 'STOP'), MAX_STOP_QUEUE_SIZE);
  writeList(storage.update, UPDATE_QUEUE_KEY, entries.filter((entry) => entry.action === 'UPDATE'), MAX_UPDATE_QUEUE_SIZE);
};
""",
    """const boundedStopEntries = (entries: QueuedGpsAction[]) => {
  const stops = entries
    .filter((entry) => entry.action === 'STOP')
    .sort((left, right) => left.queuedAtMs - right.queuedAtMs || left.id.localeCompare(right.id));
  // STOP intent is never evicted to make room. Losing either a pending STOP or
  // a terminal reconciliation tombstone could let a new tracking session make
  // a false LIVE claim, so saturation fails closed instead.
  if (stops.length > MAX_STOP_QUEUE_SIZE) throw new Error('GPS_STOP_QUEUE_CAPACITY_EXCEEDED');
  return stops;
};

const writeQueues = (storage: QueueStorage, entries: QueuedGpsAction[]) => {
  writeList(storage.stop, STOP_QUEUE_KEY, boundedStopEntries(entries), MAX_STOP_QUEUE_SIZE);
  writeList(storage.update, UPDATE_QUEUE_KEY, entries.filter((entry) => entry.action === 'UPDATE'), MAX_UPDATE_QUEUE_SIZE);
};
""",
    'non-evictable STOP queue',
)

queue_path.write_text(queue, encoding='utf-8')

tracking_path = Path('src/utils/liveTracking.ts')
tracking = tracking_path.read_text(encoding='utf-8')
tracking = replace_once(
    tracking,
    """        onError?.(message);
        return;
    }

    if (!readiness.secureContext) {
""",
    """        onError?.(message);
        throw new Error(message);
    }

    if (!readiness.secureContext) {
""",
    'unsupported geolocation rejection',
)
tracking = replace_once(
    tracking,
    """        onError?.(message);
        return;
    }

    if (_state.watchId !== null) navigator.geolocation.clearWatch(_state.watchId);
""",
    """        onError?.(message);
        throw new Error(message);
    }

    if (_state.watchId !== null) navigator.geolocation.clearWatch(_state.watchId);
""",
    'insecure context rejection',
)
tracking = replace_once(
    tracking,
    """        onError?.(message);
        return;
    }

    _state.activeTicketId = ticketId;
""",
    """        onError?.(message);
        throw new Error(message);
    }

    _state.activeTicketId = ticketId;
""",
    'pending STOP rejection',
)
tracking_path.write_text(tracking, encoding='utf-8')

test_path = Path('tests/launch/map-gps-state-behavior.test.mjs')
tests = test_path.read_text(encoding='utf-8')
tests = replace_once(
    tests,
    """const queue = loadTypeScriptModule('src/utils/gpsRetryQueue.ts');
const pins = loadTypeScriptModule('apps/admin-panel/src/lib/verifiedPropertyPin.ts');
""",
    """const queue = loadTypeScriptModule('src/utils/gpsRetryQueue.ts');
const pins = loadTypeScriptModule('apps/admin-panel/src/lib/verifiedPropertyPin.ts');
const liveTrackingSource = readFileSync('src/utils/liveTracking.ts', 'utf8');
""",
    'live tracking source fixture',
)
tests += r'''

test('terminal STOP reconciliation survives TTL and STOP saturation fails closed', () => {
  const now = 50_000;
  const stores = storage();
  const tombstone = {
    id: 'terminal-stop',
    action: 'STOP',
    ticketId: 'ticket-terminal',
    technicianUid: 'tech-1',
    trackingSessionId: 'session-terminal',
    queuedAtMs: 1_000,
    expiresAtMs: now - 1,
    retryCount: 8,
    nextAttemptAtMs: now - 1,
    terminal: true,
    lastErrorCode: 'permission-denied',
  };
  stores.stop.setItem(queue.gpsRetryQueueKeys.stop, JSON.stringify([tombstone]));
  const retained = queue.readGpsRetryQueue(stores, now);
  assert.equal(retained.length, 1);
  assert.equal(retained[0].terminal, true);
  assert.equal(retained[0].action, 'STOP');
  assert.equal('point' in retained[0], false);
  assert.equal(queue.hasPendingGpsStop('tech-1', stores, now), true);

  const saturated = storage();
  for (let index = 0; index < 20; index += 1) {
    queue.enqueueGpsRetryAction(stopInput({
      ticketId: `ticket-${index}`,
      trackingSessionId: `session-${index}`,
    }), saturated, now + index);
  }
  assert.throws(
    () => queue.enqueueGpsRetryAction(stopInput({ ticketId: 'overflow', trackingSessionId: 'overflow' }), saturated, now + 21),
    /GPS_STOP_QUEUE_CAPACITY_EXCEEDED/,
  );
  assert.equal(queue.readGpsRetryQueue(saturated, now + 22).filter((entry) => entry.action === 'STOP').length, 20);
});

test('GPS startup failures reject after reporting so callers cannot claim LIVE tracking', () => {
  const rejectionPattern = /onError\?\.\(message\);\s*throw new Error\(message\);/g;
  const matches = liveTrackingSource.match(rejectionPattern) || [];
  assert.ok(matches.length >= 3, 'unsupported, insecure, and pending-STOP starts must reject');
  assert.match(liveTrackingSource, /A previous GPS stop is still waiting for server acknowledgement/);
  assert.match(liveTrackingSource, /STOP_RECONCILIATION_TERMINAL/);
  assert.doesNotMatch(liveTrackingSource, /onError\?\.\(message\);\s*return;\s*}\s*\n\s*_state\.activeTicketId/s);
});
'''
test_path.write_text(tests, encoding='utf-8')

for path, required in [
    (queue_path, [
        "GPS_STOP_QUEUE_CAPACITY_EXCEEDED",
        "action === 'STOP' && terminal",
        "boundedStopEntries",
    ]),
    (tracking_path, [
        "throw new Error(message)",
        "STOP_RECONCILIATION_TERMINAL",
    ]),
]:
    current = path.read_text(encoding='utf-8')
    for marker in required:
        if marker not in current:
            raise SystemExit(f'{path}: missing required hardening marker {marker}')
