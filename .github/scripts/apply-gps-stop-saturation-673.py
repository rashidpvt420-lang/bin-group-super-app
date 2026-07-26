from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if source.count(old) != 1:
        raise SystemExit(f'{label} marker count was {source.count(old)}, expected 1')
    return source.replace(old, new, 1)


tracking_path = Path('src/utils/liveTracking.ts')
tracking = tracking_path.read_text(encoding='utf-8')

tracking = replace_once(
    tracking,
    "const QUEUE_KEY_PREFIX = 'bin-technician-gps-queue-v2:';\nconst MAX_QUEUE_SIZE = 25;",
    "const QUEUE_KEY_PREFIX = 'bin-technician-gps-queue-v2:';\nconst LEGACY_QUEUE_KEY = 'bin-technician-gps-queue-v1';\nconst MAX_QUEUE_SIZE = 25;",
    'legacy queue constant',
)

tracking = replace_once(
    tracking,
    "const queueFlushes = new Map<string, Promise<QueueFlushResult>>();",
    "const queueFlushes = new Map<string, Promise<QueueFlushResult>>();\nconst memoryUpdateQueues = new Map<string, QueuedTrackingAction[]>();",
    'memory queue declaration',
)

tracking = replace_once(
    tracking,
    """function storage(): Storage | null {
    if (typeof window === 'undefined') return null;
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}
""",
    """function storage(): Storage | null {
    if (typeof window === 'undefined') return null;
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

function purgeLegacyPersistentGpsQueue() {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(LEGACY_QUEUE_KEY);
    } catch {
        // A blocked storage API must not prevent secure GPS startup or logout.
    }
}
""",
    'legacy queue purge helper',
)

tracking = replace_once(
    tracking,
    """function readQueue(technicianUid: string): QueuedTrackingAction[] {
    const session = storage();
    if (!session || !technicianUid) return [];
    try {
        const parsed = JSON.parse(session.getItem(queueKey(technicianUid)) || '[]');
        return Array.isArray(parsed) ? parsed.filter(validQueueEntry) : [];
    } catch {
        return [];
    }
}
""",
    """function readQueue(technicianUid: string): QueuedTrackingAction[] {
    const session = storage();
    if (!technicianUid) return [];
    let persistentStops: QueuedTrackingAction[] = [];
    if (session) {
        try {
            const parsed = JSON.parse(session.getItem(queueKey(technicianUid)) || '[]');
            persistentStops = Array.isArray(parsed)
                ? parsed.filter(validQueueEntry).filter((entry) => entry.action === 'STOP')
                : [];
        } catch {
            persistentStops = [];
        }
    }
    const memoryUpdates = memoryUpdateQueues.get(technicianUid) || [];
    return [...persistentStops, ...memoryUpdates];
}
""",
    'split persistent and memory queue reads',
)

tracking = replace_once(
    tracking,
    """function compactQueue(queue: QueuedTrackingAction[], nowMs = Date.now()) {
    const expired = queue.filter((entry) => entry.expiresAtMs <= nowMs);
    const active = queue
        .filter((entry) => entry.expiresAtMs > nowMs)
        .sort((left, right) => left.queuedAtMs - right.queuedAtMs || left.id.localeCompare(right.id));
    const disposed: QueuedTrackingAction[] = [...expired];

    while (active.length > MAX_QUEUE_SIZE) {
        let index = active.findIndex((entry) => entry.status === 'TERMINAL');
        if (index < 0) index = active.findIndex((entry) => entry.action === 'UPDATE');
        if (index < 0) index = 0;
        const [removed] = active.splice(index, 1);
        if (removed) disposed.push(removed);
    }
""",
    """function compactQueue(queue: QueuedTrackingAction[], nowMs = Date.now()) {
    const terminalStopTombstones = queue.filter((entry) => entry.action === 'STOP' && entry.status === 'TERMINAL');
    const expired = queue.filter((entry) =>
        entry.expiresAtMs <= nowMs && !(entry.action === 'STOP' && entry.status === 'TERMINAL'),
    );
    const active = queue
        .filter((entry) => entry.expiresAtMs > nowMs || (entry.action === 'STOP' && entry.status === 'TERMINAL'))
        .sort((left, right) => left.queuedAtMs - right.queuedAtMs || left.id.localeCompare(right.id));
    const disposed: QueuedTrackingAction[] = [...expired];

    while (active.length > MAX_QUEUE_SIZE) {
        let index = active.findIndex((entry) => entry.status === 'TERMINAL' && entry.action === 'UPDATE');
        if (index < 0) index = active.findIndex((entry) => entry.action === 'UPDATE');
        if (index < 0) {
            throw new Error('GPS_STOP_QUEUE_CAPACITY_EXCEEDED');
        }
        const [removed] = active.splice(index, 1);
        if (removed) disposed.push(removed);
    }

    if (terminalStopTombstones.length > 0 && !active.some((entry) => entry.action === 'STOP' && entry.status === 'TERMINAL')) {
        throw new Error('GPS_TERMINAL_STOP_TOMBSTONE_LOST');
    }
""",
    'terminal STOP retention and saturation',
)

tracking = replace_once(
    tracking,
    """function writeQueue(technicianUid: string, queue: QueuedTrackingAction[]) {
    const session = storage();
    if (!session || !technicianUid) return;
    const compacted = compactQueue(queue);
    if (compacted.length === 0) session.removeItem(queueKey(technicianUid));
    else session.setItem(queueKey(technicianUid), JSON.stringify(compacted));
}
""",
    """function writeQueue(technicianUid: string, queue: QueuedTrackingAction[]) {
    if (!technicianUid) return;
    const compacted = compactQueue(queue);
    const persistentStops = compacted
        .filter((entry) => entry.action === 'STOP')
        .map(({ point: _discardedPoint, ...entry }) => entry);
    const memoryUpdates = compacted.filter((entry) => entry.action === 'UPDATE');

    const session = storage();
    if (session) {
        if (persistentStops.length === 0) session.removeItem(queueKey(technicianUid));
        else session.setItem(queueKey(technicianUid), JSON.stringify(persistentStops));
    }
    if (memoryUpdates.length === 0) memoryUpdateQueues.delete(technicianUid);
    else memoryUpdateQueues.set(technicianUid, memoryUpdates);
}
""",
    'coordinate-free persistent STOP writes',
)

tracking = replace_once(
    tracking,
    """export function purgeLiveTrackingQueue(technicianUid?: string) {
    const session = storage();
    if (!session) return;
    const exactKey = technicianUid ? queueKey(technicianUid) : null;
    const keys: string[] = [];
    for (let index = 0; index < session.length; index += 1) {
        const key = session.key(index);
        if (key?.startsWith(QUEUE_KEY_PREFIX) && (!exactKey || key === exactKey)) keys.push(key);
    }
    keys.forEach((key) => session.removeItem(key));
}
""",
    """export function purgeLiveTrackingQueue(technicianUid?: string) {
    purgeLegacyPersistentGpsQueue();
    const session = storage();
    const exactKey = technicianUid ? queueKey(technicianUid) : null;
    if (session) {
        const keys: string[] = [];
        for (let index = 0; index < session.length; index += 1) {
            const key = session.key(index);
            if (key?.startsWith(QUEUE_KEY_PREFIX) && (!exactKey || key === exactKey)) keys.push(key);
        }
        keys.forEach((key) => session.removeItem(key));
    }
    if (technicianUid) memoryUpdateQueues.delete(technicianUid);
    else memoryUpdateQueues.clear();
}
""",
    'logout purge including legacy and memory queues',
)

tracking = replace_once(
    tracking,
    """function purgeOtherTechnicianQueues(technicianUid: string) {
    const session = storage();
    if (!session) return;
    const currentKey = queueKey(technicianUid);
    const staleKeys: string[] = [];
    for (let index = 0; index < session.length; index += 1) {
        const key = session.key(index);
        if (key?.startsWith(QUEUE_KEY_PREFIX) && key !== currentKey) staleKeys.push(key);
    }
    staleKeys.forEach((key) => session.removeItem(key));
    if (staleKeys.length > 0) console.info(`[Tracking] Purged ${staleKeys.length} GPS queues after Technician account change.`);
}
""",
    """function purgeOtherTechnicianQueues(technicianUid: string) {
    purgeLegacyPersistentGpsQueue();
    const session = storage();
    const currentKey = queueKey(technicianUid);
    const staleKeys: string[] = [];
    if (session) {
        for (let index = 0; index < session.length; index += 1) {
            const key = session.key(index);
            if (key?.startsWith(QUEUE_KEY_PREFIX) && key !== currentKey) staleKeys.push(key);
        }
        staleKeys.forEach((key) => session.removeItem(key));
    }
    let memoryPurges = 0;
    for (const uid of memoryUpdateQueues.keys()) {
        if (uid !== technicianUid) {
            memoryUpdateQueues.delete(uid);
            memoryPurges += 1;
        }
    }
    if (staleKeys.length + memoryPurges > 0) {
        console.info(`[Tracking] Purged ${staleKeys.length + memoryPurges} GPS queues after Technician account change.`);
    }
}
""",
    'account-change purge including legacy and memory queues',
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
    'blocked start rejection',
)

tracking_path.write_text(tracking, encoding='utf-8')

test_path = Path('tests/launch/gps-queue-durability-privacy.test.mjs')
test_source = test_path.read_text(encoding='utf-8')

test_source = replace_once(
    test_source,
    "  assert.match(tracking, /entry\\.action === 'UPDATE'/);\n",
    "  assert.match(tracking, /entry\\.action === 'UPDATE'/);\n  assert.match(tracking, /GPS_STOP_QUEUE_CAPACITY_EXCEEDED/);\n  assert.match(tracking, /GPS_TERMINAL_STOP_TOMBSTONE_LOST/);\n  assert.doesNotMatch(tracking, /if \\(index < 0\\) index = 0/);\n",
    'saturation launch assertions',
)

test_source = replace_once(
    test_source,
    """  assert.match(tracking, /window\\.sessionStorage/);
  assert.match(tracking, /encodeURIComponent\\(technicianUid\\)/);
""",
    """  assert.match(tracking, /window\\.sessionStorage/);
  assert.match(tracking, /window\\.localStorage\\.removeItem\\(LEGACY_QUEUE_KEY\\)/);
  assert.match(tracking, /memoryUpdateQueues/);
  assert.match(tracking, /persistentStops/);
  assert.match(tracking, /map\\(\\(\\{ point: _discardedPoint, \\.\\.\\.entry \\}\\) => entry\\)/);
  assert.match(tracking, /encodeURIComponent\\(technicianUid\\)/);
""",
    'privacy storage assertions',
)

test_source = replace_once(
    test_source,
    """  assert.match(tracking, /A previous GPS STOP is still queued/);
  assert.match(tracking, /STOP_RECONCILIATION_REQUIRED/);
""",
    """  assert.match(tracking, /A previous GPS STOP is still queued/);
  assert.match(tracking, /STOP_RECONCILIATION_REQUIRED/);
  assert.match(tracking, /onError\\?\\.\\(message\\);\\s*throw new Error\\(message\\)/);
""",
    'blocked start launch assertion',
)

test_path.write_text(test_source, encoding='utf-8')

maps_test_path = Path('tests/launch/maps-gps-product-truth.test.mjs')
maps_test = maps_test_path.read_text(encoding='utf-8')
maps_test = replace_once(
    maps_test,
    "  assert.doesNotMatch(liveTracking, /window\\.localStorage/);\n",
    "  assert.match(liveTracking, /window\\.localStorage\\.removeItem\\(LEGACY_QUEUE_KEY\\)/);\n  assert.doesNotMatch(liveTracking, /window\\.localStorage\\.(?:getItem|setItem)/);\n",
    'legacy localStorage purge test',
)
maps_test_path.write_text(maps_test, encoding='utf-8')

doc_path = Path('docs/technician-gps-retry-privacy-policy.md')
doc = doc_path.read_text(encoding='utf-8')
doc = replace_once(
    doc,
    "- Storage: `sessionStorage` only.\n",
    "- STOP and reconciliation storage: UID-scoped `sessionStorage`; coordinate-free.\n- UPDATE retry storage: memory only; precise coordinates are never written to Web Storage.\n- Legacy migration: the persistent `bin-technician-gps-queue-v1` localStorage record is deleted during startup and secure logout.\n",
    'privacy policy storage detail',
)
doc_path.write_text(doc, encoding='utf-8')
