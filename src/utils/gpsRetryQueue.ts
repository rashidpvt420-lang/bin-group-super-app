export type GpsRetryActionKind = 'UPDATE' | 'STOP';

export type MinimalGpsPoint = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  deviceTimestampMs?: number;
};

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
 *
 * Tests can inject independent StorageLike instances and retain the original
 * multi-user queue behavior without browser globals.
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
  const terminal = source.terminal === true || retryCount >= MAX_RETRY_COUNT;
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
  // STOP intent is never evicted. Saturation fails closed instead of silently
  // allowing a new session to claim LIVE authority.
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

export const removeLegacyGpsQueue = () => {
  for (const storage of [safeStorage('localStorage'), safeStorage('sessionStorage')]) {
    if (!storage) continue;
    for (const key of LEGACY_QUEUE_KEYS) {
      try { storage.removeItem(key); } catch { /* no-op */ }
    }
  }
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
  input: Omit<QueuedGpsAction, 'id' | 'expiresAtMs' | 'retryCount' | 'nextAttemptAtMs' | 'terminal'>,
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
    if (code) return code.slice(0, 80);
    const message = String(candidate.message || '').trim();
    if (message) return message.replace(/[^A-Za-z0-9_./:-]+/g, '_').slice(0, 80);
  }
  return 'UNKNOWN_RETRY_ERROR';
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
      const retryCount = entry.retryCount + 1;
      const terminal = retryCount >= MAX_RETRY_COUNT;
      current = current.map((candidate) => candidate.id === entry.id ? {
        ...candidate,
        retryCount,
        terminal,
        nextAttemptAtMs: terminal ? candidate.expiresAtMs : nowMs + retryDelayMs(retryCount),
        lastErrorCode: safeErrorCode(error),
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
