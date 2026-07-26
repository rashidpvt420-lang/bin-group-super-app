from pathlib import Path
import subprocess


path = Path('src/utils/liveTracking.ts')
source = subprocess.check_output(
    ['git', 'show', 'origin/main:src/utils/liveTracking.ts'],
    text=True,
)

old_import = "import { db, doc, functions, httpsCallable, serverTimestamp, setDoc } from '../lib/firebase';"
new_import = old_import + "\nimport {\n    type QueuedTrackingAction,\n    discardTechnicianSessionUpdates,\n    enqueueTechnicianGpsAction,\n    gpsRetryDelayMs,\n    pendingTechnicianStopCount,\n    purgeOtherTechnicianGpsQueues,\n    readTechnicianGpsQueue,\n    removeTechnicianGpsQueueEntry,\n    replaceTechnicianGpsQueueEntry,\n} from './technicianGpsQueue';"
if old_import not in source:
    raise SystemExit('liveTracking Firebase import marker missing')
source = source.replace(old_import, new_import, 1)

legacy_type_start = source.index('type QueuedTrackingAction = {')
state_start = source.index('const _state: TrackingState = {', legacy_type_start)
source = source[:legacy_type_start] + 'const CAPTURE_INTERVAL_MS = 10_000;\n\n' + source[state_start:]

queue_start = source.index('function readQueue(): QueuedTrackingAction[] {')
publish_start = source.index("const publishLiveLocation = httpsCallable(functions, 'updateTechnicianLiveLocation');", queue_start)
source = source[:queue_start] + source[publish_start:]

flush_start = source.index('async function flushCurrentSessionQueue() {')
start_export = source.index('export const startLiveTracking', flush_start)
flush_block = r'''function trackingErrorCode(error: any) {
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

'''
source = source[:flush_start] + flush_block + source[start_export:]

readiness_marker = '    const readiness = await getGpsReadiness();\n'
readiness_replacement = """    purgeOtherTechnicianGpsQueues(technicianUid);
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
"""
if readiness_marker not in source:
    raise SystemExit('start readiness marker missing')
source = source.replace(readiness_marker, readiness_replacement, 1)

old_state_block = """    _state.activeTicketId = ticketId;
    _state.technicianUid = technicianUid;
    _state.trackingSessionId = createTrackingSessionId();
    _state.lastPushTime = 0;
    _state.onlineHandler = () => { void flushCurrentSessionQueue(); };
    window.addEventListener('online', _state.onlineHandler);
    await flushCurrentSessionQueue();
"""
new_state_block = """    _state.activeTicketId = ticketId;
    _state.technicianUid = technicianUid;
    _state.trackingSessionId = createTrackingSessionId();
    _state.lastPushTime = 0;
    installQueueOnlineReplay(technicianUid);
    await flushTechnicianQueue(technicianUid, ticketId, _state.trackingSessionId);
"""
if old_state_block not in source:
    raise SystemExit('active tracking state marker missing')
source = source.replace(old_state_block, new_state_block, 1)
source = source.replace('if (now - _state.lastPushTime < 10_000) return;', 'if (now - _state.lastPushTime < CAPTURE_INTERVAL_MS) return;', 1)

old_action = """            const action: QueuedTrackingAction = {
                action: 'UPDATE',
                ticketId,
                technicianUid,
                trackingSessionId: _state.trackingSessionId!,
                point,
                queuedAtMs: now,
            };

            try {
                await flushCurrentSessionQueue();
                await sendAction(action);
                _state.lastPushTime = now;
                onLocationUpdate?.(point);
            } catch (error) {
                enqueueAction(action);
"""
new_action = """            const action: Omit<QueuedTrackingAction, 'expiresAtMs' | 'retryCount' | 'nextAttemptAtMs'> = {
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
"""
if old_action not in source:
    raise SystemExit('location action marker missing')
source = source.replace(old_action, new_action, 1)

stop_start = source.index('export const stopLiveTracking = async (')
new_stop = r'''export const stopLiveTracking = async (
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
'''
source = source[:stop_start] + new_stop

required = [
    'export async function getGpsReadiness',
    'export function normalizeLocation',
    'export function calculateDistanceKm',
    'function createTrackingSessionId',
    "status: 'STOP_REQUEST_QUEUED'",
]
for marker in required:
    if marker not in source:
        raise SystemExit(f'required tracking helper missing after patch: {marker}')
for forbidden in [
    "window.localStorage.getItem(QUEUE_KEY)",
    'flushCurrentSessionQueue',
    'enqueueAction(',
]:
    if forbidden in source:
        raise SystemExit(f'forbidden legacy GPS queue marker remains: {forbidden}')

path.write_text(source, encoding='utf-8')
