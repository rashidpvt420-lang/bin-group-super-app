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
  discardedPermanentUpdates: number;
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

let memoryUpdateJson: string | null = null;
const memoryUpdateStorage: StorageLike = {
  getItem: (key) => key === UPDATE_QUEUE_KEY ? memoryUpdateJson : null,
  setItem: (key, value) => {
    if (key === UPDATE_QUEUE_KEY) memoryUpdateJson = value;
  },
  removeItem: (key) => {
    if (key === UPDATE_QUEUE_KEY) memoryUpdateJson = null;
  },
};

const safeStorage = (kind: 'localStorage' | 'sessionStorage'): StorageLike | null => {
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

export const browserGpsQueueStorage = (): QueueStorage => ({
  // STOP contains no coordinate and survives browser restarts until the server
  // acknowledges it or an explicit authenticated reconciliation removes it.
  stop: safeStorage('localStorage'),
  // Precise coordinates are memory-only. Closing/reloading the tab destroys
  // them instead of retaining location history in Web Storage.
  update: memoryUpdateStorage,
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

const validIdentity = (value: unknown) => {
  const text = String(value || '').trim();
  return text.length > 0 && text.length <= 256 ? text : '';
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
  const bounded = entries.slice(-maxSize);
  try {
    if (!bounded.length) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(bounded));
  } catch {
    if (key === STOP_QUEUE_KEY && bounded.length) throw new Error('GPS_STOP_STORAGE_UNAVAILABLE');
  }
};

const boundedStopEntries = (entries: QueuedGpsAction[]) => {
  const stops = entries
    .filter((entry) => entry.action === 'STOP')
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

export const removeLegacyGpsQueue = (storage: QueueStorage = browserGpsQueueStorage()) => {
  const local = safeStorage('localStorage');
  const session = safeStorage('sessionStorage');
  for (const key of LEGACY_QUEUE_KEYS) {
    try { local?.removeItem(key); } catch { /* no-op */ }
    try { session?.removeItem(key); } catch { /* no-op */ }
    try { storage.stop?.removeItem(key); } catch { /* no-op */ }
    try { storage.update?.removeItem(key); } catch { /* no-op */ }
  }
};

export const purgeGpsQueueForTechnician = (
  technicianUid: string,
  storage: QueueStorage = browserGpsQueueStorage(),
) => {
  const uid = validIdentity(technicianUid);
  if (!uid) return;
  writeQueues(storage, readGpsRetryQueue(storage).filter((entry) => entry.technicianUid !== uid));
};

export const purgeGpsQueuesExceptTechnician = (
  technicianUid: string,
  storage: QueueStorage = browserGpsQueueStorage(),
) => {
  const uid = validIdentity(technicianUid);
  if (!uid) {
    writeQueues(storage, []);
    return;
  }
  // Mission/account boundary: retain only coordinate-free STOP reconciliation
  // for this authenticated Technician. Every UPDATE is stale by definition.
  writeQueues(storage, readGpsRetryQueue(storage).filter((entry) => (
    entry.action === 'STOP' && entry.technicianUid === uid
  )));
};

export const discardQueuedUpdatesForTechnician = (
  technicianUid: string,
  storage: QueueStorage = browserGpsQueueStorage(),
) => {
  const uid = validIdentity(technicianUid);
  if (!uid) return;
  writeQueues(storage, readGpsRetryQueue(storage).filter((entry) => !(
    entry.action === 'UPDATE' && entry.technicianUid === uid
  )));
};

export const discardQueuedSessionUpdates = (
  technicianUid: string,
  ticketId: string,
  trackingSessionId: string,
  storage: QueueStorage = browserGpsQueueStorage(),
) => {
  const queue = readGpsRetryQueue(storage).filter((entry) => !(
    entry.action === 'UPDATE' &&
    entry.technicianUid === technicianUid &&
    entry.ticketId === ticketId &&
    entry.trackingSessionId === trackingSessionId
  ));
  writeQueues(storage, queue);
};

export const enqueueGpsRetryAction = (
  input: Omit<QueuedGpsAction, 'id' | 'expiresAtMs' | 'retryCount' | 'nextAttemptAtMs' | 'terminal'>,
  storage: QueueStorage = browserGpsQueueStorage(),
  nowMs = Date.now(),
): QueuedGpsAction => {
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

  let queue = readGpsRetryQueue(storage, nowMs).filter((entry) => !(
    entry.action === action.action &&
    entry.technicianUid === action.technicianUid &&
    entry.ticketId === action.ticketId &&
    entry.trackingSessionId === action.trackingSessionId
  ));
  queue.push(action);
  writeQueues(storage, queue);
  return action;
};

const safeErrorCode = (error: unknown) => {
  if (error && typeof error === 'object') {
    const candidate = error as { code?: unknown; message?: unknown };
    const code = String(candidate.code || '').trim();
    if (code) return code.replace(/^functions\//, '').slice(0, 80);
    const message = String(candidate.message || '').trim();
    if (message) return message.replace(/[^A-Za-z0-9_./:-]+/g, '_').slice(0, 80);
  }
  return 'UNKNOWN_RETRY_ERROR';
};

export const isPermanentGpsCallableError = (error: unknown) => {
  const code = safeErrorCode(error).toLowerCase();
  return new Set([
    'unauthenticated',
    'permission-denied',
    'invalid-argument',
    'not-found',
    'failed-precondition',
    'unimplemented',
  ]).has(code);
};

const retryDelayMs = (retryCount: number) => Math.min(MAX_BACKOFF_MS, 2_000 * (2 ** Math.min(retryCount, 5)));

export const hasPendingGpsStop = (
  technicianUid: string,
  storage: QueueStorage = browserGpsQueueStorage(),
  nowMs = Date.now(),
) => readGpsRetryQueue(storage, nowMs).some((entry) => (
  entry.action === 'STOP' && entry.technicianUid === technicianUid
));

export const terminalGpsStops = (
  technicianUid: string,
  storage: QueueStorage = browserGpsQueueStorage(),
  nowMs = Date.now(),
) => readGpsRetryQueue(storage, nowMs).filter((entry) => (
  entry.action === 'STOP' && entry.technicianUid === technicianUid && entry.terminal
));

export const resolveTerminalGpsStop = (
  technicianUid: string,
  ticketId: string,
  trackingSessionId: string,
  storage: QueueStorage = browserGpsQueueStorage(),
) => {
  const queue = readGpsRetryQueue(storage).filter((entry) => !(
    entry.action === 'STOP' &&
    entry.terminal &&
    entry.technicianUid === technicianUid &&
    entry.ticketId === ticketId &&
    entry.trackingSessionId === trackingSessionId
  ));
  writeQueues(storage, queue);
};

export const replayGpsRetryQueue = async (
  technicianUid: string,
  sender: (entry: QueuedGpsAction) => Promise<void>,
  storage: QueueStorage = browserGpsQueueStorage(),
  nowMs = Date.now(),
): Promise<ReplayResult> => {
  const uid = validIdentity(technicianUid);
  const queue = readGpsRetryQueue(storage, nowMs);
  const ordered = [
    ...queue.filter((entry) => entry.technicianUid === uid && entry.action === 'STOP'),
    ...queue.filter((entry) => entry.technicianUid === uid && entry.action === 'UPDATE'),
  ];
  let current = [...queue];
  const result: ReplayResult = {
    attempted: 0,
    succeeded: 0,
    failed: 0,
    terminal: 0,
    discardedPermanentUpdates: 0,
    pendingStops: 0,
  };

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
      const errorCode = safeErrorCode(error);
      if (isPermanentGpsCallableError(error)) {
        if (entry.action === 'UPDATE') {
          current = current.filter((candidate) => candidate.id !== entry.id);
          result.discardedPermanentUpdates += 1;
          continue;
        }
        current = current.map((candidate) => candidate.id === entry.id ? {
          ...candidate,
          retryCount: candidate.retryCount + 1,
          terminal: true,
          nextAttemptAtMs: candidate.expiresAtMs,
          lastErrorCode: errorCode,
        } : candidate);
        result.terminal += 1;
        break;
      }

      const retryCount = entry.retryCount + 1;
      const terminal = retryCount >= MAX_RETRY_COUNT;
      current = current.map((candidate) => candidate.id === entry.id ? {
        ...candidate,
        retryCount,
        terminal,
        nextAttemptAtMs: terminal ? candidate.expiresAtMs : nowMs + retryDelayMs(retryCount),
        lastErrorCode: errorCode,
      } : candidate);
      if (terminal) result.terminal += 1;
      if (entry.action === 'STOP') break;
    }
  }

  writeQueues(storage, current);
  result.pendingStops = current.filter((entry) => entry.technicianUid === uid && entry.action === 'STOP').length;
  return result;
};

export const gpsRetryQueueKeys = Object.freeze({
  stop: STOP_QUEUE_KEY,
  update: UPDATE_QUEUE_KEY,
  legacy: LEGACY_QUEUE_KEYS[0],
});
