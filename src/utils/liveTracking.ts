/**
 * BIN GROUP — Live Technician GPS Tracking Utility
 *
 * Browser geolocation remains foreground-only. Every accepted coordinate is
 * sent to an App-Check protected callable that atomically updates the canonical
 * technician_live_locations document and its compatibility mirrors.
 */

import { db, doc, functions, httpsCallable, serverTimestamp, setDoc } from '../lib/firebase';
import {
    type QueuedTrackingAction,
    discardTechnicianSessionUpdates,
    enqueueTechnicianGpsAction,
    gpsRetryDelayMs,
    pendingTechnicianStopCount,
    purgeOtherTechnicianGpsQueues,
    readTechnicianGpsQueue,
    removeTechnicianGpsQueueEntry,
    replaceTechnicianGpsQueueEntry,
} from './technicianGpsQueue';

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
const CAPTURE_INTERVAL_MS = 10_000;

const publishLiveLocation = httpsCallable(functions, 'updateTechnicianLiveLocation');

function trackingErrorCode(error: any) {
    return String(error?.code || error?.details?.code || error?.message || 'unknown').toLowerCase();
}

function isTerminalTrackingError(error: any) {
    const code = trackingErrorCode(error);
    return [
        'unauthenticated',
        'permission-denied',
        'invalid-argument',
        'not-found',
    ].some((value) => code.includes(value));
}

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

type QueueFlushResult = {
    pendingStopCount: number;
    terminalStopCount: number;
};

async function flushTechnicianQueue(
    technicianUid: string,
    activeTicketId: string | null = _state.activeTicketId,
    trackingSessionId: string | null = _state.trackingSessionId,
): Promise<QueueFlushResult> {
    const pendingBefore = pendingTechnicianStopCount(technicianUid);
    if (typeof navigator === 'undefined' || !navigator.onLine) {
        return { pendingStopCount: pendingBefore, terminalStopCount: 0 };
    }

    // STOP entries are processed before UPDATE entries so a prior session can
    // never be hidden by a new foreground coordinate.
    const queue = readTechnicianGpsQueue(technicianUid).queue
        .slice()
        .sort((left, right) => {
            if (left.action !== right.action) return left.action === 'STOP' ? -1 : 1;
            return left.queuedAtMs - right.queuedAtMs;
        });
    let terminalStopCount = 0;

    for (const entry of queue) {
        if (entry.nextAttemptAtMs > Date.now()) continue;
        if (
            entry.action === 'UPDATE' &&
            (entry.ticketId !== activeTicketId || entry.trackingSessionId !== trackingSessionId)
        ) {
            continue;
        }

        try {
            await sendAction(entry);
            removeTechnicianGpsQueueEntry(technicianUid, entry);
            if (entry.action === 'STOP') {
                await persistTrackingDiagnostic(technicianUid, entry.ticketId, {
                    status: 'STOPPED',
                    trackingSessionId: entry.trackingSessionId,
                    reconciledFromQueue: true,
                    stoppedAt: serverTimestamp(),
                });
            }
        } catch (error) {
            const errorCode = trackingErrorCode(error);
            if (isTerminalTrackingError(error)) {
                removeTechnicianGpsQueueEntry(technicianUid, entry);
                if (entry.action === 'STOP') terminalStopCount += 1;
                await persistTrackingDiagnostic(technicianUid, entry.ticketId, {
                    status: 'GPS_QUEUE_TERMINAL_FAILURE',
                    queuedAction: entry.action,
                    trackingSessionId: entry.trackingSessionId,
                    errorCode,
                    failedAt: serverTimestamp(),
                });
                continue;
            }

            const retryCount = entry.retryCount + 1;
            replaceTechnicianGpsQueueEntry(technicianUid, entry, {
                ...entry,
                retryCount,
                nextAttemptAtMs: Date.now() + gpsRetryDelayMs(retryCount),
                lastErrorCode: errorCode,
            });
            break;
        }
    }

    return {
        pendingStopCount: pendingTechnicianStopCount(technicianUid),
        terminalStopCount,
    };
}

function installQueueOnlineReplay(technicianUid: string) {
    if (typeof window === 'undefined') return;
    if (_state.onlineHandler) window.removeEventListener('online', _state.onlineHandler);
    _state.onlineHandler = () => {
        void flushTechnicianQueue(technicianUid);
    };
    window.addEventListener('online', _state.onlineHandler);
}

export const startLiveTracking = async (
    ticketId: string,
    technicianUid: string,
    onLocationUpdate?: (loc: GeoPoint) => void,
    onError?: (msg: string) => void,
): Promise<void> => {
    purgeOtherTechnicianGpsQueues(technicianUid);
    const priorStopReplay = await flushTechnicianQueue(technicianUid, null, null);
    if (priorStopReplay.pendingStopCount > 0 || priorStopReplay.terminalStopCount > 0) {
        const status = priorStopReplay.pendingStopCount > 0
            ? 'STOP_RECONCILIATION_PENDING'
            : 'STOP_RECONCILIATION_FAILED';
        const message = priorStopReplay.pendingStopCount > 0
            ? 'A previous GPS stop request is still waiting for server acknowledgement.'
            : 'A previous GPS stop request reached a terminal server error and needs support review.';
        await persistTrackingDiagnostic(technicianUid, ticketId, {
            status,
            pendingStopCount: priorStopReplay.pendingStopCount,
            terminalStopCount: priorStopReplay.terminalStopCount,
            failedAt: serverTimestamp(),
        });
        onError?.(`Refusing to start a new GPS session. ${message}`);
        return;
    }

    const readiness = await getGpsReadiness();
    await persistTrackingDiagnostic(technicianUid, ticketId, {
        status: readiness.supported ? 'READY' : 'UNSUPPORTED',
        readiness,
        startedAt: serverTimestamp(),
        trackingMode: 'FOREGROUND_BROWSER',
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
    if (_state.onlineHandler) window.removeEventListener('online', _state.onlineHandler);

    _state.activeTicketId = ticketId;
    _state.technicianUid = technicianUid;
    _state.trackingSessionId = createTrackingSessionId();
    _state.lastPushTime = 0;
    installQueueOnlineReplay(technicianUid);
    await flushTechnicianQueue(technicianUid, ticketId, _state.trackingSessionId);

    _state.watchId = navigator.geolocation.watchPosition(
        async (position) => {
            const now = Date.now();
            if (now - _state.lastPushTime < 10_000) return;

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
            const action: Omit<QueuedTrackingAction, 'expiresAtMs' | 'retryCount' | 'nextAttemptAtMs'> = {
                action: 'UPDATE',
                ticketId,
                trackingSessionId: _state.trackingSessionId!,
                point: {
                    latitude: point.latitude,
                    longitude: point.longitude,
                    accuracy: point.accuracy!,
                    heading: point.heading,
                    speed: point.speed,
                    deviceTimestampMs: point.deviceTimestampMs!,
                },
                queuedAtMs: now,
            };

            // Advance the capture throttle before the network call so an outage
            // cannot flood the bounded queue with every geolocation callback.
            _state.lastPushTime = now;
            try {
                await flushTechnicianQueue(technicianUid, ticketId, _state.trackingSessionId);
                await sendAction({
                    ...action,
                    expiresAtMs: now,
                    retryCount: 0,
                    nextAttemptAtMs: now,
                });
                onLocationUpdate?.(point);
            } catch (error) {
                enqueueTechnicianGpsAction(technicianUid, action, now);
                await persistTrackingDiagnostic(technicianUid, ticketId, {
                    status: 'LOCATION_SYNC_QUEUED',
                    accuracy: position.coords.accuracy,
                    error: String(error),
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

    let stopAcknowledged = false;
    let stopQueued = false;
    if (uid && activeTicketId && sessionId) {
        discardTechnicianSessionUpdates(uid, activeTicketId, sessionId);
        const queuedAtMs = Date.now();
        const stopAction: Omit<QueuedTrackingAction, 'expiresAtMs' | 'retryCount' | 'nextAttemptAtMs'> = {
            action: 'STOP',
            ticketId: activeTicketId,
            trackingSessionId: sessionId,
            queuedAtMs,
        };
        try {
            await sendAction({
                ...stopAction,
                expiresAtMs: queuedAtMs,
                retryCount: 0,
                nextAttemptAtMs: queuedAtMs,
            });
            stopAcknowledged = true;
        } catch (error) {
            enqueueTechnicianGpsAction(uid, stopAction, queuedAtMs);
            stopQueued = true;
            installQueueOnlineReplay(uid);
            console.error('[Tracking] Stop state queued for server reconciliation:', error);
        }

        await persistTrackingDiagnostic(uid, activeTicketId, stopAcknowledged ? {
            status: 'STOPPED',
            finalStatus,
            trackingSessionId: sessionId,
            stoppedAt: serverTimestamp(),
        } : {
            status: 'STOP_REQUEST_QUEUED',
            finalStatus,
            trackingSessionId: sessionId,
            queuedAt: serverTimestamp(),
        });
    }

    if (!stopQueued && _state.onlineHandler && typeof window !== 'undefined') {
        window.removeEventListener('online', _state.onlineHandler);
        _state.onlineHandler = null;
    }
    _state.watchId = null;
    _state.lastPushTime = 0;
    _state.activeTicketId = null;
    _state.technicianUid = null;
    _state.trackingSessionId = null;
};
