from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label} marker count was {count}, expected 1')
    return source.replace(old, new, 1)


path = Path('src/utils/liveTracking.ts')
source = path.read_text(encoding='utf-8')
source = replace_once(
    source,
    '''    _state.activeTicketId = ticketId;
    _state.technicianUid = technicianUid;
    _state.trackingSessionId = createTrackingSessionId();
    _state.lastPushTime = 0;

    _state.watchId = navigator.geolocation.watchPosition(
''',
    '''    const trackingSessionId = createTrackingSessionId();
    let captureLastPushTime = 0;
    let installedWatchId: number;

    try {
      installedWatchId = navigator.geolocation.watchPosition(
''',
    'pre-install state publication',
)
source = replace_once(
    source,
    '''            if (now - _state.lastPushTime < CAPTURE_INTERVAL_MS) return;
''',
    '''            if (now - captureLastPushTime < CAPTURE_INTERVAL_MS) return;
''',
    'capture throttle read',
)
source = replace_once(
    source,
    '''            _state.lastPushTime = now;
            const sessionId = _state.trackingSessionId;
            if (!sessionId) return;
''',
    '''            captureLastPushTime = now;
            _state.lastPushTime = now;
            const sessionId = trackingSessionId;
''',
    'capture session closure',
)
start = source.index('    try {\n      installedWatchId = navigator.geolocation.watchPosition(')
end_marker = '    );\n};\n\nexport const stopLiveTracking'
end = source.index(end_marker, start)
source = source[:end] + '''    );
    } catch (error) {
      detachOnlineRecovery();
      const message = 'Unable to start the browser GPS watch.';
      await persistTrackingDiagnostic(technicianUid, ticketId, {
        status: 'WATCH_INSTALL_FAILED',
        error: message,
        errorCode: String((error as any)?.code || 'WATCH_INSTALL_FAILED').slice(0, 80),
        failedAt: serverTimestamp(),
      });
      onError?.(message);
      throw error instanceof Error ? error : new Error(message);
    }

    _state.activeTicketId = ticketId;
    _state.technicianUid = technicianUid;
    _state.trackingSessionId = trackingSessionId;
    _state.lastPushTime = captureLastPushTime;
    _state.watchId = installedWatchId;
};

export const stopLiveTracking''' + source[end + len(end_marker):]
path.write_text(source, encoding='utf-8')

behavior = Path('tests/launch/map-gps-state-behavior.test.mjs')
tests = behavior.read_text(encoding='utf-8')
tests += '''

test('tracking state is published only after browser watch installation succeeds', () => {
  const installIndex = liveTrackingSource.indexOf('installedWatchId = navigator.geolocation.watchPosition');
  const publishIndex = liveTrackingSource.indexOf('_state.activeTicketId = ticketId', installIndex);
  const failureIndex = liveTrackingSource.indexOf("status: 'WATCH_INSTALL_FAILED'", installIndex);
  assert.ok(installIndex >= 0 && failureIndex > installIndex && publishIndex > failureIndex);
  assert.match(liveTrackingSource, /const trackingSessionId = createTrackingSessionId\(\)/);
  assert.match(liveTrackingSource, /const sessionId = trackingSessionId/);
  assert.match(liveTrackingSource, /_state\.watchId = installedWatchId/);
});
'''
behavior.write_text(tests, encoding='utf-8')
