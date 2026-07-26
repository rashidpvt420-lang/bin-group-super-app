/**
 * BIN GROUP — Live Technician GPS Tracking Utility
 *
 * Browser geolocation remains foreground-only. Every accepted coordinate is
 * sent to an App-Check protected callable that atomically updates the canonical
 * technician_live_locations document and its compatibility mirrors.
 *
 * Offline privacy contract:
 * - retry state is stored only in sessionStorage, never persistent localStorage;
 * - the storage key is scoped by a SHA-256 hash of the authenticated UID;
 * - UPDATE actions are coalesced to the newest point per session and expire
 *   after 15 minutes;
 * - STOP actions contain no coordinates and expire after 24 hours;
 * - logout/account change purges the scoped queue explicitly.
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
}

export type GpsReadiness = {
    supported: boolean;
    secureContext: boolean;
    permissionState: PermissionState | 'unsupported' | 'unknown';
    userAgent: string;
    platform: string;
};

type StopTrackingStatus = TrackingStatus | 'PRESERVE';
type MinimalQueuedPoint = {
    latitude: number;
    longitude: number;
    accuracy?: number;
    heading?: number | null;
    speed?: number | null;
    deviceTimestampMs?: number;
};

type QueuedTrackingAction = {
    id: string;
    action: 'UPDATE' | 'STOP';
    ticketId: string;
    trackingSessionId: string;
    point?: MinimalQueuedPoint;
    finalStatus?: StopTrackingStatus;
    queuedAtMs: number;
    expiresAtMs: number;
    attempts: number;
    nextAttemptAtMs: number;
    lastAttemptAtMs?: number;
    terminalError?: string;
};

type QueueEnvelope = {
    schemaVersion: 2;
    ownerUidHash: string;
    entries: QueuedTrackingAction[];
};

export type TrackingQueueReplaySummary = {
    sent: number;
    pendingStops: number;
    pendingUpdates: number;
    terminalStops: number;
    terminalUpdates: number;
};

const LEGACY_QUEUE_KEY = 'bin-technician-gps-queue-v1';
const QUEUE_KEY_PREFIX = 'bin-technician-gps-queue-v2:';
const MAX_QUEUE_SIZE = 25;
const MAX_RETRY_ATTEMPTS = 6;
const UPDATE_TTL_MS = 15 * 60 * 1000;
const STOP_TTL_MS = 24 * 60 * 60 * 1000;
const CAPTURE_THROTTLE_MS = 10_000;
const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 60_000;
const TERMINAL_CALLABLE_CODES = new Set(['invalid-argument', 'not-found', 'failed-precondition']);

const _state: TrackingState = {
    watchId: null,
    lastPushTime: 0,
    activeTicketId: null,
    technicianUid: null,
    trackingSessionId: null,
    onlineHandler: null,
};

let replayTechnicianUid: string | null = null;
let globalOnlineHandler: (() => void) | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

const text = (value: unknown) => String(value ?? '').trim();

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

function createQueueEntryId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `queue_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function sessionStorageOrNull(): Storage | null {
    if (typeof window === 'undefined') return null;
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

async function queueIdentity(technicianUid: string): Promise<{ key: string; ownerUidHash: string }> {
    const uid = text(technicianUid);
    if (!uid) throw new Error('TECHNICIAN_UID_REQUIRED');
    if (typeof crypto === 'undefined' || !crypto.subtle || typeof TextEncoder === 'undefined') {
        throw new Error('WEB_CRYPTO_REQUIRED_FOR_GPS_QUEUE');
    }
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uid));
    const ownerUidHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return { key: `${QUEUE_KEY_PREFIX}${ownerUidHash}`, ownerUidHash };
}

function isMinimalPoint(value: any): value is MinimalQueuedPoint {
    return Number.isFinite(Number(value?.latitude)) &&
        Number.isFinite(Number(value?.longitude)) &&
        Number(value.latitude) >= -90 && Number(value.latitude) <= 90 &&
        Number(value.longitude) >= -180 && Number(value.longitude) <= 180;
}

function isQueuedAction(value: any): value is QueuedTrackingAction {
    if (!value || typeof value !== 'object') return false;
    if (!['UPDATE', 'STOP'].includes(value.action)) return false;
    if (!text(value.id) || !text(value.ticketId) || !text(value.trackingSessionId)) return false;
    if (!Number.isFinite(Number(value.queuedAtMs)) || !Number.isFinite(Number(value.expiresAtMs))) return false;
    if (!Number.isInteger(Number(value.attempts)) || Number(value.attempts) < 0) return false;
    if (!Number.isFinite(Number(value.nextAttemptAtMs))) return false;
    if (value.action === 'UPDATE' && !isMinimalPoint(value.point)) return false;
    if (value.action === 'STOP' && value.point !== undefined) return false;
    return true;
}

function sanitizeEntries(entries: unknown, nowMs = Date.now()): QueuedTrackingAction[] {
    if (!Array.isArray(entries)) return [];
    return entries
        .filter(isQueuedAction)
        .filter((entry) => entry.expiresAtMs > nowMs)
        .sort((left, right) => left.queuedAtMs - right.queuedAtMs)
        .slice(-MAX_QUEUE_SIZE);
}

async function readQueue(technicianUid: string): Promise<QueuedTrackingAction[]> {
    const storage = sessionStorageOrNull();
    if (!storage) return [];
    const identity = await queueIdentity(technicianUid);
    try {
        const raw = storage.getItem(identity.key);
        if (!raw) return [];
        const envelope = JSON.parse(raw) as QueueEnvelope;
        if (envelope?.schemaVersion !== 2 || envelope.ownerUidHash !== identity.ownerUidHash) {
            storage.removeItem(identity.key);
            return [];
        }
        const entries = sanitizeEntries(envelope.entries);
        if (entries.length !== envelope.entries?.length) await writeQueue(technicianUid, entries);
        return entries;
    } catch {
        storage.removeItem(identity.key);
        return [];
    }
}

async function writeQueue(technicianUid: string, entries: QueuedTrackingAction[]) {
    const storage = sessionStorageOrNull();
    if (!storage) throw new Error('SESSION_STORAGE_UNAVAILABLE');
    const identity = await queueIdentity(technicianUid);
    const sanitized = sanitizeEntries(entries);
    if (!sanitized.length) {
        storage.removeItem(identity.key);
        return;
    }
    const envelope: QueueEnvelope = {
        schemaVersion: 2,
        ownerUidHash: identity.ownerUidHash,
        entries: sanitized,
    };
    storage.setItem(identity.key, JSON.stringify(envelope));
}

function removeLegacyPersistentQueue() {
    if (typeof window === 'undefined') return;
    try { window.localStorage.removeItem(LEGACY_QUEUE_KEY); } catch { /* unavailable */ }
    try { window.sessionStorage.removeItem(LEGACY_QUEUE_KEY); } catch { /* unavailable */ }
}

async function purgeForeignTrackingQueues(technicianUid: string) {
    const storage = sessionStorageOrNull();
    if (!storage) return;
    const current = await queueIdentity(technicianUid);
    const remove: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(QUEUE_KEY_PREFIX) && key !== current.key) remove.push(key);
    }
    remove.forEach((key) => storage.removeItem(key));
    removeLegacyPersistentQueue();
}

export async function purgeTechnicianTrackingQueue(technicianUid?: string): Promise<void> {
    const storage = sessionStorageOrNull();
    removeLegacyPersistentQueue();
    if (storage) {
        if (text(technicianUid)) {
            const identity = await queueIdentity(text(technicianUid));
            storage.removeItem(identity.key);
        } else {
            const remove: string[] = [];
            for (let index = 0; index < storage.length; index += 1) {
                const key = storage.key(index);
                if (key?.startsWith(QUEUE_KEY_PREFIX)) remove.push(key);
            }
            remove.forEach((key) => storage.removeItem(key));
        }
    }
    if (!technicianUid || replayTechnicianUid === technicianUid) {
        replayTechnicianUid = null;
        if (globalOnlineHandler && typeof window !== 'undefined') {
            window.removeEventListener('online', globalOnlineHandler);
        }
        globalOnlineHandler = null;
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = null;
    }
}

function actionExpiry(action: 'UPDATE' | 'STOP', nowMs: number) {
    return nowMs + (action === 'STOP' ? STOP_TTL_MS : UPDATE_TTL_MS);
}

function queueWithAction(queue: QueuedTrackingAction[], action: QueuedTrackingAction): QueuedTrackingAction[] {
    let next = sanitizeEntries(queue);
    if (action.action === 'UPDATE') {
        next = next.filter((entry) => !(
            entry.action === 'UPDATE' &&
            entry.ticketId === action.ticketId &&
            entry.trackingSessionId === action.trackingSessionId
        ));
    } else {
        next = next.filter((entry) => !(
            entry.ticketId === action.ticketId &&
            entry.trackingSessionId === action.trackingSessionId
        ));
    }

    while (next.length >= MAX_QUEUE_SIZE) {
        const oldestUpdateIndex = next.findIndex((entry) => entry.action === 'UPDATE');
        if (oldestUpdateIndex < 0) throw new Error('GPS_QUEUE_SATURATED_WITH_STOP_ACTIONS');
        next.splice(oldestUpdateIndex, 1);
    }
    next.push(action);
    return next;
}

async function enqueueAction(technicianUid: string, action: QueuedTrackingAction) {
    const queue = await readQueue(technicianUid);
    await writeQueue(technicianUid, queueWithAction(queue, action));
}

async function discardSessionUpdates(technicianUid: string, ticketId: string, trackingSessionId: string) {
    const queue = await readQueue(technicianUid);
    await writeQueue(technicianUid, queue.filter((entry) => !(
        entry.action === 'UPDATE' &&
        entry.ticketId === ticketId &&
        entry.trackingSessionId === trackingSessionId
    )));
}

const publishLiveLocation = httpsCallable(functions, 'updateTechnicianLiveLocation');

async function sendAction(action: QueuedTrackingAction) {
    const point = action.point;
    await publishLiveLocation({
        action: action.action,
        ticketId: action.ticketId,
        trackingSessionId: action.trackingSessionId,
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

function callableErrorCode(error: any) {
    return text(error?.code || error?.details?.code)
        .toLowerCase()
        .replace(/^functions\//, '');
}

function retryDelayMs(attempts: number) {
    return Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** Math.max(0, attempts - 1)));
}

function queueSummary(queue: QueuedTrackingAction[], sent = 0): TrackingQueueReplaySummary {
    return {
        sent,
        pendingStops: queue.filter((entry) => entry.action === 'STOP' && !entry.terminalError).length,
        pendingUpdates: queue.filter((entry) => entry.action === 'UPDATE' && !entry.terminalError).length,
        terminalStops: queue.filter((entry) => entry.action === 'STOP' && Boolean(entry.terminalError)).length,
        terminalUpdates: queue.filter((entry) => entry.action === 'UPDATE' && Boolean(entry.terminalError)).length,
    };
}

function scheduleReplay(technicianUid: string, queue: QueuedTrackingAction[]) {
    if (typeof window === 'undefined') return;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    const nextAttemptAt = Math.min(
        ...queue
            .filter((entry) => !entry.terminalError)
            .map((entry) => entry.nextAttemptAtMs),
    );
    if (!Number.isFinite(nextAttemptAt)) return;
    const delay = Math.max(250, nextAttemptAt - Date.now());
    retryTimer = setTimeout(() => {
        retryTimer = null;
        void flushTechnicianTrackingQueue(technicianUid);
    }, delay);
}

export async function flushTechnicianTrackingQueue(technicianUid: string): Promise<TrackingQueueReplaySummary> {
    const uid = text(technicianUid);
    if (!uid || typeof navigator === 'undefined' || !navigator.onLine) {
        return queueSummary(uid ? await readQueue(uid) : []);
    }

    let queue = await readQueue(uid);
    let sent = 0;
    const blockedSessions = new Set<string>();
    const ordered = [...queue].sort((left, right) => {
        if (left.action !== right.action) return left.action === 'STOP' ? -1 : 1;
        return left.queuedAtMs - right.queuedAtMs;
    });

    for (const original of ordered) {
        const currentIndex = queue.findIndex((entry) => entry.id === original.id);
        if (currentIndex < 0) continue;
        const entry = queue[currentIndex];
        const sessionKey = `${entry.ticketId}|${entry.trackingSessionId}`;
        if (entry.terminalError || entry.nextAttemptAtMs > Date.now() || blockedSessions.has(sessionKey)) continue;

        try {
            await sendAction(entry);
            sent += 1;
            queue = queue.filter((candidate) => candidate.id !== entry.id);
            if (entry.action === 'STOP') {
                queue = queue.filter((candidate) => !(
                    candidate.ticketId === entry.ticketId &&
                    candidate.trackingSessionId === entry.trackingSessionId
                ));
                await persistTrackingDiagnostic(uid, entry.ticketId, {
                    status: 'STOPPED',
                    finalStatus: entry.finalStatus || 'PRESERVE',
                    trackingSessionId: entry.trackingSessionId,
                    stopReplayedAt: serverTimestamp(),
                });
            }
        } catch (error) {
            const code = callableErrorCode(error);
            const attempts = entry.attempts + 1;
            const terminal = TERMINAL_CALLABLE_CODES.has(code) || attempts >= MAX_RETRY_ATTEMPTS;
            queue[currentIndex] = {
                ...entry,
                attempts,
                lastAttemptAtMs: Date.now(),
                nextAttemptAtMs: terminal ? entry.expiresAtMs : Date.now() + retryDelayMs(attempts),
                terminalError: terminal ? (code || 'retry-limit-exceeded') : undefined,
            };
            blockedSessions.add(sessionKey);
            if (entry.action === 'STOP') {
                await persistTrackingDiagnostic(uid, entry.ticketId, {
                    status: terminal ? 'STOP_RECONCILIATION_FAILED' : 'STOP_REQUEST_QUEUED',
                    trackingSessionId: entry.trackingSessionId,
                    retryAttempts: attempts,
                    terminalError: terminal ? (code || 'retry-limit-exceeded') : null,
                    failedAt: serverTimestamp(),
                });
            }
        }
    }

    await writeQueue(uid, queue);
    scheduleReplay(uid, queue);
    return queueSummary(queue, sent);
}

function installGlobalReplay(technicianUid: string) {
    if (typeof window === 'undefined') return;
    replayTechnicianUid = technicianUid;
    if (globalOnlineHandler) return;
    globalOnlineHandler = () => {
        if (replayTechnicianUid) void flushTechnicianTrackingQueue(replayTechnicianUid);
    };
    window.addEventListener('online', globalOnlineHandler);
}

export async function resumeTechnicianTrackingQueue(technicianUid: string): Promise<TrackingQueueReplaySummary> {
    const uid = text(technicianUid);
    if (!uid) return queueSummary([]);
    await purgeForeignTrackingQueues(uid);
    installGlobalReplay(uid);
    const summary = await flushTechnicianTrackingQueue(uid);
    scheduleReplay(uid, await readQueue(uid));
    return summary;
}

function minimalPoint(point: GeoPoint): MinimalQueuedPoint {
    return {
        latitude: point.latitude,
        longitude: point.longitude,
        accuracy: point.accuracy,
        heading: point.heading,
        speed: point.speed,
        deviceTimestampMs: point.deviceTimestampMs,
    };
}

export const startLiveTracking = async (
    ticketId: string,
    technicianUid: string,
    onLocationUpdate?: (loc: GeoPoint) => void,
    onError?: (msg: string) => void,
): Promise<void> => {
    const readiness = await getGpsReadiness();
    await persistTrackingDiagnostic(technicianUid, ticketId, {
        status: readiness.supported ? 'READY' : 'UNSUPPORTED',
        readiness,
        startedAt: serverTimestamp(),
        trackingMode: 'FOREGROUND_BROWSER',
        queueStorage: 'SESSION_ONLY',
        updateQueueTtlMinutes: UPDATE_TTL_MS / 60_000,
    });

    if (!navigator.geolocation) {
        const message = 'Geolocation is not supported by this browser.';
        await persistTrackingDiagnostic(technicianUid, ticketId, { status: 'UNSUPPORTED', error: message, readiness });
        onError?.(message);
        return;
    }

    if (!readiness.secureContext) {
        const message = 'GPS requires a secure HTTPS context.';
        await persistTrackingDiagnostic(technicianUid, ticketId, { status: 'INSECURE_CONTEXT', error: message, readiness });
        onError?.(message);
        return;
    }

    if (_state.watchId !== null && _state.technicianUid && _state.activeTicketId) {
        await stopLiveTracking(_state.technicianUid, _state.activeTicketId, 'PRESERVE');
    }

    const replay = await resumeTechnicianTrackingQueue(technicianUid);
    if (replay.pendingStops > 0 || replay.terminalStops > 0) {
        const message = replay.terminalStops > 0
            ? 'A previous GPS STOP request needs support review before a new tracking session can start.'
            : 'A previous GPS STOP request is waiting for server acknowledgement. Reconnect and retry.';
        await persistTrackingDiagnostic(technicianUid, ticketId, {
            status: 'STOP_RECONCILIATION_REQUIRED',
            pendingStops: replay.pendingStops,
            terminalStops: replay.terminalStops,
            blockedAt: serverTimestamp(),
        });
        onError?.(message);
        return;
    }

    if (_state.watchId !== null) navigator.geolocation.clearWatch(_state.watchId);
    _state.activeTicketId = ticketId;
    _state.technicianUid = technicianUid;
    _state.trackingSessionId = createTrackingSessionId();
    _state.lastPushTime = 0;
    _state.onlineHandler = globalOnlineHandler;

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

            // Advance the capture throttle before the network call. Offline
            // callbacks therefore cannot flood the queue every GPS tick.
            _state.lastPushTime = now;
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
            const action: QueuedTrackingAction = {
                id: createQueueEntryId(),
                action: 'UPDATE',
                ticketId,
                trackingSessionId: _state.trackingSessionId!,
                point: minimalPoint(point),
                queuedAtMs: now,
                expiresAtMs: actionExpiry('UPDATE', now),
                attempts: 0,
                nextAttemptAtMs: now,
            };

            try {
                await flushTechnicianTrackingQueue(technicianUid);
                await sendAction(action);
                onLocationUpdate?.(point);
            } catch (error) {
                try {
                    await enqueueAction(technicianUid, action);
                    scheduleReplay(technicianUid, await readQueue(technicianUid));
                    await persistTrackingDiagnostic(technicianUid, ticketId, {
                        status: 'LOCATION_SYNC_QUEUED',
                        accuracy: position.coords.accuracy,
                        queueExpiresAt: new Date(action.expiresAtMs).toISOString(),
                        error: String(error),
                        failedAt: serverTimestamp(),
                    });
                    onError?.('Location captured in this browser session and waiting for a network-safe server sync.');
                } catch (queueError) {
                    await persistTrackingDiagnostic(technicianUid, ticketId, {
                        status: 'GPS_QUEUE_SATURATED',
                        error: String(queueError),
                        failedAt: serverTimestamp(),
                    });
                    onError?.('GPS retry storage is full. Reconnect before capturing more locations.');
                }
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

    try {
        if (uid && activeTicketId && sessionId) {
            await discardSessionUpdates(uid, activeTicketId, sessionId);
            const now = Date.now();
            const stopAction: QueuedTrackingAction = {
                id: createQueueEntryId(),
                action: 'STOP',
                ticketId: activeTicketId,
                trackingSessionId: sessionId,
                finalStatus,
                queuedAtMs: now,
                expiresAtMs: actionExpiry('STOP', now),
                attempts: 0,
                nextAttemptAtMs: now,
            };

            try {
                await sendAction(stopAction);
                await persistTrackingDiagnostic(uid, activeTicketId, {
                    status: 'STOPPED',
                    finalStatus,
                    trackingSessionId: sessionId,
                    stoppedAt: serverTimestamp(),
                });
            } catch (error) {
                try {
                    await enqueueAction(uid, stopAction);
                    installGlobalReplay(uid);
                    scheduleReplay(uid, await readQueue(uid));
                    await persistTrackingDiagnostic(uid, activeTicketId, {
                        status: 'STOP_REQUEST_QUEUED',
                        finalStatus,
                        trackingSessionId: sessionId,
                        queueExpiresAt: new Date(stopAction.expiresAtMs).toISOString(),
                        error: String(error),
                        failedAt: serverTimestamp(),
                    });
                    console.error('[Tracking] Stop state queued for server reconciliation:', error);
                } catch (queueError) {
                    await persistTrackingDiagnostic(uid, activeTicketId, {
                        status: 'STOP_RECONCILIATION_FAILED',
                        finalStatus,
                        trackingSessionId: sessionId,
                        error: String(queueError),
                        failedAt: serverTimestamp(),
                    });
                    throw queueError;
                }
            }
        }
    } finally {
        _state.watchId = null;
        _state.lastPushTime = 0;
        _state.activeTicketId = null;
        _state.technicianUid = null;
        _state.trackingSessionId = null;
        _state.onlineHandler = globalOnlineHandler;
    }
};
