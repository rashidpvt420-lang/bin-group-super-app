from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one marker, found {count}')
    return source.replace(old, new, 1)


queue_path = Path('src/utils/gpsRetryQueue.ts')
queue = queue_path.read_text(encoding='utf-8')
queue = replace_once(
    queue,
    """export const removeLegacyGpsQueue = () => {
  for (const storage of [safeStorage('localStorage'), safeStorage('sessionStorage')]) {
    if (!storage) continue;
    for (const key of LEGACY_QUEUE_KEYS) {
      try { storage.removeItem(key); } catch { /* no-op */ }
    }
  }
};
""",
    """const migrateLegacyV2Stops = (nowMs = Date.now()) => {
  const local = safeStorage('localStorage');
  if (!local) return;
  try {
    const raw = JSON.parse(local.getItem(LEGACY_QUEUE_KEYS[1]) || '[]');
    if (!Array.isArray(raw)) return;
    const validStops = raw
      .map((entry) => sanitizeEntry(entry, nowMs))
      .filter((entry): entry is QueuedGpsAction => Boolean(entry && entry.action === 'STOP'));
    for (const entry of validStops) {
      const selected = browserGpsQueueStorage(entry.technicianUid);
      const existing = readGpsRetryQueue(selected, nowMs);
      const duplicate = existing.some((candidate) =>
        candidate.action === 'STOP' &&
        candidate.technicianUid === entry.technicianUid &&
        candidate.ticketId === entry.ticketId &&
        candidate.trackingSessionId === entry.trackingSessionId,
      );
      if (!duplicate) writeQueues(selected, [...existing, { ...entry, point: undefined }]);
    }
  } catch {
    // Malformed legacy data is deleted below and is never allowed to start a
    // new session as trusted reconciliation evidence.
  }
};

export const removeLegacyGpsQueue = () => {
  // Preserve coordinate-free pending STOP authority before deleting the old
  // global key. Legacy UPDATE coordinates are intentionally not migrated.
  migrateLegacyV2Stops();
  for (const storage of [safeStorage('localStorage'), safeStorage('sessionStorage')]) {
    if (!storage) continue;
    for (const key of LEGACY_QUEUE_KEYS) {
      try { storage.removeItem(key); } catch { /* no-op */ }
    }
  }
};
""",
    'legacy STOP migration',
)
queue_path.write_text(queue, encoding='utf-8')

maps_test_path = Path('tests/launch/maps-gps-product-truth.test.mjs')
maps = maps_test_path.read_text(encoding='utf-8')
maps = replace_once(
    maps,
    """  assert.match(gpsRetryQueue, /STOP_QUEUE_KEY = 'bin-technician-gps-stop-queue-v2'/);
  assert.match(gpsRetryQueue, /UPDATE_QUEUE_KEY = 'bin-technician-gps-update-queue-v2'/);
  assert.match(gpsRetryQueue, /stop: safeStorage\('localStorage'\)/);
  assert.match(gpsRetryQueue, /update: safeStorage\('sessionStorage'\)/);
""",
    """  assert.match(gpsRetryQueue, /STOP_QUEUE_KEY = 'bin-technician-gps-stop-queue-v3'/);
  assert.match(gpsRetryQueue, /UPDATE_QUEUE_KEY = 'bin-technician-gps-update-memory-v3'/);
  assert.match(gpsRetryQueue, /stop: scopedStorage\(safeStorage\('localStorage'\), technicianUid\)/);
  assert.match(gpsRetryQueue, /update: scopedStorage\(memoryStorage, technicianUid\)/);
  assert.match(gpsRetryQueue, /migrateLegacyV2Stops/);
  assert.match(gpsRetryQueue, /Legacy UPDATE coordinates are intentionally not migrated/);
""",
    'v3 launch assertions',
)
maps_test_path.write_text(maps, encoding='utf-8')

behavior_path = Path('tests/launch/map-gps-state-behavior.test.mjs')
behavior = behavior_path.read_text(encoding='utf-8')
behavior += """

test('legacy v2 STOP authority migrates before global queue deletion', () => {
  const queueSource = readFileSync('src/utils/gpsRetryQueue.ts', 'utf8');
  const migrationIndex = queueSource.indexOf('migrateLegacyV2Stops();');
  const deletionIndex = queueSource.indexOf('storage.removeItem(key)', migrationIndex);
  assert.ok(migrationIndex >= 0 && deletionIndex > migrationIndex);
  assert.match(queueSource, /entry\.action === 'STOP'/);
  assert.match(queueSource, /point: undefined/);
  assert.match(queueSource, /candidate\.trackingSessionId === entry\.trackingSessionId/);
});
"""
behavior_path.write_text(behavior, encoding='utf-8')
