from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one marker, found {count}')
    return source.replace(old, new, 1)


queue_path = Path('src/utils/gpsRetryQueue.ts')
queue = queue_path.read_text(encoding='utf-8')
old_migration = """const migrateLegacyV2Stops = (nowMs = Date.now()) => {
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
"""
new_migration = """const legacyEntryIdentity = (entry: QueuedGpsAction) =>
  `${entry.technicianUid}|${entry.ticketId}|${entry.trackingSessionId}`;

export const legacyStopEntriesForMigration = (
  inputs: unknown[],
  nowMs = Date.now(),
): QueuedGpsAction[] => {
  const newest = new Map<string, QueuedGpsAction>();
  for (const input of inputs) {
    const entry = sanitizeEntry(input, nowMs);
    if (!entry || entry.action !== 'STOP') continue;
    const coordinateFree = { ...entry, point: undefined };
    const key = legacyEntryIdentity(coordinateFree);
    const previous = newest.get(key);
    if (!previous || coordinateFree.queuedAtMs >= previous.queuedAtMs) newest.set(key, coordinateFree);
  }
  return [...newest.values()].sort((left, right) =>
    left.queuedAtMs - right.queuedAtMs || left.id.localeCompare(right.id));
};

const readLegacyRawEntries = (storage: StorageLike, key: string): unknown[] => {
  let serialized: string | null;
  try { serialized = storage.getItem(key); }
  catch { throw new Error('GPS_LEGACY_QUEUE_READ_FAILED'); }
  if (!serialized) return [];
  try {
    const parsed = JSON.parse(serialized);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const migrateAndRemoveLegacyGpsQueue = (nowMs = Date.now()) => {
  const local = safeStorage('localStorage');
  const session = safeStorage('sessionStorage');
  const sources = [local, session].filter(Boolean) as StorageLike[];
  if (!sources.length) return 0;

  const legacyRaw: unknown[] = [];
  for (const storage of sources) {
    for (const key of LEGACY_QUEUE_KEYS) legacyRaw.push(...readLegacyRawEntries(storage, key));
  }
  const legacyStops = legacyStopEntriesForMigration(legacyRaw, nowMs);
  if (legacyStops.length && !local) throw new Error('GPS_STOP_MIGRATION_STORAGE_UNAVAILABLE');

  const stopsByTechnician = new Map<string, QueuedGpsAction[]>();
  for (const entry of legacyStops) {
    const current = stopsByTechnician.get(entry.technicianUid) || [];
    current.push(entry);
    stopsByTechnician.set(entry.technicianUid, current);
  }

  for (const [technicianUid, migratedStops] of stopsByTechnician) {
    const target = scopedStorage(local, technicianUid);
    if (!target) throw new Error('GPS_STOP_MIGRATION_STORAGE_UNAVAILABLE');
    const combined = legacyStopEntriesForMigration([
      ...readList(target, STOP_QUEUE_KEY, nowMs),
      ...migratedStops,
    ], nowMs);
    const bounded = boundedStopEntries(combined);
    writeList(target, STOP_QUEUE_KEY, bounded, MAX_STOP_QUEUE_SIZE);
    const verified = readList(target, STOP_QUEUE_KEY, nowMs);
    for (const expected of migratedStops) {
      if (!verified.some((candidate) => legacyEntryIdentity(candidate) === legacyEntryIdentity(expected))) {
        throw new Error('GPS_STOP_MIGRATION_VERIFICATION_FAILED');
      }
    }
  }

  // Delete old keys only after every valid coordinate-free STOP was written and
  // re-read from its Technician-scoped v3 queue. Legacy UPDATE coordinates are
  // intentionally never migrated.
  for (const storage of sources) {
    for (const key of LEGACY_QUEUE_KEYS) {
      try { storage.removeItem(key); }
      catch { throw new Error('GPS_LEGACY_QUEUE_DELETE_FAILED'); }
    }
  }
  return legacyStops.length;
};

export const removeLegacyGpsQueue = () => {
  migrateAndRemoveLegacyGpsQueue();
};
"""
queue = replace_once(queue, old_migration, new_migration, 'intermediate legacy STOP migration')
queue_path.write_text(queue, encoding='utf-8')

maps_path = Path('tests/launch/maps-gps-product-truth.test.mjs')
maps = maps_path.read_text(encoding='utf-8')
maps = replace_once(
    maps,
    """  assert.match(gpsRetryQueue, /migrateLegacyV2Stops/);
  assert.match(gpsRetryQueue, /Legacy UPDATE coordinates are intentionally not migrated/);
""",
    """  assert.match(gpsRetryQueue, /migrateAndRemoveLegacyGpsQueue/);
  assert.match(gpsRetryQueue, /GPS_STOP_MIGRATION_VERIFICATION_FAILED/);
  assert.match(gpsRetryQueue, /Legacy UPDATE coordinates are[\\s\\S]*never migrated/);
  assert.doesNotMatch(gpsRetryQueue, /update: safeStorage\\('sessionStorage'\\)/);
""",
    'robust v3 launch assertions',
)
maps_path.write_text(maps, encoding='utf-8')

behavior_path = Path('tests/launch/map-gps-state-behavior.test.mjs')
behavior = behavior_path.read_text(encoding='utf-8')
behavior = replace_once(
    behavior,
    """test('legacy v2 STOP authority migrates before global queue deletion', () => {
  const queueSource = readFileSync('src/utils/gpsRetryQueue.ts', 'utf8');
  const migrationIndex = queueSource.indexOf('migrateLegacyV2Stops();');
  const deletionIndex = queueSource.indexOf('storage.removeItem(key)', migrationIndex);
  assert.ok(migrationIndex >= 0 && deletionIndex > migrationIndex);
  assert.match(queueSource, /entry\\.action === 'STOP'/);
  assert.match(queueSource, /point: undefined/);
  assert.match(queueSource, /candidate\\.trackingSessionId === entry\\.trackingSessionId/);
});
""",
    """test('legacy v2 STOP migration keeps only coordinate-free newest STOP authority', () => {
  const now = 20_000;
  const migrated = queue.legacyStopEntriesForMigration([
    { ...stopInput(), id: 'older-stop', queuedAtMs: 1_000, expiresAtMs: 30_000, retryCount: 0, nextAttemptAtMs: 1_000, terminal: false, point: { latitude: 24.2, longitude: 55.3 } },
    { ...stopInput(), id: 'newer-stop', queuedAtMs: 2_000, expiresAtMs: 30_000, retryCount: 1, nextAttemptAtMs: 2_500, terminal: false },
    { ...updateInput(), id: 'legacy-update', queuedAtMs: 3_000, expiresAtMs: 30_000, retryCount: 0, nextAttemptAtMs: 3_000, terminal: false },
  ], now);
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].id, 'newer-stop');
  assert.equal(migrated[0].action, 'STOP');
  assert.equal('point' in migrated[0], false);
});

test('legacy keys are deleted only after scoped STOP write verification', () => {
  const queueSource = readFileSync('src/utils/gpsRetryQueue.ts', 'utf8');
  const writeIndex = queueSource.indexOf('writeList(target, STOP_QUEUE_KEY');
  const verifyIndex = queueSource.indexOf("throw new Error('GPS_STOP_MIGRATION_VERIFICATION_FAILED')", writeIndex);
  const deleteIndex = queueSource.indexOf('storage.removeItem(key)', verifyIndex);
  assert.ok(writeIndex >= 0 && verifyIndex > writeIndex && deleteIndex > verifyIndex);
  assert.match(queueSource, /for \\(const storage of sources\\)/);
  assert.match(queueSource, /Legacy UPDATE coordinates are[\\s\\S]*never migrated/);
});
""",
    'legacy migration behavior tests',
)
behavior_path.write_text(behavior, encoding='utf-8')
