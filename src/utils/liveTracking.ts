/**
 * BIN GROUP — Live Technician GPS Tracking Utility
 *
 * Browser geolocation remains foreground-only. Every accepted coordinate is
 * sent to an App-Check protected callable that atomically updates the canonical
 * technician_live_locations document and its compatibility mirrors.
 *
 * Retry data is session-scoped, user-scoped and short-lived. Precise location
 * is never written to localStorage and queued STOP actions are replayed before a
 * new tracking session may start.
 */

import {
    auth,
    db,
    doc,
    functions,
    httpsCallable,
    onAuthStateChanged,
    serverTimestamp,
    setDoc,
} from '../lib/firebase';

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
type QueueActionType = 'UPDATE' | 'STOP';
type QueuedTrackingAction = {
    id: string;
    action: QueueActionType;
    ticketId: string;
    technicianUid: string;
    trackingSessionId: string;
    point?: GeoPoint;
    finalStatus?: StopTrackingStatus;
    queuedAtMs: number;
    expiresAtMs: number;
    attemptCount: number;
    lastAttemptAtMs?: number;
    lastErrorCode?: string;
};

type FlushResult = {
    sent: number;
    retained: number;
    discarded: number;
    pendingStop: boolean;
};

const LEGACY_QUEUE_KEY = 'bin-technician-gps-queue-v1';
const QUEUE_KEY = 'bin-technician-gps-queue-v2';
const MAX_QUEUE_SIZE = 25;
const MAX_RETRY_ATTEMPTS = 5;
const UPDATE_TTL_MS = 2 * 60 * 1000;
const STOP_TTL_MS = 30 * 60 * 1000;
const CAPTURE_THROTTLE_MS = 10_000;

const _state: TrackingState = {
    watchId: null,
    lastPushTime: 0,
    activeTicketId: null,
    technicianUid: null,
    trackingSessionId: null,
    onlineHandler: null,
};

let onlineReplayInstalled = false;

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
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
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

function createQueueId() {
    return `gpsq_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function queueStorage(): Storage | null {
    if (typeof window === 'undefined') return null;
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

function purgeLegacyPersistentQueue() {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(LEGACY_QUEUE_KEY);
        window.localStorage.removeItem(QUEUE_KEY);
    } catch {
        // localStorage may be unavailable. No new queue data is written there.
    }
}

function validQueuedAction(value: any, nowMs: number): value is QueuedTrackingAction {
    const normalizedPoint = value?.point ? normalizeLocation(value.point) : null;
    return Boolean(
        value &&
        typeof value === 'object' &&
        ['UPDATE', 'STOP'].includes(value.action) &&
        text(value.id) &&
        text(value.ticketId) &&
        text(value.technicianUid) &&
        /^[A-Za-z0-9_-]{8,128}$/.test(text(value.trackingSessionId)) &&
        Number.isFinite(value.queuedAtMs) &&
        Number.isFinite(value.expiresAtMs) &&
        value.expiresAtMs > nowMs &&
        Number.isFinite(value.attemptCount) &&
        value.attemptCount >= 0 &&
        (value.action === 'STOP' || normalizedPoint),
    );
}

function readQueue(): QueuedTrackingAction[] {
    purgeLegacyPersistentQueue();
    const storage = queueStorage();
    if (!storage) return [];
    try {
        const nowMs = Date.now();
        const value = JSON.parse(storage.getItem(QUEUE_KEY) || '[]');
        const queue = Array.isArray(value) ? value.filter((entry) => validQueuedAction(entry, nowMs)) : [];
        if (!Array.isArray(value) || queue.length !== value.length) writeQueue(queue);
        return queue;
    } catch {
        storage.removeItem(QUEUE_KEY);
        return [];
    }
}

function prioritizeQueue(queue: QueuedTrackingAction[]) {
    const stops = queue.filter((entry) => entry.action === 'STOP').sort((a, b) => a.queuedAtMs - b.queuedAtMs);
    const updates = queue.filter((entry) => entry.action === 'UPDATE').sort((a, b) => a.queuedAtMs - b.queuedAtMs);
    if (stops.length >= MAX_QUEUE_SIZE) return stops.slice(-MAX_QUEUE_SIZE);
    return [...stops, ...updates.slice(-(MAX_QUEUE_SIZE - stops.length))];
}

function writeQueue(queue: QueuedTrackingAction[]) {
    const storage = queueStorage();
    if (!storage) return;
    const normalized = prioritizeQueue(queue);
    if (normalized.length === 0) storage.removeItem(QUEUE_KEY);
    else storage.setItem(QUEUE_KEY, JSON.stringify(normalized));
}

function minimalQueuedPoint(point: GeoPoint): GeoPoint {
    return {
        lat: point.lat,
        lng: point.lng,
        latitude: point.latitude,
        longitude: point.longitude,
        accuracy: point.accuracy,
        deviceTimestampMs: point.deviceTimestampMs,
    };
}

function enqueueAction(input: Omit<QueuedTrackingAction, 'id' | 'expiresAtMs' | 'attemptCount'>) {
    const queue = readQueue();
    const nowMs = Date.now();
    let next = queue;

    if (input.action === 'STOP') {
        next = next.filter((entry) => !(
            entry.technicianUid === input.technicianUid &&
            entry.ticketId === input.ticketId &&
            entry.trackingSessionId === input.trackingSessionId
        ));
    } else {
        next = next.filter((entry) => !(
            entry.action === 'UPDATE' &&
            entry.technicianUid === input.technicianUid &&
            entry.ticketId === input.ticketId &&
            entry.trackingSessionId === input.trackingSessionId
        ));
    }

    const action: QueuedTrackingAction = {
        ...input,
        point: input.point ? minimalQueuedPoint(input.point) : undefined,
        id: createQueueId(),
        expiresAtMs: nowMs + (input.action === 'STOP' ? STOP_TTL_MS : UPDATE_TTL_MS),
        attemptCount: 0,
    };
    writeQueue([...next, action]);
    ensureOnlineReplayListener();
    return action;
}

function discardSessionUpdates(technicianUid: string, ticketId: string, trackingSessionId: string) {
    writeQueue(readQueue().filter((entry) => !(
        entry.action === 'UPDATE' &&
        entry.technicianUid === technicianUid &&
        entry.ticketId === ticketId &&
        entry.trackingSessionId === trackingSessionId
    )));
}

function discardSessionStop(technicianUid: string, ticketId: string, trackingSessionId: string) {
    writeQueue(readQueue().filter((entry) => !(
        entry.action === 'STOP' &&
        entry.technicianUid === technicianUid &&
        entry.ticketId === ticketId &&
        entry.trackingSessionId === trackingSessionId
    )));
}

export function purgeTechnicianTrackingQueue(technicianUid?: string) {
    const storage = queueStorage();
    purgeLegacyPersistentQueue();
    if (!storage) return;
    if (!technicianUid) {
        storage.removeItem(QUEUE_KEY);
        return;
    }
    writeQueue(readQueue().filter((entry) => entry.technicianUid !== technicianUid));
}

function retainQueueForAuthenticatedTechnician(technicianUid: string) {
    writeQueue(readQueue().filter((entry) => entry.technicianUid === technicianUid));
}

function safeErrorCode(error: any) {
    const value = text(error?.code || error?.name || 'TRACKING_SYNC_FAILED').toUpperCase();
    return value.replace(/[^A-Z0-9_/-]/g, '_').slice(0, 80) || 'TRACKING_SYNC_FAILED';
}

function terminalQueueFailure(error: any) {
    const code = text(error?.code).toLowerCase();
    return [
        'functions/invalid-argument',
        'functions/not-found',
        'functions/permission-denied',
        'functions/failed-precondition',
    ].includes(code);
}

const publishLiveLocation = httpsCallable(functions, 'updateTechnicianLiveLocation');

async function sendAction(action: QueuedTrackingAction) {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid || currentUid !== action.technicianUid) {
        const error = new Error('Authenticated Technician does not match queued GPS owner.');
        (error as any).code = 'functions/permission-denied';
        throw error;
    }
    const point = action.point;
    await publishLiveLocation({
        action: action.action,
        ticketId: action.ticketId,
        trackingSessionId: action.trackingSessionId,
        ...(point ? {
            latitude: point.latitude,
            longitude: point.longitude,
            accuracy: point.accuracy,
            deviceTimestampMs: point.deviceTimestampMs,
        } : {}),
    });
}

function pendingStopForUid(technicianUid: string) {
    return readQueue().some((entry) => entry.technicianUid === technicianUid && entry.action === 'STOP');
}

export async function flushTechnicianTrackingQueue(technicianUid: string): Promise<FlushResult> {
    if (!technicianUid || typeof navigator === 'undefined' || !navigator.onLine) {
        return { sent: 0, retained: readQueue().length, discarded: 0, pendingStop: pendingStopForUid(technicianUid) };
    }

    const queue = readQueue();
    const retained: QueuedTrackingAction[] = [];
    let sent = 0;
    let discarded = 0;

    for (const entry of queue) {
        if (entry.technicianUid !== technicianUid) {
            retained.push(entry);
            continue;
        }
        if (entry.action === 'STOP' && entry.attemptCount >= MAX_RETRY_ATTEMPTS) {
            retained.push(entry);
            continue;
        }
        try {
            await sendAction(entry);
            sent += 1;
            if (entry.action === 'STOP') {
                await persistTrackingDiagnostic(entry.technicianUid, entry.ticketId, {
                    status: 'STOPPED',
                    finalStatus: entry.finalStatus || 'PRESERVE',
                    trackingSessionId: entry.trackingSessionId,
                    stopReconciledAt: serverTimestamp(),
                    queueActionId: entry.id,
                    serverAcknowledged: true,
                });
            }
        } catch (error) {
            const nextAttempt = entry.attemptCount + 1;
            const terminal = terminalQueueFailure(error) || nextAttempt >= MAX_RETRY_ATTEMPTS;
            const failedEntry = {
                ...entry,
                attemptCount: Math.min(nextAttempt, MAX_RETRY_ATTEMPTS),
                lastAttemptAtMs: Date.now(),
                lastErrorCode: safeErrorCode(error),
            };
            if (terminal) {
                await persistTrackingDiagnostic(entry.technicianUid, entry.ticketId, {
                    status: entry.action === 'STOP' ? 'STOP_RECONCILIATION_FAILED' : 'LOCATION_SYNC_DISCARDED',
                    trackingSessionId: entry.trackingSessionId,
                    queueActionId: entry.id,
                    retryCount: nextAttempt,
                    failureCode: safeErrorCode(error),
                    serverAcknowledged: false,
                    failedAt: serverTimestamp(),
                });
                if (entry.action === 'STOP') retained.push(failedEntry);
                else discarded += 1;
                continue;
            }
            retained.push(failedEntry);
        }
    }

    writeQueue(retained);
    return {
        sent,
        retained: retained.length,
        discarded,
        pendingStop: retained.some((entry) => entry.technicianUid === technicianUid && entry.action === 'STOP'),
    };
}

function ensureOnlineReplayListener() {
    if (typeof window === 'undefined' || onlineReplayInstalled) return;
    const handler = () => {
        const uid = auth.currentUser?.uid;
        if (uid) void flushTechnicianTrackingQueue(uid);
    };
    window.addEventListener('online', handler);
    onlineReplayInstalled = true;
    _state.onlineHandler = handler;
}

if (typeof window !== 'undefined') {
    purgeLegacyPersistentQueue();
    ensureOnlineReplayListener();
    onAuthStateChanged(auth, (user) => {
        const nextUid = user?.uid || null;
        if (!nextUid) {
            purgeTechnicianTrackingQueue();
        } else {
            retainQueueForAuthenticatedTechnician(nextUid);
            void flushTechnicianTrackingQueue(nextUid);
        }
    });
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
        retryStorage: 'SESSION_SCOPED',
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

    if (auth.currentUser?.uid !== technicianUid) {
        const message = 'Authenticated Technician identity does not match the requested tracking session.';
        await persistTrackingDiagnostic(technicianUid, ticketId, { status: 'IDENTITY_MISMATCH', error: message });
        onError?.(message);
        return;
    }

    retainQueueForAuthenticatedTechnician(technicianUid);
    const replay = await flushTechnicianTrackingQueue(technicianUid);
    if (replay.pendingStop) {
        const message = 'A previous GPS stop request is still waiting for server acknowledgement. Reconnect and retry before starting a new mission.';
        await persistTrackingDiagnostic(technicianUid, ticketId, {
            status: 'STOP_REQUEST_QUEUED',
            pendingStopCount: readQueue().filter((entry) => entry.technicianUid === technicianUid && entry.action === 'STOP').length,
            error: message,
        });
        onError?.(message);
        return;
    }

    if (_state.watchId !== null) navigator.geolocation.clearWatch(_state.watchId);

    _state.activeTicketId = ticketId;
    _state.technicianUid = technicianUid;
    _state.trackingSessionId = createTrackingSessionId();
    _state.lastPushTime = 0;
    ensureOnlineReplayListener();

    _state.watchId = navigator.geolocation.watchPosition(
        async (position) => {
            const now = Date.now();
            if (now - _state.lastPushTime < CAPTURE_THROTTLE_MS) return;
            _state.lastPushTime = now;

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
            const actionBase = {
                action: 'UPDATE' as const,
                ticketId,
                technicianUid,
                trackingSessionId: _state.trackingSessionId!,
                point,
                queuedAtMs: now,
            };
            const immediateAction: QueuedTrackingAction = {
                ...actionBase,
                id: createQueueId(),
                expiresAtMs: now + UPDATE_TTL_MS,
                attemptCount: 0,
            };

            try {
                await flushTechnicianTrackingQueue(technicianUid);
                await sendAction(immediateAction);
                onLocationUpdate?.(point);
            } catch (error) {
                const queued = enqueueAction(actionBase);
                await persistTrackingDiagnostic(technicianUid, ticketId, {
                    status: 'LOCATION_SYNC_QUEUED',
                    accuracy: position.coords.accuracy,
                    failureCode: safeErrorCode(error),
                    queueActionId: queued.id,
                    queuedUntilMs: queued.expiresAtMs,
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

    if (uid && activeTicketId && sessionId) {
        discardSessionUpdates(uid, activeTicketId, sessionId);
        const nowMs = Date.now();
        const stopBase = {
            action: 'STOP' as const,
            ticketId: activeTicketId,
            technicianUid: uid,
            trackingSessionId: sessionId,
            finalStatus,
            queuedAtMs: nowMs,
        };
        const immediateStop: QueuedTrackingAction = {
            ...stopBase,
            id: createQueueId(),
            expiresAtMs: nowMs + STOP_TTL_MS,
            attemptCount: 0,
        };
        try {
            await sendAction(immediateStop);
            discardSessionStop(uid, activeTicketId, sessionId);
            await persistTrackingDiagnostic(uid, activeTicketId, {
                status: 'STOPPED',
                finalStatus,
                trackingSessionId: sessionId,
                stoppedAt: serverTimestamp(),
                serverAcknowledged: true,
            });
        } catch (error) {
            const queued = enqueueAction(stopBase);
            await persistTrackingDiagnostic(uid, activeTicketId, {
                status: 'STOP_REQUEST_QUEUED',
                finalStatus,
                trackingSessionId: sessionId,
                queueActionId: queued.id,
                queuedUntilMs: queued.expiresAtMs,
                failureCode: safeErrorCode(error),
                stopRequestedAt: serverTimestamp(),
                serverAcknowledged: false,
            });
            console.warn('[Tracking] Stop request queued for server reconciliation.');
        }
    }

    _state.watchId = null;
    _state.lastPushTime = 0;
    _state.activeTicketId = null;
    _state.technicianUid = null;
    _state.trackingSessionId = null;
};
