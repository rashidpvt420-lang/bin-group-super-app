from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one marker, found {count}')
    return source.replace(old, new, 1)


tracking_path = Path('src/utils/liveTracking.ts')
tracking = tracking_path.read_text(encoding='utf-8')
tracking = replace_once(
    tracking,
    """function discardSessionUpdates(technicianUid: string, ticketId: string, trackingSessionId: string) {
    const queue = readQueue(technicianUid);
    const retained = queue.filter((entry) => !(
        entry.action === 'UPDATE' &&
        entry.ticketId === ticketId &&
        entry.trackingSessionId === trackingSessionId
    ));
    const removedCount = queue.length - retained.length;
    if (removedCount > 0) {
        console.info(`[Tracking] Explicitly disposed ${removedCount} queued UPDATE actions before STOP for the same session.`);
    }
    writeQueue(technicianUid, retained);
}
""",
    """function discardSessionUpdates(technicianUid: string, ticketId: string, trackingSessionId: string) {
    const queue = readQueue(technicianUid);
    const retained = queue.filter((entry) => !(
        entry.action === 'UPDATE' &&
        entry.ticketId === ticketId &&
        entry.trackingSessionId === trackingSessionId
    ));
    const removedCount = queue.length - retained.length;
    if (removedCount > 0) {
        console.info(`[Tracking] Explicitly disposed ${removedCount} queued UPDATE actions before STOP for the same session.`);
    }
    writeQueue(technicianUid, retained);
}

function discardAllQueuedUpdates(technicianUid: string) {
    const queue = readQueue(technicianUid);
    const retainedStops = queue.filter((entry) => entry.action === 'STOP');
    const removedCount = queue.length - retainedStops.length;
    if (removedCount > 0) {
        console.info(`[Tracking] Explicitly disposed ${removedCount} stale UPDATE actions before starting another ticket session.`);
    }
    writeQueue(technicianUid, retainedStops);
}
""",
    'discard all stale updates helper',
)
tracking = replace_once(
    tracking,
    """    purgeOtherTechnicianQueues(technicianUid);
    ensureQueueReplayListener(technicianUid);
    const replay = await flushLiveTrackingQueue(technicianUid);
""",
    """    purgeOtherTechnicianQueues(technicianUid);
    discardAllQueuedUpdates(technicianUid);
    ensureQueueReplayListener(technicianUid);
    const replay = await flushLiveTrackingQueue(technicianUid);
""",
    'discard updates before replay',
)
tracking = tracking.replace(
    "retryStoragePolicy: 'SESSION_SCOPED_30_MINUTE_TTL'",
    "retryStoragePolicy: 'MEMORY_UPDATES_COORDINATE_FREE_SESSION_STOPS'",
)
tracking_path.write_text(tracking, encoding='utf-8')

test_path = Path('tests/launch/gps-queue-durability-privacy.test.mjs')
test_source = test_path.read_text(encoding='utf-8')
test_source = replace_once(
    test_source,
    """    'purgeOtherTechnicianQueues(technicianUid);',
    'ensureQueueReplayListener(technicianUid);',
""",
    """    'purgeOtherTechnicianQueues(technicianUid);',
    'discardAllQueuedUpdates(technicianUid);',
    'ensureQueueReplayListener(technicianUid);',
""",
    'cross-ticket start order test',
)
test_source = replace_once(
    test_source,
    "  assert.doesNotMatch(tracking, /if \\(!isCurrentSession\\) continue/);\n",
    "  assert.doesNotMatch(tracking, /if \\(!isCurrentSession\\) continue/);\n  assert.match(tracking, /const retainedStops = queue\\.filter\\(\\(entry\\) => entry\\.action === 'STOP'\\)/);\n  assert.match(tracking, /stale UPDATE actions before starting another ticket session/);\n",
    'cross-ticket disposal assertions',
)
test_path.write_text(test_source, encoding='utf-8')
