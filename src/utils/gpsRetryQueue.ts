export type GpsRetryActionKind = 'UPDATE' | 'STOP';

export type MinimalGpsPoint = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  deviceTimestampMs?: number;
};

export type GpsRetryTerminalReason = 'PERMANENT_CALLABLE_ERROR' | 'RETRY_EXHAUSTED';

export type QueuedGpsAction = {
  id: string;
  action: GpsRetryActionKind;
  ticketId: string;
  technicianUid: string;
  trackingSessionId: string;
  point?: MinimalGpsPoint;
  queuedAtMs: number;
  expiresAtMs: number;
  retryCount: number;
  nextAttemptAtMs: number;
  terminal: boolean;
  terminalReason?: GpsRetryTerminalReason;
  lastErrorCode?: string;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type QueueStorage = {
  stop: StorageLike | null;
  update: StorageLike | null;
};

export type ReplayResult = {
  attempted: number;
  succeeded: number;
  failed: number;
  terminal: number;
  pendingStops: number;
};

export type GpsRetryErrorDisposition = {
  code: string;
  terminal: boolean;
};

const STOP_QUEUE_KEY = 'bin-technician-gps-stop-queue-v3';
const UPDATE_QUEUE_KEY = 'bin-technician-gps-update-memory-v3';
const LEGACY_QUEUE_KEYS = [
  'bin-technician-gps-queue-v1',
  'bin-technician-gps-stop-queue-v2',
  'bin-technician-gps-update-queue-v2',
];
const STOP_TTL_MS = 24 * 60 * 60 * 1000;
const UPDATE_TTL_MS = 5 * 60 * 1000;
const MAX_STOP_QUEUE_SIZE = 20;
const MAX_UPDATE_QUEUE_SIZE = 12;
const MAX_RETRY_COUNT = 8;
const MAX_BACKOFF_MS = 60_000;
const PERMANENT_CALLABLE_CODES = new Set([
  'invalid-argument',
  'not-found',
  'permission-denied',
  'unauthenticated',
]);

const memoryValues = new Map<string, string>();
const memoryStorage: StorageLike = {
  getItem: (key) => memoryValues.get(key) ?? null,
  setItem: (key, value) => { memoryValues.set(key, String(value)); },
  removeItem: (key) => { memoryValues.delete(key); },
};

const safeStorage = (kind: 'localStorage' | 'sessionStorage'): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    const storage = window[kind];
    const probe = `__bin_gps_probe_${kind}`;
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
};

const validIdentity = (value: unknown) => {
  const text = String(value || '').trim();
  return text.length > 0 && text.length <= 256 ? text : '';
};

const scopedKey = (key: string, technicianUid: string) => `${key}:${encodeURIComponent(technicianUid)}`;

const scopedStorage = (storage: StorageLike | null, technicianUid: string): StorageLike | null => {
  const uid = validIdentity(technicianUid);
  if (!storage || !uid) return storage;
  return {
    getItem: (key) => storage.getItem(scopedKey(key, uid)),
    setItem: (key, value) => storage.setItem(scopedKey(key, uid), value),
    removeItem: (key) => storage.removeItem(scopedKey(key, uid)),
  };
};

/**
 * Browser production storage:
 * - coordinate-free STOP records use a Technician-UID-scoped localStorage key;
 * - UPDATE coordinates use module memory only and disappear on reload/restart.
 */
export const browserGpsQueueStorage = (technicianUid = ''): QueueStorage => ({
  stop: scopedStorage(safeStorage('localStorage'), technicianUid),
  update: scopedStorage(memoryStorage, technicianUid),
});

const randomId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `gpsq_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const finite = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const sanitizePoint = (input: unknown): MinimalGpsPoint | undefined => {
  if (!input || typeof input !== 'object') return undefined;
  const source = input as Record<string, unknown>;
  const latitude = finite(source.latitude ?? source.lat);
  const longitude = finite(source.longitude ?? source.lng);
  if (latitude === null || longitude === null) return undefined;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return undefined;
  if (latitude === 0 && longitude === 0) return undefined;
  const accuracy = finite(source.accuracy);
  const deviceTimestampMs = finite(source.deviceTimestampMs);
  return {
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    ...(accuracy !== null ? { accuracy: Math.max(0, Math.round(accuracy)) } : {}),
    ...(deviceTimestampMs !== null ? { deviceTimestampMs: Math.max(0, Math.round(deviceTimestampMs)) } : {}),
  };
};

const sanitizeTerminalReason = (value: unknown): GpsRetryTerminalReason | undefined => (
  value === 'PERMANENT_CALLABLE_ERROR' || value === 'RETRY_EXHAUSTED' ? value : undefined
);

const sanitizeEntry = (input: unknown, nowMs: number): QueuedGpsAction | null => {
  if (!input || typeof input !== 'object') return null;
  const source = input as Record<string, unknown>;
  const action = source.action === 'STOP' ? 'STOP' : source.action === 'UPDATE' ? 'UPDATE' : null;
  if (!action) return null;
  const ticketId = validIdentity(source.ticketId);
  const technicianUid = validIdentity(source.technicianUid);
  const trackingSessionId = validIdentity(source.trackingSessionId);
  const queuedAtMs = finite(source.queuedAtMs);
  const expiresAtMs = finite(source.expiresAtMs);
  const retryCount = Math.max(0, Math.floor(finite(source.retryCount) ?? 0));
  const terminalReason = sanitizeTerminalReason(source.terminalReason);
  const terminal = source.terminal === true || retryCount >= MAX_RETRY_COUNT || Boolean(terminalReason);
  const nextAttemptAtMs = Math.max(0, Math.floor(finite(source.nextAttemptAtMs) ?? queuedAtMs ?? nowMs));
  if (!ticketId || !technicianUid || !trackingSessionId || queuedAtMs === null || expiresAtMs === null) return null;
  // A terminal STOP is a coordinate-free reconciliation tombstone. It remains
  // blocking beyond the ordinary TTL until explicit secure purge or successful
  // server reconciliation.
  if (expiresAtMs <= nowMs && !(action === 'STOP' && terminal)) return null;
  const point = action === 'UPDATE' ? sanitizePoint(source.point) : undefined;
  if (action === 'UPDATE' && !point) return null;
  return {
    id: validIdentity(source.id) || randomId(),
    action,
    ticketId,
    technicianUid,
    trackingSessionId,
    ...(point ? { point } : {}),
    queuedAtMs: Math.floor(queuedAtMs),
    expiresAtMs: Math.floor(expiresAtMs),
    retryCount,
    nextAttemptAtMs,
    terminal,
    ...(terminalReason ? { terminalReason } : {}),
    ...(source.lastErrorCode ? { lastErrorCode: String(source.lastErrorCode).slice(0, 80) } : {}),
  };
};

const readList = (storage: StorageLike | null, key: string, nowMs: number): QueuedGpsAction[] => {
  if (!storage) return [];
  try {
    const raw = JSON.parse(storage.getItem(key) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.map((entry) => sanitizeEntry(entry, nowMs)).filter(Boolean) as QueuedGpsAction[];
  } catch {
    return [];
  }
};

const writeList = (storage: StorageLike | null, key: string, entries: QueuedGpsAction[], maxSize: number) => {
  if (!storage) return;
  try {
    const bounded = entries.slice(-maxSize);
    if (!bounded.length) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(bounded));
  } catch {
    // Storage denial is surfaced through the caller's queued-sync diagnostics.
  }
};

const boundedStopEntries = (entries: QueuedGpsAction[]) => {
  const stops = entries
    .filter((entry) => entry.action === 'STOP')
    .map(({ point: _discardedPoint, ...entry }) => entry)
    .sort((left, right) => left.queuedAtMs - right.queuedAtMs || left.id.localeCompare(right.id));
  if (stops.length > MAX_STOP_QUEUE_SIZE) throw new Error('GPS_STOP_QUEUE_CAPACITY_EXCEEDED');
  return stops;
};

const writeQueues = (storage: QueueStorage, entries: QueuedGpsAction[]) => {
  writeList(storage.stop, STOP_QUEUE_KEY, boundedStopEntries(entries), MAX_STOP_QUEUE_SIZE);
  writeList(storage.update, UPDATE_QUEUE_KEY, entries.filter((entry) => entry.action === 'UPDATE'), MAX_UPDATE_QUEUE_SIZE);
};

export const readGpsRetryQueue = (
  storage: QueueStorage = browserGpsQueueStorage(),
  nowMs = Date.now(),
): QueuedGpsAction[] => {
  const entries = [
    ...readList(storage.stop, STOP_QUEUE_KEY, nowMs),
    ...readList(storage.update, UPDATE_QUEUE_KEY, nowMs),
  ].sort((left, right) => left.queuedAtMs - right.queuedAtMs || left.id.localeCompare(right.id));
  writeQueues(storage, entries);
  return entries;
};

const legacyEntryIdentity = (entry: QueuedGpsAction) =>
  `${entry.technicianUid}|${entry.ticketId}|${entry.trackingSessionId}`;

export const legacyStopEntriesForMigration = (
  inputs: unknown[],
  nowMs = Date.now(),
): QueuedGpsAction[] => {
  const newest = new Map<string, QueuedGpsAction>();
  for (const input of inputs) {
    const entry = sanitizeEntry(input, nowMs);
    if (!entry || entry.action !== 'STOP') continue;
    const { point: _legacyPoint, ...coordinateFree } = entry;
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

const purgeOtherBrowserStopScopes = (technicianUid: string) => {
  const local = safeStorage('localStorage');
  if (!local) return;
  const keep = scopedKey(STOP_QUEUE_KEY, technicianUid);
  const prefix = `${STOP_QUEUE_KEY}:`;
  const staleKeys: string[] = [];
  for (let index = 0; index < local.length; index += 1) {
    const key = local.key(index);
    if (key?.startsWith(prefix) && key !== keep) staleKeys.push(key);
  }
  staleKeys.forEach((key) => local.removeItem(key));
};

const purgeOtherMemoryScopes = (technicianUid: string) => {
  const keep = scopedKey(UPDATE_QUEUE_KEY, technicianUid);
  const prefix = `${UPDATE_QUEUE_KEY}:`;
  for (const key of [...memoryValues.keys()]) {
    if (key.startsWith(prefix) && key !== keep) memoryValues.delete(key);
  }
};

export const purgeGpsQueueForTechnician = (
  technicianUid: string,
  storage?: QueueStorage,
) => {
  const uid = validIdentity(technicianUid);
  if (!uid) return;
  const selected = storage ?? browserGpsQueueStorage(uid);
  writeQueues(selected, []);
};

export const purgeGpsQueuesExceptTechnician = (
  technicianUid: string,
  storage?: QueueStorage,
) => {
  const uid = validIdentity(technicianUid);
  if (!uid) {
    if (storage) writeQueues(storage, []);
    else {
      const local = safeStorage('localStorage');
      if (local) {
        const prefix = `${STOP_QUEUE_KEY}:`;
        const keys: string[] = [];
        for (let index = 0; index < local.length; index += 1) {
          const key = local.key(index);
          if (key?.startsWith(prefix)) keys.push(key);
        }
        keys.forEach((key) => local.removeItem(key));
      }
      memoryValues.clear();
    }
    return;
  }
  if (!storage) {
    purgeOtherBrowserStopScopes(uid);
    purgeOtherMemoryScopes(uid);
  }
  const selected = storage ?? browserGpsQueueStorage(uid);
  writeQueues(selected, readGpsRetryQueue(selected).filter((entry) => entry.technicianUid === uid));
};

export const discardQueuedSessionUpdates = (
  technicianUid: string,
  ticketId: string,
  trackingSessionId: string,
  storage?: QueueStorage,
) => {
  const selected = storage ?? browserGpsQueueStorage(technicianUid);
  const queue = readGpsRetryQueue(selected).filter((entry) => !(
    entry.action === 'UPDATE' &&
    entry.technicianUid === technicianUid &&
    entry.ticketId === ticketId &&
    entry.trackingSessionId === trackingSessionId
  ));
  writeQueues(selected, queue);
};

export const discardAllQueuedUpdates = (
  technicianUid: string,
  storage?: QueueStorage,
) => {
  const selected = storage ?? browserGpsQueueStorage(technicianUid);
  const queue = readGpsRetryQueue(selected).filter((entry) => entry.action === 'STOP');
  writeQueues(selected, queue);
};

export const enqueueGpsRetryAction = (
  input: Omit<QueuedGpsAction, 'id' | 'expiresAtMs' | 'retryCount' | 'nextAttemptAtMs' | 'terminal' | 'terminalReason'>,
  storage?: QueueStorage,
  nowMs = Date.now(),
): QueuedGpsAction => {
  const selected = storage ?? browserGpsQueueStorage(input.technicianUid);
  const action: QueuedGpsAction = {
    id: randomId(),
    action: input.action,
    ticketId: validIdentity(input.ticketId),
    technicianUid: validIdentity(input.technicianUid),
    trackingSessionId: validIdentity(input.trackingSessionId),
    ...(input.action === 'UPDATE' ? { point: sanitizePoint(input.point) } : {}),
    queuedAtMs: nowMs,
    expiresAtMs: nowMs + (input.action === 'STOP' ? STOP_TTL_MS : UPDATE_TTL_MS),
    retryCount: 0,
    nextAttemptAtMs: nowMs,
    terminal: false,
  };
  if (!action.ticketId || !action.technicianUid || !action.trackingSessionId || (action.action === 'UPDATE' && !action.point)) {
    throw new Error('INVALID_GPS_RETRY_ACTION');
  }

  let queue = readGpsRetryQueue(selected, nowMs);
  queue = queue.filter((entry) => !(
    entry.action === action.action &&
    entry.technicianUid === action.technicianUid &&
    entry.ticketId === action.ticketId &&
    entry.trackingSessionId === action.trackingSessionId
  ));
  queue.push(action);
  writeQueues(selected, queue);
  return action;
};

const safeErrorCode = (error: unknown) => {
  if (error && typeof error === 'object') {
    const candidate = error as { code?: unknown; message?: unknown };
    const code = String(candidate.code || '').trim();
    if (code) return code.toLowerCase().slice(0, 80);
    const message = String(candidate.message || '').trim();
    if (message) return message.replace(/[^A-Za-z0-9_./:-]+/g, '_').toLowerCase().slice(0, 80);
  }
  return 'unknown_retry_error';
};

const canonicalCallableCode = (code: string) => code
  .toLowerCase()
  .replace(/^firebase:/, '')
  .replace(/^functions\//, '')
  .replace(/^https?:/, '');

export const classifyGpsRetryError = (error: unknown): GpsRetryErrorDisposition => {
  const code = safeErrorCode(error);
  return {
    code,
    terminal: PERMANENT_CALLABLE_CODES.has(canonicalCallableCode(code)),
  };
};

const retryDelayMs = (retryCount: number) => Math.min(MAX_BACKOFF_MS, 2_000 * (2 ** Math.min(retryCount, 5)));

export const hasPendingGpsStop = (
  technicianUid: string,
  storage?: QueueStorage,
  nowMs = Date.now(),
) => {
  const selected = storage ?? browserGpsQueueStorage(technicianUid);
  return readGpsRetryQueue(selected, nowMs).some((entry) => (
    entry.action === 'STOP' && entry.technicianUid === technicianUid
  ));
};

export const terminalGpsStopsForTechnician = (
  technicianUid: string,
  storage?: QueueStorage,
  nowMs = Date.now(),
) => {
  const selected = storage ?? browserGpsQueueStorage(technicianUid);
  return readGpsRetryQueue(selected, nowMs).filter((entry) => (
    entry.action === 'STOP' && entry.technicianUid === technicianUid && entry.terminal
  ));
};

export const clearTerminalGpsStopAfterServerReconciliation = (
  input: {
    technicianUid: string;
    ticketId: string;
    trackingSessionId: string;
    serverReconciled: boolean;
  },
  storage?: QueueStorage,
) => {
  if (input.serverReconciled !== true) throw new Error('GPS_STOP_RECONCILIATION_PROOF_REQUIRED');
  const selected = storage ?? browserGpsQueueStorage(input.technicianUid);
  const queue = readGpsRetryQueue(selected);
  const target = queue.find((entry) => (
    entry.action === 'STOP' &&
    entry.terminal &&
    entry.technicianUid === input.technicianUid &&
    entry.ticketId === input.ticketId &&
    entry.trackingSessionId === input.trackingSessionId
  ));
  if (!target) throw new Error('GPS_TERMINAL_STOP_NOT_FOUND');
  writeQueues(selected, queue.filter((entry) => entry.id !== target.id));
};

export const replayGpsRetryQueue = async (
  technicianUid: string,
  sender: (entry: QueuedGpsAction) => Promise<void>,
  storage?: QueueStorage,
  nowMs = Date.now(),
): Promise<ReplayResult> => {
  const uid = validIdentity(technicianUid);
  const selected = storage ?? browserGpsQueueStorage(uid);
  const queue = readGpsRetryQueue(selected, nowMs);
  const ordered = [
    ...queue.filter((entry) => entry.technicianUid === uid && entry.action === 'STOP'),
    ...queue.filter((entry) => entry.technicianUid === uid && entry.action === 'UPDATE'),
  ];
  let current = [...queue];
  const result: ReplayResult = { attempted: 0, succeeded: 0, failed: 0, terminal: 0, pendingStops: 0 };

  for (const entry of ordered) {
    if (entry.terminal) {
      result.terminal += 1;
      continue;
    }
    if (entry.nextAttemptAtMs > nowMs) continue;
    result.attempted += 1;
    try {
      await sender(entry);
      current = current.filter((candidate) => candidate.id !== entry.id);
      result.succeeded += 1;
    } catch (error) {
      result.failed += 1;
      const disposition = classifyGpsRetryError(error);
      const nextRetryCount = entry.retryCount + 1;
      const terminal = disposition.terminal || nextRetryCount >= MAX_RETRY_COUNT;
      const retryCount = disposition.terminal ? MAX_RETRY_COUNT : nextRetryCount;
      const terminalReason: GpsRetryTerminalReason | undefined = terminal
        ? (disposition.terminal ? 'PERMANENT_CALLABLE_ERROR' : 'RETRY_EXHAUSTED')
        : undefined;
      current = current.map((candidate) => candidate.id === entry.id ? {
        ...candidate,
        retryCount,
        terminal,
        ...(terminalReason ? { terminalReason } : {}),
        nextAttemptAtMs: terminal ? candidate.expiresAtMs : nowMs + retryDelayMs(retryCount),
        lastErrorCode: disposition.code,
      } : candidate);
      if (terminal) result.terminal += 1;
      // A STOP reconciliation failure blocks all newer actions for the same UID.
      if (entry.action === 'STOP') break;
    }
  }

  writeQueues(selected, current);
  result.pendingStops = current.filter((entry) => entry.technicianUid === uid && entry.action === 'STOP').length;
  return result;
};

export const gpsRetryQueueKeys = Object.freeze({
  stop: STOP_QUEUE_KEY,
  update: UPDATE_QUEUE_KEY,
  legacy: LEGACY_QUEUE_KEYS[0],
  stopPrefix: `${STOP_QUEUE_KEY}:`,
});
