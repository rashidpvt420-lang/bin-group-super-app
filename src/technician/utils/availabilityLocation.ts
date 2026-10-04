// Dispatch availability GPS for an on-duty Technician.
// Server: functions/technicianAvailabilityLocation.ts (App Check, role and readiness enforced there).
// Mission GPS while EN ROUTE is published only through updateTechnicianLiveLocation.
import { functions, httpsCallable } from '../../lib/firebase';

export const AVAILABILITY_REPORT_INTERVAL_MS = 5 * 60_000;

// Ticket statuses during which a live tracking session publishes mission GPS. The server refuses
// availability reports while that session runs, so only these statuses pause the availability
// reporter. An ASSIGNED / AUTO_ASSIGNED / ACCEPTED mission must NOT pause it: Accept and every
// lifecycle callable require GPS from the last 15 minutes, and before ON THE WAY this reporter is
// the only path that refreshes lastGpsAt.
export const LIVE_TRACKED_MISSION_STATUSES = ['EN_ROUTE', 'ON_THE_WAY', 'LIVE_TRACKING'] as const;

const upperStatus = (value: unknown) => String(value || '').trim().replace(/[\s-]+/g, '_').toUpperCase();

export function isLiveTrackedMission(job: any): boolean {
    if (!job) return false;
    const live = LIVE_TRACKED_MISSION_STATUSES as readonly string[];
    return live.includes(upperStatus(job.status)) || live.includes(upperStatus(job.trackingStatus));
}

export function hasLiveTrackedMission(jobs: ReadonlyArray<any>): boolean {
    return Array.isArray(jobs) && jobs.some((job) => isLiveTrackedMission(job));
}

const reportCallable = httpsCallable(functions, 'reportTechnicianAvailabilityLocation');

function currentPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            reject(new Error('Location services are unavailable on this device.'));
            return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 });
    });
}

export async function reportTechnicianAvailabilityLocation(): Promise<void> {
    const position = await currentPosition();
    await reportCallable({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        deviceTimestampMs: position.timestamp || Date.now(),
    });
}

// A refusal that proves a fix was accepted moments ago (15 s throttle, or a newer fix already on
// record) means the server-side GPS is already fresh; it is not a failure for the caller.
export function isAlreadyFreshAvailabilityRefusal(error: any): boolean {
    const code = String(error?.code || '').toLowerCase();
    const message = String(error?.message || '');
    return code.endsWith('resource-exhausted')
        || /reported moments ago/i.test(message)
        || /older than the last reported availability location/i.test(message);
}

export type DispatchGpsRefreshResult = { ok: boolean; message?: string };

// Send a fresh dispatch GPS fix before a protected mission action (Accept, ON THE WAY, Arrived,
// Start Work, Complete) so the unchanged 15-minute server readiness window can be met. The
// server still validates App Check, role, duty, shift, device, accuracy <= 100 m and capture age.
export async function refreshTechnicianDispatchGps(): Promise<DispatchGpsRefreshResult> {
    try {
        await reportTechnicianAvailabilityLocation();
        return { ok: true };
    } catch (error: any) {
        if (isAlreadyFreshAvailabilityRefusal(error)) return { ok: true };
        const geoDenied = Number(error?.code) === 1;
        const message = geoDenied
            ? 'Location permission is off for BIN GROUP. Allow precise location for the app, then try again.'
            : String(error?.message || 'Fresh GPS could not be shared with dispatch.');
        return { ok: false, message };
    }
}
