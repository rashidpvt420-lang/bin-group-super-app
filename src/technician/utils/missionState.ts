/**
 * P1-5 (audit 9 Nov 2026): the technician mission card used fixed copy ("GPS streaming live to the
 * tenant", "verified within 100m", "Official Labor Timer Active"). This builds the card text from the
 * job's real state instead. Pure, so it can be unit-tested.
 *
 * Server facts this copy must match (functions/index.ts updateTicketLifecycle ARRIVED):
 * GPS accuracy of 100 m or better AND within the 250 m property geofence.
 */
export const ARRIVAL_GEOFENCE_METERS = 250;
export const ARRIVAL_MAX_ACCURACY_METERS = 100;
/** Same threshold the tenant tracking card uses before it shows the position as stale. */
export const LIVE_GPS_MAX_AGE_MS = 2 * 60 * 1000;

export type MissionState = {
  accepted: boolean;
  gpsLive: boolean;
  gpsAgeSeconds: number | null;
  badge: string;
  helper: string;
  actionLabel: string;
};

const upper = (value: unknown) => String(value ?? '').trim().replace(/[\s-]+/g, '_').toUpperCase();

export function timestampMs(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value?.toMillis === 'function') { const n = value.toMillis(); return Number.isFinite(n) ? n : null; }
  if (typeof value?.toDate === 'function') { const n = value.toDate()?.getTime?.(); return Number.isFinite(n) ? n : null; }
  const seconds = value?.seconds ?? value?._seconds;
  if (typeof seconds === 'number' && Number.isFinite(seconds)) return seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Freshest server-side (then client) timestamp of the technician's last shared position. */
export function lastLocationMs(job: any): number | null {
  const candidates = [
    job?.technicianLocationUpdatedAt,
    job?.technicianLocation?.serverUpdatedAt,
    job?.technicianLiveLocation?.serverUpdatedAt,
    job?.technicianLocation?.updatedAt,
    job?.technicianLocation?.timestamp,
    job?.technicianLiveLocation?.updatedAt,
  ].map(timestampMs).filter((n): n is number => n !== null);
  return candidates.length ? Math.max(...candidates) : null;
}

export function describeMissionState(job: any, nowMs: number = Date.now()): MissionState {
  const status = upper(job?.status);
  const tracking = upper(job?.trackingStatus);
  const enRoute = status === 'EN_ROUTE' || status === 'ON_THE_WAY';
  const arrived = status === 'ARRIVED';
  const inProgress = status === 'IN_PROGRESS';
  const accepted = status === 'ACCEPTED' || enRoute || arrived || inProgress;
  const lastMs = lastLocationMs(job);
  const gpsAgeSeconds = lastMs === null ? null : Math.max(0, Math.round((nowMs - lastMs) / 1000));
  const trackingOn = enRoute || tracking === 'LIVE_TRACKING' || tracking === 'EN_ROUTE';
  const gpsLive = trackingOn && lastMs !== null && nowMs - lastMs <= LIVE_GPS_MAX_AGE_MS;

  if (enRoute) {
    return {
      accepted, gpsLive, gpsAgeSeconds,
      badge: 'PHASE 1: EN ROUTE',
      helper: gpsLive
        ? `Live GPS is on. The tenant can see your position (last update ${gpsAgeSeconds}s ago). Drive safely.`
        : 'GPS is not live. The tenant cannot see your position right now. Open the mission to restart live tracking.',
      actionLabel: 'VIEW MISSION & CONFIRM ARRIVAL',
    };
  }
  if (arrived) {
    return {
      accepted, gpsLive, gpsAgeSeconds,
      badge: 'PHASE 2: ARRIVED ON SITE',
      helper: `Arrival checked by the server: within ${ARRIVAL_GEOFENCE_METERS} m of the property pin, with GPS accuracy of ${ARRIVAL_MAX_ACCURACY_METERS} m or better. Next: inspect the fault and take before photos.`,
      actionLabel: 'START WORK & CAPTURE BEFORE PHOTOS',
    };
  }
  if (inProgress) {
    const startedMs = timestampMs(job?.startedAt);
    const elapsed = startedMs === null ? null : Math.max(0, Math.round((nowMs - startedMs) / 60000));
    return {
      accepted, gpsLive, gpsAgeSeconds,
      badge: 'PHASE 3: WORK IN PROGRESS',
      helper: `${elapsed === null ? 'Work started.' : `Work started ${elapsed} min ago.`} When done, take the after photo, record parts used and submit for tenant sign-off.`,
      actionLabel: 'COMPLETE WORK & ATTACH PROOF',
    };
  }
  if (accepted) {
    return {
      accepted, gpsLive, gpsAgeSeconds,
      badge: 'ACCEPTED: READY TO DEPART',
      helper: 'You accepted this mission. Start the route when you leave so live tracking turns on for the tenant.',
      actionLabel: 'OPEN MISSION & START ROUTE',
    };
  }
  return {
    accepted, gpsLive, gpsAgeSeconds,
    badge: 'ASSIGNED: NOT ACCEPTED',
    helper: 'This job is assigned to you but not accepted yet. Open it to accept or decline.',
    actionLabel: 'OPEN MISSION TO ACCEPT',
  };
}
