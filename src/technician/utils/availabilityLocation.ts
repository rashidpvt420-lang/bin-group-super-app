// Dispatch availability GPS for an on-duty Technician with no active mission.
// Server: functions/technicianAvailabilityLocation.ts (App Check, role and readiness enforced there).
// Mission GPS is still published only through updateTechnicianLiveLocation.
import { functions, httpsCallable } from '../../lib/firebase';

export const AVAILABILITY_REPORT_INTERVAL_MS = 5 * 60_000;

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
