/**
 * BIN GROUP — Live Technician GPS Tracking Utility
 *
 * Browser geolocation remains foreground-only. Every accepted coordinate is
 * sent to an App-Check protected callable that atomically updates the canonical
 * technician_live_locations document and its compatibility mirrors.
 *
 * Privacy policy for retry data:
 * - queue data is scoped to one authenticated Technician UID;
 * - it is stored only in sessionStorage, so it survives an app reload in the
 *   same tab but not a browser restart;
 * - precise coordinates expire after 30 minutes;
 * - account changes and secure logout purge the queue explicitly;
 * - no raw auth tokens, names, email addresses or device identifiers are kept.
 */

import { db, doc, functions, httpsCallable, serverTimestamp, setDoc } from '../lib/firebase';

export interface GeoPoint {
    lat: number;
    lng: number;
    latitude: number;
    longitude: number;
    accuracy?: number;
    heading?: number | null;
    speed?: number | null;
    deviceTimestampMs?: number;
    updatedAt?: any;
}

export type TrackingStatus =
    | 'WAITING_FOR_TECHNICIAN'
    | 'TECHNICIAN_ASSIGNED'
    | 'LIVE_TRACKING'
    | 'ARRIVED'
    | 'WORK_STARTED'
    | 'COMPLETED'
    | 'CANCELLED';

export interface TrackingState {
    watchId: number | null;
    lastPushTime: number;
    activeTicketId: string | null;
    technicianUid: string | null;
    trackingSessionId: string | null;
    onlineHandler: (() => void) | null;
    queueOwnerUid: string | null;
}

export type GpsReadiness = {
    supported: boolean;
    secureContext: boolean;
    permissionState: PermissionState | 'unsupported' | 'unknown';
    userAgent: string;
    platform: string;
};

type StopTrackingStatus = TrackingStatus | 'PRESERVE';
type QueueActionStatus = 'PENDING' | 'RETRYING' | 'TERMINAL';
type QueuedTrackingAction = {
    id: string;
    action: 'UPDATE' | 'STOP';
    ticketId: string;
    trackingSessionId: string;
    point?: GeoPoint;
    finalStatus?: StopTrackingStatus;
    queuedAtMs: number;
    expiresAtMs: number;
    attempts: number;
    status: QueueActionStatus;
    nextAttemptAtMs: number;
    lastErrorCode?: string;
};

type QueueFlushResult = {
    pendingCount: number;
    pendingStopCount: number;
    terminalCount: number;
    terminalStopCount: number;
};

const QUEUE_KEY_PREFIX = 'bin-technician-gps-queue-v2:';
const LEGACY_QUEUE_KEY = 'bin-technician-gps-queue-v1';
const MAX_QUEUE_SIZE = 25;
const QUEUE_TTL_MS = 30 * 60_000;
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 5_000;
const CAPTURE_THROTTLE_MS = 10_000;

const _state: TrackingState = {
    watchId: null,
    lastPushTime: 0,
    activeTicketId: null,
    technicianUid: null,
    trackingSessionId: null,
    onlineHandler: null,
    queueOwnerUid: null,
};

const queueFlushes = new Map<string, Promise<QueueFlushResult>>();
const memoryUpdateQueues = new Map<string, QueuedTrackingAction[]>();

async function readGpsPermissionState(): Promise<PermissionState | 'unsupported' | 'unknown'> {
    try {
        if (!navigator.permissions?.query) return 'unsupported';
        const permission = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        return permission.state;
    } catch {
        return 'unknown';
    }
}

export async function getGpsReadiness(): Promise<GpsReadiness> {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return {
            supported: false,
            secureContext: false,
            permissionState: 'unsupported',
            userAgent: 'server',
            platform: 'server',
        };
    }

    return {
        supported: 'geolocation' in navigator,
        secureContext: window.isSecureContext === true,
        permissionState: await readGpsPermissionState(),
        userAgent: navigator.userAgent,
        platform: navigator.platform || 'unknown',
    };
}

async function persistTrackingDiagnostic(technicianUid: string, ticketId: string, payload: Record<string, any>) {
    try {
        await setDoc(doc(db, 'technicians', technicianUid, 'deviceReadiness', 'gps'), {
            ticketId,
            ...payload,
            updatedAt: serverTimestamp(),
        }, { merge: true });
    } catch (err) {
        console.warn('[Tracking] Failed to persist GPS readiness diagnostic:', err);
    }
}

export function normalizeLocation(input: any): { lat: number; lng: number; latitude: number; longitude: number } | null {
    if (!input) return null;
    const source = input.location || input;
    const lat = Number(source.lat ?? source.latitude);
    const lng = Number(source.lng ?? source.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat === 0 && lng === 0) return null;
    return { lat, lng, latitude: lat, longitude: lng };
}

export function calculateDistanceKm(origin: any, destination: any): number | null {
    const a = normalizeLocation(origin);
    const b = normalizeLocation(destination);
    if (!a || !b) return null;
    const radiusKm = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const haversine =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * radiusKm * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

/** Straight-line estimate only; this is not traffic-aware routing. */
export function calculateEtaMinutes(distanceKm: number | null, averageSpeedKmh = 35): number | null {
    if (distanceKm === null || distanceKm < 0) return null;
    return Math.max(1, Math.round((distanceKm / Math.max(averageSpeedKmh, 1)) * 60));
}

export function getTicketJobLocation(ticket: any): { lat: number; lng: number; latitude: number; longitude: number } | null {
    if (!ticket) return null;
    return (
        normalizeLocation(ticket.jobLocation) ||
        normalizeLocation(ticket.propertyLocation) ||
        normalizeLocation(ticket.location) ||
        null
    );
}

export function getTechnicianLocation(ticket: any): { lat: number; lng: number; latitude: number; longitude: number } | null {
    if (!ticket) return null;
    return normalizeLocation(ticket.technicianLiveLocation) || normalizeLocation(ticket.technicianLocation) || null;
}

export function normalizeTicketStatus(status: string | undefined | null): string {
    if (!status) return 'open';
    const normalized = status.toLowerCase();
    const map: Record<string, string> = {
        open: 'open',
        pending_assignment: 'open',
        unassigned: 'open',
        accepted: 'accepted',
        assigned: 'accepted',
        technician_assigned: 'accepted',
        on_the_way: 'on_the_way',
        en_route: 'on_the_way',
        live_tracking: 'on_the_way',
        arrived: 'arrived',
        in_progress: 'in_progress',
        work_started: 'in_progress',
        waiting_parts: 'waiting_parts',
        escalated: 'escalated',
        completed: 'completed',
        closed: 'completed',
    };
    return map[normalized] ?? 'open';
}

export function isTrackingActive(status: string | undefined | null, trackingStatus: string | undefined | null): boolean {
    const normalizedStatus = normalizeTicketStatus(status);
    const normalizedTracking = (trackingStatus || '').toLowerCase();
    return normalizedStatus === 'on_the_way' || normalizedTracking === 'live_tracking' || normalizedTracking === 'en_route';
}

export function buildGoogleMapsDirectionsUrl(techLocation: any, jobLocation: any): string {
    const tech = normalizeLocation(techLocation);
    const job = normalizeLocation(jobLocation);
    if (tech && job) {
        return `https://www.google.com/maps/dir/?api=1&origin=${tech.lat},${tech.lng}&destination=${job.lat},${job.lng}&travelmode=driving`;
    }
    if (job) return `https://www.google.com/maps/search/?api=1&query=${job.lat},${job.lng}`;
    return 'https://www.google.com/maps';
}

function timestampMillis(value: any): number | null {
    if (!value) return null;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (Number.isFinite(value.seconds)) return Number(value.seconds) * 1000;
    if (Number.isFinite(value)) return Number(value);
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
}

export function getStaleLabel(updatedAt: any): string {
    const ms = timestampMillis(updatedAt);
    if (ms === null) return 'Location pending';
    const diffMin = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (diffMin <= 1) return 'Updated just now';
    if (diffMin < 60) return `Updated ${diffMin} min ago`;
    return `Updated ${Math.floor(diffMin / 60)}h ago`;
}

export function isLocationStale(updatedAt: any, maxMinutes = 2): boolean {
    const ms = timestampMillis(updatedAt);
    return ms === null || Date.now() - ms > maxMinutes * 60 * 1000;
}

function createTrackingSessionId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID().replace(/-/g, '_');
    }
    return `gps_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function queueKey(technicianUid: string) {
    return `${QUEUE_KEY_PREFIX}${encodeURIComponent(technicianUid)}`;
}

function storage(): Storage | null {
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
        // Storage restrictions must not prevent secure startup or logout.
    }
}

function errorCode(error: any): string {
    const raw = String(error?.code || error?.name || 'retryable').toLowerCase();
    return raw.replace(/[^a-z0-9_/-]/g, '').slice(0, 80) || 'retryable';
}

function isTerminalError(code: string) {
    return /permission-denied|unauthenticated|not-found|invalid-argument|failed-precondition/.test(code);
}

function minimalPoint(point: GeoPoint): GeoPoint {
    const round = (value: number, decimals: number) => Number(value.toFixed(decimals));
    const latitude = round(Number(point.latitude ?? point.lat), 6);
    const longitude = round(Number(point.longitude ?? point.lng), 6);
    return {
        lat: latitude,
        lng: longitude,
        latitude,
        longitude,
        accuracy: Number.isFinite(Number(point.accuracy)) ? round(Number(point.accuracy), 1) : undefined,
        heading: Number.isFinite(Number(point.heading)) ? round(Number(point.heading), 1) : null,
        speed: Number.isFinite(Number(point.speed)) ? round(Number(point.speed), 2) : null,
        deviceTimestampMs: Number.isFinite(Number(point.deviceTimestampMs)) ? Number(point.deviceTimestampMs) : Date.now(),
    };
}

function validQueueEntry(value: any): value is QueuedTrackingAction {
    return Boolean(
        value &&
        typeof value === 'object' &&
        typeof value.id === 'string' &&
        ['UPDATE', 'STOP'].includes(value.action) &&
        typeof value.ticketId === 'string' &&
        typeof value.trackingSessionId === 'string' &&
        Number.isFinite(value.queuedAtMs) &&
        Number.isFinite(value.expiresAtMs) &&
        Number.isFinite(value.attempts) &&
        ['PENDING', 'RETRYING', 'TERMINAL'].includes(value.status),
    );
}

function readQueue(technicianUid: string): QueuedTrackingAction[] {
    if (!technicianUid) return [];
    const session = storage();
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
    return [...persistentStops, ...(memoryUpdateQueues.get(technicianUid) || [])];
}

function compactQueue(queue: QueuedTrackingAction[], nowMs = Date.now()) {
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
        if (index < 0) throw new Error('GPS_STOP_QUEUE_CAPACITY_EXCEEDED');
        const [removed] = active.splice(index, 1);
        if (removed) disposed.push(removed);
    }

    if (terminalStopTombstones.length > 0 && !active.some((entry) => entry.action === 'STOP' && entry.status === 'TERMINAL')) {
        throw new Error('GPS_TERMINAL_STOP_TOMBSTONE_LOST');
    }

    if (disposed.length > 0) {
        const updateCount = disposed.filter((entry) => entry.action === 'UPDATE').length;
        const stopCount = disposed.length - updateCount;
        console.warn(`[Tracking] Explicitly disposed ${disposed.length} expired/saturated queue actions (updates=${updateCount}, stops=${stopCount}).`);
    }
    return active;
}

function writeQueue(technicianUid: string, queue: QueuedTrackingAction[]) {
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

function createQueuedAction(
    action: 'UPDATE' | 'STOP',
    ticketId: string,
    trackingSessionId: string,
    options: { point?: GeoPoint; finalStatus?: StopTrackingStatus } = {},
): QueuedTrackingAction {
    const nowMs = Date.now();
    return {
        id: `${action.toLowerCase()}_${nowMs}_${Math.random().toString(36).slice(2, 8)}`,
        action,
        ticketId,
        trackingSessionId,
        point: options.point ? minimalPoint(options.point) : undefined,
        finalStatus: options.finalStatus,
        queuedAtMs: nowMs,
        expiresAtMs: nowMs + QUEUE_TTL_MS,
        attempts: 0,
        status: 'PENDING',
        nextAttemptAtMs: nowMs,
    };
}

function enqueueAction(technicianUid: string, action: QueuedTrackingAction) {
    writeQueue(technicianUid, [...readQueue(technicianUid), action]);
}

function discardSessionUpdates(technicianUid: string, ticketId: string, trackingSessionId: string) {
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

export function purgeLiveTrackingQueue(technicianUid?: string) {
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

function purgeOtherTechnicianQueues(technicianUid: string) {
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

const publishLiveLocation = httpsCallable(functions, 'updateTechnicianLiveLocation');

async function sendAction(action: QueuedTrackingAction) {
    const point = action.point;
    await publishLiveLocation({
        action: action.action,
        ticketId: action.ticketId,
        trackingSessionId: action.trackingSessionId,
        finalStatus: action.finalStatus,
        ...(point ? {
            latitude: point.latitude,
            longitude: point.longitude,
            accuracy: point.accuracy,
            heading: point.heading,
            speed: point.speed,
            deviceTimestampMs: point.deviceTimestampMs,
        } : {}),
    });
}

async function performQueueFlush(technicianUid: string): Promise<QueueFlushResult> {
    if (!technicianUid || typeof navigator === 'undefined' || !navigator.onLine) {
        const queue = compactQueue(readQueue(technicianUid));
        writeQueue(technicianUid, queue);
        return {
            pendingCount: queue.filter((entry) => entry.status !== 'TERMINAL').length,
            pendingStopCount: queue.filter((entry) => entry.action === 'STOP' && entry.status !== 'TERMINAL').length,
            terminalCount: queue.filter((entry) => entry.status === 'TERMINAL').length,
            terminalStopCount: queue.filter((entry) => entry.action === 'STOP' && entry.status === 'TERMINAL').length,
        };
    }

    const nowMs = Date.now();
    const queue = compactQueue(readQueue(technicianUid), nowMs);
    const retained: QueuedTrackingAction[] = [];

    for (const entry of queue) {
        if (entry.status === 'TERMINAL' || entry.nextAttemptAtMs > nowMs) {
            retained.push(entry);
            continue;
        }
        try {
            await sendAction(entry);
            if (entry.action === 'STOP') {
                await persistTrackingDiagnostic(technicianUid, entry.ticketId, {
                    status: 'STOPPED',
                    finalStatus: entry.finalStatus || 'PRESERVE',
                    trackingSessionId: entry.trackingSessionId,
                    stopAcknowledgedAt: serverTimestamp(),
                });
            }
        } catch (error: any) {
            const attempts = entry.attempts + 1;
            const code = errorCode(error);
            const terminal = attempts >= MAX_RETRY_ATTEMPTS || isTerminalError(code);
            const updated: QueuedTrackingAction = {
                ...entry,
                attempts,
                status: terminal ? 'TERMINAL' : 'RETRYING',
                nextAttemptAtMs: terminal ? entry.expiresAtMs : nowMs + RETRY_BASE_DELAY_MS * (2 ** Math.min(attempts - 1, 4)),
                lastErrorCode: code,
            };
            retained.push(updated);
            await persistTrackingDiagnostic(technicianUid, entry.ticketId, {
                status: entry.action === 'STOP'
                    ? terminal ? 'STOP_RECONCILIATION_REQUIRED' : 'STOP_REQUEST_QUEUED'
                    : terminal ? 'LOCATION_SYNC_TERMINAL' : 'LOCATION_SYNC_QUEUED',
                trackingSessionId: entry.trackingSessionId,
                queueAttempts: attempts,
                queueExpiresAtMs: entry.expiresAtMs,
                terminal,
                errorCode: code,
                failedAt: serverTimestamp(),
            });
        }
    }

    writeQueue(technicianUid, retained);
    const current = readQueue(technicianUid);
    return {
        pendingCount: current.filter((entry) => entry.status !== 'TERMINAL').length,
        pendingStopCount: current.filter((entry) => entry.action === 'STOP' && entry.status !== 'TERMINAL').length,
        terminalCount: current.filter((entry) => entry.status === 'TERMINAL').length,
        terminalStopCount: current.filter((entry) => entry.action === 'STOP' && entry.status === 'TERMINAL').length,
    };
}

export async function flushLiveTrackingQueue(technicianUid: string): Promise<QueueFlushResult> {
    const existing = queueFlushes.get(technicianUid);
    if (existing) return existing;
    const pending = performQueueFlush(technicianUid).finally(() => queueFlushes.delete(technicianUid));
    queueFlushes.set(technicianUid, pending);
    return pending;
}

function ensureQueueReplayListener(technicianUid: string) {
    if (typeof window === 'undefined') return;
    if (_state.onlineHandler && _state.queueOwnerUid !== technicianUid) {
        window.removeEventListener('online', _state.onlineHandler);
        _state.onlineHandler = null;
        _state.queueOwnerUid = null;
    }
    if (_state.onlineHandler) return;
    _state.queueOwnerUid = technicianUid;
    _state.onlineHandler = () => { void flushLiveTrackingQueue(technicianUid); };
    window.addEventListener('online', _state.onlineHandler);
}

function releaseQueueReplayListenerIfIdle(technicianUid: string) {
    if (typeof window === 'undefined') return;
    if (readQueue(technicianUid).length > 0) return;
    if (_state.onlineHandler && _state.queueOwnerUid === technicianUid) {
        window.removeEventListener('online', _state.onlineHandler);
        _state.onlineHandler = null;
        _state.queueOwnerUid = null;
    }
}

export const startLiveTracking = async (
    ticketId: string,
    technicianUid: string,
    onLocationUpdate?: (loc: GeoPoint) => void,
    onError?: (msg: string) => void,
): Promise<boolean> => {
    const readiness = await getGpsReadiness();
    await persistTrackingDiagnostic(technicianUid, ticketId, {
        status: readiness.supported ? 'READY' : 'UNSUPPORTED',
        readiness,
        startedAt: serverTimestamp(),
        trackingMode: 'FOREGROUND_BROWSER',
        retryStoragePolicy: 'MEMORY_UPDATES_COORDINATE_FREE_SESSION_STOPS',
    });

    if (!navigator.geolocation) {
        const message = 'Geolocation is not supported by this browser.';
        await persistTrackingDiagnostic(technicianUid, ticketId, { status: 'UNSUPPORTED', error: message, readiness });
        onError?.(message);
        return false;
    }

    if (!readiness.secureContext) {
        const message = 'GPS requires a secure HTTPS context.';
        await persistTrackingDiagnostic(technicianUid, ticketId, { status: 'INSECURE_CONTEXT', error: message, readiness });
        onError?.(message);
        return false;
    }

    purgeOtherTechnicianQueues(technicianUid);
    discardAllQueuedUpdates(technicianUid);
    ensureQueueReplayListener(technicianUid);
    const replay = await flushLiveTrackingQueue(technicianUid);
    if (replay.pendingStopCount > 0 || replay.terminalStopCount > 0) {
        const message = replay.terminalStopCount > 0
            ? 'A previous GPS STOP requires Admin/server reconciliation before a new tracking session can start.'
            : 'A previous GPS STOP is still queued. Reconnect and allow it to sync before starting another session.';
        await persistTrackingDiagnostic(technicianUid, ticketId, {
            status: replay.terminalStopCount > 0 ? 'STOP_RECONCILIATION_REQUIRED' : 'STOP_REQUEST_QUEUED',
            pendingStopCount: replay.pendingStopCount,
            terminalStopCount: replay.terminalStopCount,
            blockedNewSessionAt: serverTimestamp(),
        });
        onError?.(message);
        throw new Error(message);
    }

    if (_state.watchId !== null) navigator.geolocation.clearWatch(_state.watchId);

    _state.activeTicketId = ticketId;
    _state.technicianUid = technicianUid;
    _state.trackingSessionId = createTrackingSessionId();
    _state.lastPushTime = 0;

    _state.watchId = navigator.geolocation.watchPosition(
        async (position) => {
            const now = Date.now();
            if (now - _state.lastPushTime < CAPTURE_THROTTLE_MS) return;

            if (position.coords.accuracy <= 0 || position.coords.accuracy > 100) {
                await persistTrackingDiagnostic(technicianUid, ticketId, {
                    status: 'WEAK_SIGNAL',
                    accuracy: position.coords.accuracy,
                    lastWeakSignalAt: serverTimestamp(),
                });
                return;
            }

            const point: GeoPoint = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                heading: position.coords.heading,
                speed: position.coords.speed,
                deviceTimestampMs: position.timestamp || now,
                updatedAt: new Date(now).toISOString(),
            };
            const action = createQueuedAction('UPDATE', ticketId, _state.trackingSessionId!, { point });

            // Capture throttling applies whether the network call succeeds or fails.
            _state.lastPushTime = now;
            try {
                await flushLiveTrackingQueue(technicianUid);
                await sendAction(action);
                onLocationUpdate?.(minimalPoint(point));
            } catch (error: any) {
                enqueueAction(technicianUid, action);
                await persistTrackingDiagnostic(technicianUid, ticketId, {
                    status: 'LOCATION_SYNC_QUEUED',
                    accuracy: position.coords.accuracy,
                    queueExpiresAtMs: action.expiresAtMs,
                    errorCode: errorCode(error),
                    failedAt: serverTimestamp(),
                });
                onError?.('Location captured but waiting for a network-safe server sync.');
            }
        },
        async (error) => {
            let message = 'Unknown GPS error.';
            let status = 'GPS_ERROR';
            if (error.code === error.PERMISSION_DENIED) {
                message = 'GPS permission denied. Enable location in your browser or device settings.';
                status = 'PERMISSION_DENIED';
            } else if (error.code === error.POSITION_UNAVAILABLE) {
                message = 'GPS position unavailable. Check the device GPS signal.';
                status = 'POSITION_UNAVAILABLE';
            } else if (error.code === error.TIMEOUT) {
                message = 'GPS timed out. Move to an open area and retry.';
                status = 'TIMEOUT';
            }
            await persistTrackingDiagnostic(technicianUid, ticketId, {
                status,
                error: message,
                errorCode: error.code,
                failedAt: serverTimestamp(),
            });
            onError?.(message);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 15_000,
            timeout: 27_000,
        },
    );
    return true;
};

export const stopLiveTracking = async (
    technicianUid?: string,
    ticketId?: string,
    finalStatus: StopTrackingStatus = 'PRESERVE',
): Promise<void> => {
    const uid = technicianUid || _state.technicianUid;
    const activeTicketId = ticketId || _state.activeTicketId;
    const sessionId = _state.trackingSessionId;

    if (_state.watchId !== null && typeof navigator !== 'undefined') navigator.geolocation.clearWatch(_state.watchId);

    if (uid) ensureQueueReplayListener(uid);
    if (uid && activeTicketId && sessionId) {
        discardSessionUpdates(uid, activeTicketId, sessionId);
        const stopAction = createQueuedAction('STOP', activeTicketId, sessionId, { finalStatus });
        let acknowledged = false;
        try {
            await sendAction(stopAction);
            acknowledged = true;
        } catch (error: any) {
            enqueueAction(uid, stopAction);
            await persistTrackingDiagnostic(uid, activeTicketId, {
                status: 'STOP_REQUEST_QUEUED',
                finalStatus,
                trackingSessionId: sessionId,
                queueExpiresAtMs: stopAction.expiresAtMs,
                errorCode: errorCode(error),
                stopRequestedAt: serverTimestamp(),
            });
            console.error('[Tracking] Stop state queued for server reconciliation:', errorCode(error));
        }

        if (acknowledged) {
            await persistTrackingDiagnostic(uid, activeTicketId, {
                status: 'STOPPED',
                finalStatus,
                trackingSessionId: sessionId,
                stopAcknowledgedAt: serverTimestamp(),
            });
        }
    } else if (uid) {
        await flushLiveTrackingQueue(uid);
    }

    _state.watchId = null;
    _state.lastPushTime = 0;
    _state.activeTicketId = null;
    _state.technicianUid = null;
    _state.trackingSessionId = null;

    if (uid) releaseQueueReplayListenerIfIdle(uid);
};
