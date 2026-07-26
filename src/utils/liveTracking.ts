/**
 * BIN GROUP — Live Technician GPS Tracking Utility
 *
 * Browser geolocation remains foreground-only. Every accepted coordinate is
 * sent to an App-Check protected callable that atomically updates the canonical
 * technician_live_locations document and its compatibility mirrors.
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
export type QueuedTrackingAction = {
    action: 'UPDATE' | 'STOP';
    ticketId: string;
    technicianUid: string;
    trackingSessionId: string;
    point?: GeoPoint;
    queuedAtMs: number;
    expiresAtMs: number;
    retryCount: number;
    lastAttemptAtMs?: number;
};

const QUEUE_KEY = 'bin-technician-gps-queue-v2';
const MAX_QUEUE_SIZE = 25;
const MAX_RETRIES = 5;
const UPDATE_TTL_MS = 10 * 60 * 1000;
const STOP_TTL_MS = 30 * 60 * 1000;
const PUSH_INTERVAL_MS = 10_000;

const _state: TrackingState = {
    watchId: null,
    lastPushTime: 0,
    activeTicketId: null,
    technicianUid: null,
    trackingSessionId: null,
    onlineHandler: null,
};

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
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(dLng / 2) ** 2;
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

function storage(): Storage | null {
    if (typeof window === 'undefined') return null;
    try {
        return window.sessionStorage;
    } catch {
        return null;
    }
}

function isQueueEntry(value: any): value is QueuedTrackingAction {
    return Boolean(
        value &&
        (value.action === 'UPDATE' || value.action === 'STOP') &&
        typeof value.ticketId === 'string' &&
        typeof value.technicianUid === 'string' &&
        typeof value.trackingSessionId === 'string' &&
        Number.isFinite(Number(value.queuedAtMs)) &&
        Number.isFinite(Number(value.expiresAtMs)) &&
        Number.isFinite(Number(value.retryCount)),
    );
}

export function pruneTrackingQueue(queue: QueuedTrackingAction[], nowMs = Date.now()) {
    return queue.filter((entry) => (
        isQueueEntry(entry) &&
        entry.expiresAtMs > nowMs &&
        entry.retryCount < MAX_RETRIES
    ));
}

function readQueue(nowMs = Date.now()): QueuedTrackingAction[] {
    const target = storage();
    if (!target) return [];
    try {
        const value = JSON.parse(target.getItem(QUEUE_KEY) || '[]');
        const queue = Array.isArray(value) ? pruneTrackingQueue(value, nowMs) : [];
        target.setItem(QUEUE_KEY, JSON.stringify(queue));
        return queue;
    } catch {
        target.removeItem(QUEUE_KEY);
        return [];
    }
}

function writeQueue(queue: QueuedTrackingAction[], nowMs = Date.now()) {
    const target = storage();
    if (!target) return;
    const pruned = pruneTrackingQueue(queue, nowMs).slice(-MAX_QUEUE_SIZE);
    if (pruned.length) target.setItem(QUEUE_KEY, JSON.stringify(pruned));
    else target.removeItem(QUEUE_KEY);
}

export function purgeLiveTrackingQueue(technicianUid?: string) {
    const target = storage();
    if (!target) return;
    if (!technicianUid) {
        target.removeItem(QUEUE_KEY);
        return;
    }
    writeQueue(readQueue().filter((entry) => entry.technicianUid === technicianUid));
}

function enqueueAction(action: QueuedTrackingAction) {
    const queue = readQueue();
    if (action.action === 'STOP') {
        const withoutDuplicateStop = queue.filter((entry) => !(
            entry.action === 'STOP' &&
            entry.technicianUid === action.technicianUid &&
            entry.ticketId === action.ticketId &&
            entry.trackingSessionId === action.trackingSessionId
        ));
        withoutDuplicateStop.push(action);
        writeQueue(withoutDuplicateStop);
        return;
    }
    queue.push(action);
    writeQueue(queue);
}

function discardSessionUpdates(technicianUid: string, ticketId: string, trackingSessionId: string) {
    writeQueue(readQueue().filter((entry) => !(
        entry.action === 'UPDATE' &&
        entry.technicianUid === technicianUid &&
        entry.ticketId === ticketId &&
        entry.trackingSessionId === trackingSessionId
    )));
}

function queueHasTechnicianEntries(technicianUid: string) {
    return readQueue().some((entry) => entry.technicianUid === technicianUid);
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

function errorCode(error: any) {
    return String(error?.code || error?.details?.code || '').toLowerCase();
}

export function isTerminalTrackingError(error: any) {
    const code = errorCode(error);
    const message = String(error?.message || '').toLowerCase();
    return (
        code.includes('permission-denied') ||
        code.includes('unauthenticated') ||
        code.includes('invalid-argument') ||
        code.includes('failed-precondition') ||
        message.includes('permission denied') ||
        message.includes('unauthenticated') ||
        message.includes('invalid argument')
    );
}

function removeOnlineHandler() {
    if (_state.onlineHandler && typeof window !== 'undefined') {
        window.removeEventListener('online', _state.onlineHandler);
    }
    _state.onlineHandler = null;
}

function installOnlineHandler(technicianUid: string) {
    removeOnlineHandler();
    if (typeof window === 'undefined') return;
    _state.onlineHandler = () => { void flushTechnicianQueue(technicianUid); };
    window.addEventListener('online', _state.onlineHandler);
}

async function flushTechnicianQueue(technicianUid: string) {
    if (!technicianUid || typeof navigator === 'undefined' || !navigator.onLine) return;
    const queue = readQueue();
    const retained: QueuedTrackingAction[] = [];
    let blocked = false;

    for (const entry of queue) {
        if (entry.technicianUid !== technicianUid) {
            retained.push(entry);
            continue;
        }
        if (blocked) {
            retained.push(entry);
            continue;
        }
        try {
            await sendAction(entry);
        } catch (error) {
            if (isTerminalTrackingError(error)) continue;
            retained.push({
                ...entry,
                retryCount: entry.retryCount + 1,
                lastAttemptAtMs: Date.now(),
            });
            blocked = true;
        }
    }

    writeQueue(retained);
    if (!queueHasTechnicianEntries(technicianUid) && _state.technicianUid !== technicianUid) {
        removeOnlineHandler();
    }
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

    if (_state.watchId !== null) navigator.geolocation.clearWatch(_state.watchId);
    removeOnlineHandler();

    purgeLiveTrackingQueue(technicianUid);
    installOnlineHandler(technicianUid);
    await flushTechnicianQueue(technicianUid);

    _state.activeTicketId = ticketId;
    _state.technicianUid = technicianUid;
    _state.trackingSessionId = createTrackingSessionId();
    _state.lastPushTime = 0;

    _state.watchId = navigator.geolocation.watchPosition(
        async (position) => {
            const now = Date.now();
            if (now - _state.lastPushTime < PUSH_INTERVAL_MS) return;
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
            const action: QueuedTrackingAction = {
                action: 'UPDATE',
                ticketId,
                technicianUid,
                trackingSessionId: _state.trackingSessionId!,
                point,
                queuedAtMs: now,
                expiresAtMs: now + UPDATE_TTL_MS,
                retryCount: 0,
            };

            try {
                await flushTechnicianQueue(technicianUid);
                await sendAction(action);
                onLocationUpdate?.(point);
            } catch (error) {
                if (isTerminalTrackingError(error)) {
                    await persistTrackingDiagnostic(technicianUid, ticketId, {
                        status: 'LOCATION_SYNC_REJECTED',
                        accuracy: position.coords.accuracy,
                        errorCode: errorCode(error) || 'terminal',
                        failedAt: serverTimestamp(),
                    });
                    onError?.('Location sync was rejected by the server. Re-authenticate or verify the assigned ticket.');
                    return;
                }
                enqueueAction(action);
                await persistTrackingDiagnostic(technicianUid, ticketId, {
                    status: 'LOCATION_SYNC_QUEUED',
                    accuracy: position.coords.accuracy,
                    queueStorage: 'SESSION_ONLY',
                    expiresInSeconds: Math.round(UPDATE_TTL_MS / 1000),
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

    let stopQueued = false;
    if (uid && activeTicketId && sessionId) {
        discardSessionUpdates(uid, activeTicketId, sessionId);
        const now = Date.now();
        const stopAction: QueuedTrackingAction = {
            action: 'STOP',
            ticketId: activeTicketId,
            technicianUid: uid,
            trackingSessionId: sessionId,
            queuedAtMs: now,
            expiresAtMs: now + STOP_TTL_MS,
            retryCount: 0,
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
            if (isTerminalTrackingError(error)) {
                await persistTrackingDiagnostic(uid, activeTicketId, {
                    status: 'STOP_REJECTED',
                    finalStatus,
                    trackingSessionId: sessionId,
                    errorCode: errorCode(error) || 'terminal',
                    failedAt: serverTimestamp(),
                });
            } else {
                enqueueAction(stopAction);
                stopQueued = true;
                installOnlineHandler(uid);
                await persistTrackingDiagnostic(uid, activeTicketId, {
                    status: 'STOP_REQUEST_QUEUED',
                    finalStatus,
                    trackingSessionId: sessionId,
                    queueStorage: 'SESSION_ONLY',
                    expiresInSeconds: Math.round(STOP_TTL_MS / 1000),
                    queuedAt: serverTimestamp(),
                });
            }
        }
    }

    _state.watchId = null;
    _state.lastPushTime = 0;
    _state.activeTicketId = null;
    _state.technicianUid = null;
    _state.trackingSessionId = null;
    if (!stopQueued) removeOnlineHandler();
};
