export type QueuedTrackingPoint = {
    latitude: number;
    longitude: number;
    accuracy: number;
    deviceTimestampMs: number;
    heading?: number | null;
    speed?: number | null;
};

export type QueuedTrackingAction = {
    action: 'UPDATE' | 'STOP';
    ticketId: string;
    trackingSessionId: string;
    point?: QueuedTrackingPoint;
    queuedAtMs: number;
    expiresAtMs: number;
    retryCount: number;
    nextAttemptAtMs: number;
    lastErrorCode?: string;
};

export type QueueMutationResult = {
    queue: QueuedTrackingAction[];
    expiredCount: number;
    droppedUpdateCount: number;
};

export const TECHNICIAN_GPS_QUEUE_PREFIX = 'bin-technician-gps-queue-v2:';
export const MAX_TECHNICIAN_GPS_QUEUE_SIZE = 25;
export const UPDATE_QUEUE_TTL_MS = 5 * 60 * 1000;
export const STOP_QUEUE_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_TECHNICIAN_GPS_RETRIES = 8;

const safeUid = (uid: string) => String(uid || '').trim().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128);
const queueKey = (uid: string) => `${TECHNICIAN_GPS_QUEUE_PREFIX}${safeUid(uid)}`;

const sessionStorageSafe = (): Storage | null => {
    if (typeof window === 'undefined') return null;
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
};

const finite = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : null;

function sanitizeEntry(value: any): QueuedTrackingAction | null {
    if (!value || (value.action !== 'UPDATE' && value.action !== 'STOP')) return null;
    const ticketId = String(value.ticketId || '').trim();
    const trackingSessionId = String(value.trackingSessionId || '').trim();
    const queuedAtMs = finite(value.queuedAtMs);
    const expiresAtMs = finite(value.expiresAtMs);
    const retryCount = Math.max(0, Math.floor(finite(value.retryCount) ?? 0));
    const nextAttemptAtMs = Math.max(0, finite(value.nextAttemptAtMs) ?? 0);
    if (!ticketId || !trackingSessionId || queuedAtMs === null || expiresAtMs === null) return null;

    if (value.action === 'STOP') {
        return {
            action: 'STOP',
            ticketId,
            trackingSessionId,
            queuedAtMs,
            expiresAtMs,
            retryCount,
            nextAttemptAtMs,
            lastErrorCode: String(value.lastErrorCode || '').trim() || undefined,
        };
    }

    const latitude = finite(value.point?.latitude);
    const longitude = finite(value.point?.longitude);
    const accuracy = finite(value.point?.accuracy);
    const deviceTimestampMs = finite(value.point?.deviceTimestampMs);
    if (
        latitude === null || longitude === null || accuracy === null || deviceTimestampMs === null ||
        latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 ||
        accuracy <= 0 || accuracy > 100
    ) return null;

    return {
        action: 'UPDATE',
        ticketId,
        trackingSessionId,
        point: {
            latitude,
            longitude,
            accuracy,
            deviceTimestampMs,
            heading: finite(value.point?.heading),
            speed: finite(value.point?.speed),
        },
        queuedAtMs,
        expiresAtMs,
        retryCount,
        nextAttemptAtMs,
        lastErrorCode: String(value.lastErrorCode || '').trim() || undefined,
    };
}

export function readTechnicianGpsQueue(uid: string, nowMs = Date.now()): QueueMutationResult {
    const storage = sessionStorageSafe();
    if (!storage || !safeUid(uid)) return { queue: [], expiredCount: 0, droppedUpdateCount: 0 };
    try {
        const parsed = JSON.parse(storage.getItem(queueKey(uid)) || '[]');
        const entries = Array.isArray(parsed) ? parsed.map(sanitizeEntry).filter(Boolean) as QueuedTrackingAction[] : [];
        const queue = entries.filter((entry) => entry.expiresAtMs > nowMs && entry.retryCount < MAX_TECHNICIAN_GPS_RETRIES);
        const expiredCount = entries.length - queue.length;
        if (expiredCount > 0) writeTechnicianGpsQueue(uid, queue);
        return { queue, expiredCount, droppedUpdateCount: 0 };
    } catch {
        storage.removeItem(queueKey(uid));
        return { queue: [], expiredCount: 0, droppedUpdateCount: 0 };
    }
}

export function writeTechnicianGpsQueue(uid: string, queue: QueuedTrackingAction[]): QueueMutationResult {
    const storage = sessionStorageSafe();
    if (!storage || !safeUid(uid)) return { queue: [], expiredCount: 0, droppedUpdateCount: 0 };

    const sanitized = queue.map(sanitizeEntry).filter(Boolean) as QueuedTrackingAction[];
    let droppedUpdateCount = 0;
    while (sanitized.length > MAX_TECHNICIAN_GPS_QUEUE_SIZE) {
        const oldestUpdateIndex = sanitized.findIndex((entry) => entry.action === 'UPDATE');
        if (oldestUpdateIndex < 0) {
            throw new Error('TECHNICIAN_GPS_STOP_QUEUE_CAPACITY_EXCEEDED');
        }
        sanitized.splice(oldestUpdateIndex, 1);
        droppedUpdateCount += 1;
    }

    if (sanitized.length === 0) storage.removeItem(queueKey(uid));
    else storage.setItem(queueKey(uid), JSON.stringify(sanitized));
    return { queue: sanitized, expiredCount: 0, droppedUpdateCount };
}

export function enqueueTechnicianGpsAction(
    uid: string,
    action: Omit<QueuedTrackingAction, 'expiresAtMs' | 'retryCount' | 'nextAttemptAtMs'>,
    nowMs = Date.now(),
): QueueMutationResult {
    const current = readTechnicianGpsQueue(uid, nowMs).queue;
    let queue = current;

    if (action.action === 'STOP') {
        queue = queue.filter((entry) => !(
            entry.ticketId === action.ticketId &&
            entry.trackingSessionId === action.trackingSessionId
        ));
    } else {
        queue = queue.filter((entry) => !(
            entry.action === 'UPDATE' &&
            entry.ticketId === action.ticketId &&
            entry.trackingSessionId === action.trackingSessionId
        ));
    }

    queue.push({
        ...action,
        expiresAtMs: nowMs + (action.action === 'STOP' ? STOP_QUEUE_TTL_MS : UPDATE_QUEUE_TTL_MS),
        retryCount: 0,
        nextAttemptAtMs: nowMs,
    });
    return writeTechnicianGpsQueue(uid, queue);
}

export function removeTechnicianGpsQueueEntry(uid: string, target: QueuedTrackingAction) {
    const queue = readTechnicianGpsQueue(uid).queue.filter((entry) => !(
        entry.action === target.action &&
        entry.ticketId === target.ticketId &&
        entry.trackingSessionId === target.trackingSessionId &&
        entry.queuedAtMs === target.queuedAtMs
    ));
    return writeTechnicianGpsQueue(uid, queue);
}

export function replaceTechnicianGpsQueueEntry(
    uid: string,
    target: QueuedTrackingAction,
    replacement: QueuedTrackingAction,
) {
    const queue = readTechnicianGpsQueue(uid).queue.map((entry) => (
        entry.action === target.action &&
        entry.ticketId === target.ticketId &&
        entry.trackingSessionId === target.trackingSessionId &&
        entry.queuedAtMs === target.queuedAtMs
            ? replacement
            : entry
    ));
    return writeTechnicianGpsQueue(uid, queue);
}

export function discardTechnicianSessionUpdates(uid: string, ticketId: string, trackingSessionId: string) {
    return writeTechnicianGpsQueue(uid, readTechnicianGpsQueue(uid).queue.filter((entry) => !(
        entry.action === 'UPDATE' &&
        entry.ticketId === ticketId &&
        entry.trackingSessionId === trackingSessionId
    )));
}

export function pendingTechnicianStopCount(uid: string) {
    return readTechnicianGpsQueue(uid).queue.filter((entry) => entry.action === 'STOP').length;
}

export function purgeTechnicianGpsQueue(uid: string) {
    sessionStorageSafe()?.removeItem(queueKey(uid));
}

export function purgeOtherTechnicianGpsQueues(activeUid: string) {
    const storage = sessionStorageSafe();
    if (!storage) return;
    const activeKey = queueKey(activeUid);
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(TECHNICIAN_GPS_QUEUE_PREFIX) && key !== activeKey) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
}

export function gpsRetryDelayMs(retryCount: number) {
    return Math.min(5 * 60_000, Math.max(5_000, 5_000 * (2 ** Math.max(0, retryCount))));
}
