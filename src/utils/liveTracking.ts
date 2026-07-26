/**
 * BIN GROUP — Live Technician GPS Tracking Utility
 *
 * Browser geolocation remains foreground-only. Every accepted coordinate is
 * sent to an App-Check protected callable that atomically updates the canonical
 * technician_live_locations document and its compatibility mirrors.
 *
 * Retry policy:
 * - STOP actions contain no coordinates and are durable in localStorage until
 *   acknowledged, expired, or explicitly purged on account change/logout.
 * - UPDATE actions contain only the latest minimum coordinate for one session,
 *   live in sessionStorage, and expire after five minutes.
 * - a pending STOP is replayed before a new tracking session can start.
 */

import { db, doc, functions, httpsCallable, serverTimestamp, setDoc } from '../lib/firebase';
import {
    browserGpsQueueStorage,
    discardQueuedSessionUpdates,
    enqueueGpsRetryAction,
    hasPendingGpsStop,
    purgeGpsQueueForTechnician,
    purgeGpsQueuesExceptTechnician,
    readGpsRetryQueue,
    removeLegacyGpsQueue,
    replayGpsRetryQueue,
    type QueuedGpsAction,
} from './gpsRetryQueue';

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
    recoveryUid: string | null;
}

export type GpsReadiness = {
    supported: boolean;
    secureContext: boolean;
    permissionState: PermissionState | 'unsupported' | 'unknown';
    userAgent: string;
    platform: string;
};

type StopTrackingStatus = TrackingStatus | 'PRESERVE';
type LiveTrackingAction = {
    action: 'UPDATE' | 'STOP';
    ticketId: string;
    technicianUid: string;
    trackingSessionId: string;
    point?: GeoPoint | QueuedGpsAction['point'];
    queuedAtMs: number;
};

const CAPTURE_INTERVAL_MS = 10_000;

const _state: TrackingState = {
    watchId: null,
    lastPushTime: 0,
    activeTicketId: null,
    technicianUid: null,
    trackingSessionId: null,
    onlineHandler: null,
    recoveryUid: null,
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

const publishLiveLocation = httpsCallable(functions, 'updateTechnicianLiveLocation');

async function sendAction(action: LiveTrackingAction | QueuedGpsAction) {
    const point = action.point;
    await publishLiveLocation({
        action: action.action,
        ticketId: action.ticketId,
        trackingSessionId: action.trackingSessionId,
        ...(point ? {
            latitude: point.latitude,
            longitude: point.longitude,
            accuracy: point.accuracy,
            ...(Object.prototype.hasOwnProperty.call(point, 'heading') ? { heading: (point as GeoPoint).heading } : {}),
            ...(Object.prototype.hasOwnProperty.call(point, 'speed') ? { speed: (point as GeoPoint).speed } : {}),
            deviceTimestampMs: point.deviceTimestampMs,
        } : {}),
    });
}

function detachOnlineRecovery() {
    if (_state.onlineHandler && typeof window !== 'undefined') {
        window.removeEventListener('online', _state.onlineHandler);
    }
    _state.onlineHandler = null;
    _state.recoveryUid = null;
}

async function replayForTechnician(technicianUid: string, ticketIdForDiagnostic?: string) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return { attempted: 0, succeeded: 0, failed: 0, terminal: 0, pendingStops: hasPendingGpsStop(technicianUid) ? 1 : 0 };
    }
    const result = await replayGpsRetryQueue(technicianUid, sendAction);
    if (ticketIdForDiagnostic && result.succeeded > 0) {
        await persistTrackingDiagnostic(technicianUid, ticketIdForDiagnostic, {
            status: result.pendingStops > 0 ? 'STOP_RECONCILIATION_PENDING' : 'QUEUED_ACTIONS_RECONCILED',
            replayedActionCount: result.succeeded,
            failedReplayCount: result.failed,
            terminalReplayCount: result.terminal,
            reconciledAt: serverTimestamp(),
        });
    }
    return result;
}

function installOnlineRecovery(technicianUid: string, ticketIdForDiagnostic?: string) {
    if (typeof window === 'undefined') return;
    detachOnlineRecovery();
    const handler = () => {
        void replayForTechnician(technicianUid, ticketIdForDiagnostic).then((result) => {
            const stillQueued = readGpsRetryQueue().some((entry) => entry.technicianUid === technicianUid);
            if (!stillQueued && _state.watchId === null) detachOnlineRecovery();
            if (result.terminal > 0 && ticketIdForDiagnostic) {
                void persistTrackingDiagnostic(technicianUid, ticketIdForDiagnostic, {
                    status: 'GPS_RETRY_TERMINAL',
                    terminalReplayCount: result.terminal,
                    requiresManualReconciliation: true,
                });
            }
        });
    };
    _state.onlineHandler = handler;
    _state.recoveryUid = technicianUid;
    window.addEventListener('online', handler);
}

export function purgeTechnicianGpsRetryQueue(technicianUid: string) {
    purgeGpsQueueForTechnician(technicianUid, browserGpsQueueStorage());
    if (_state.recoveryUid === technicianUid) detachOnlineRecovery();
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
        retryStoragePolicy: 'STOP_LOCAL_NO_COORDINATES_UPDATE_SESSION_5_MINUTES',
    });

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
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
    detachOnlineRecovery();
    removeLegacyGpsQueue();
    // Account change is an explicit privacy disposal boundary. Entries for a
    // different identity are removed rather than silently exposed or replayed.
    purgeGpsQueuesExceptTechnician(technicianUid);
    installOnlineRecovery(technicianUid, ticketId);

    const replay = await replayForTechnician(technicianUid, ticketId);
    if (replay.pendingStops > 0) {
        const message = replay.terminal > 0
            ? 'A previous GPS stop could not be reconciled automatically. Contact operations before starting another mission.'
            : 'A previous GPS stop is still waiting for server acknowledgement. Reconnect and retry.';
        await persistTrackingDiagnostic(technicianUid, ticketId, {
            status: replay.terminal > 0 ? 'STOP_RECONCILIATION_TERMINAL' : 'STOP_RECONCILIATION_PENDING',
            pendingStopCount: replay.pendingStops,
            requiresManualReconciliation: replay.terminal > 0,
        });
        onError?.(message);
        return;
    }

    _state.activeTicketId = ticketId;
    _state.technicianUid = technicianUid;
    _state.trackingSessionId = createTrackingSessionId();
    _state.lastPushTime = 0;

    _state.watchId = navigator.geolocation.watchPosition(
        async (position) => {
            const now = Date.now();
            if (now - _state.lastPushTime < CAPTURE_INTERVAL_MS) return;

            if (position.coords.accuracy <= 0 || position.coords.accuracy > 100) {
                await persistTrackingDiagnostic(technicianUid, ticketId, {
                    status: 'WEAK_SIGNAL',
                    accuracy: position.coords.accuracy,
                    lastWeakSignalAt: serverTimestamp(),
                });
                return;
            }

            // Advance the capture clock before network work so an outage cannot
            // flood the queue with browser callbacks.
            _state.lastPushTime = now;
            const sessionId = _state.trackingSessionId;
            if (!sessionId) return;

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
            const action: LiveTrackingAction = {
                action: 'UPDATE',
                ticketId,
                technicianUid,
                trackingSessionId: sessionId,
                point,
                queuedAtMs: now,
            };

            try {
                await replayForTechnician(technicianUid, ticketId);
                await sendAction(action);
                onLocationUpdate?.(point);
            } catch (error) {
                enqueueGpsRetryAction({
                    action: 'UPDATE',
                    ticketId,
                    technicianUid,
                    trackingSessionId: sessionId,
                    point,
                    queuedAtMs: now,
                });
                await persistTrackingDiagnostic(technicianUid, ticketId, {
                    status: 'LOCATION_SYNC_QUEUED',
                    accuracy: position.coords.accuracy,
                    errorCode: String((error as any)?.code || 'NETWORK_OR_CALLABLE_ERROR').slice(0, 80),
                    failedAt: serverTimestamp(),
                    queueExpiresWithinMinutes: 5,
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

    let stopAcknowledged = false;
    if (uid && activeTicketId && sessionId) {
        discardQueuedSessionUpdates(uid, activeTicketId, sessionId);
        const stopAction: LiveTrackingAction = {
            action: 'STOP',
            ticketId: activeTicketId,
            technicianUid: uid,
            trackingSessionId: sessionId,
            queuedAtMs: Date.now(),
        };
        try {
            await sendAction(stopAction);
            stopAcknowledged = true;
        } catch (error) {
            enqueueGpsRetryAction({
                action: 'STOP',
                ticketId: activeTicketId,
                technicianUid: uid,
                trackingSessionId: sessionId,
                queuedAtMs: Date.now(),
            });
            installOnlineRecovery(uid, activeTicketId);
            console.error('[Tracking] Stop state queued for server reconciliation:', error);
        }

        await persistTrackingDiagnostic(uid, activeTicketId, stopAcknowledged ? {
            status: 'STOPPED',
            finalStatus,
            trackingSessionId: sessionId,
            stoppedAt: serverTimestamp(),
            serverAcknowledged: true,
        } : {
            status: 'STOP_REQUEST_QUEUED',
            finalStatus,
            trackingSessionId: sessionId,
            stopRequestedAt: serverTimestamp(),
            serverAcknowledged: false,
            requiresReconciliation: true,
        });
    }

    _state.watchId = null;
    _state.lastPushTime = 0;
    _state.activeTicketId = null;
    _state.technicianUid = null;
    _state.trackingSessionId = null;
    if (stopAcknowledged || !uid) detachOnlineRecovery();
};
