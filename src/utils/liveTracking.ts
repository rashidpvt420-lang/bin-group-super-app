/**
 * BIN GROUP — Live Technician GPS Tracking Utility
 * Provides all geolocation helpers, throttled Firestore writes,
 * GPS safety guards, and ETA calculation.
 *
 * Safety: tracking only starts/stops when explicitly called by
 * the technician after accepting or completing a job.
 */

import { db, doc, updateDoc, serverTimestamp } from '../lib/firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeoPoint {
    lat: number;
    lng: number;
    latitude: number;
    longitude: number;
    accuracy?: number;
    heading?: number | null;
    speed?: number | null;
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
}

// ─── Module-level GPS watch state ─────────────────────────────────────────────

const _state: TrackingState = {
    watchId: null,
    lastPushTime: 0,
    activeTicketId: null,
};

// ─── 1. normalizeLocation ─────────────────────────────────────────────────────

/**
 * Accepts any lat/lng-like object and returns a clean {lat, lng, latitude, longitude}
 * or null if coordinates are missing/invalid.
 */
export function normalizeLocation(input: any): { lat: number; lng: number; latitude: number; longitude: number } | null {
    if (!input) return null;
    const lat = Number(input.lat ?? input.latitude);
    const lng = Number(input.lng ?? input.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat === 0 && lng === 0) return null;
    return { lat, lng, latitude: lat, longitude: lng };
}

// ─── 2. calculateDistanceKm ───────────────────────────────────────────────────

/**
 * Haversine formula. Returns km between two points, or null if either is invalid.
 */
export function calculateDistanceKm(
    origin: any,
    destination: any
): number | null {
    const a = normalizeLocation(origin);
    const b = normalizeLocation(destination);
    if (!a || !b) return null;
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// ─── 3. calculateEtaMinutes ───────────────────────────────────────────────────

/**
 * Returns ETA in minutes given a distance and an average speed.
 * Default speed = 35 km/h (city driving in UAE).
 */
export function calculateEtaMinutes(
    distanceKm: number | null,
    averageSpeedKmh = 35
): number | null {
    if (distanceKm === null || distanceKm < 0) return null;
    return Math.max(1, Math.round((distanceKm / Math.max(averageSpeedKmh, 1)) * 60));
}

// ─── 4. getTicketJobLocation ──────────────────────────────────────────────────

/**
 * Extracts the normalized job/property location from a maintenanceTicket document.
 * Falls back through multiple field names for backward compat.
 */
export function getTicketJobLocation(ticket: any): { lat: number; lng: number; latitude: number; longitude: number } | null {
    if (!ticket) return null;
    return (
        normalizeLocation(ticket.jobLocation) ||
        normalizeLocation(ticket.propertyLocation) ||
        normalizeLocation(ticket.location) ||
        null
    );
}

// ─── 5. getTechnicianLocation ─────────────────────────────────────────────────

/**
 * Extracts the normalized technician location from a maintenanceTicket document.
 */
export function getTechnicianLocation(ticket: any): { lat: number; lng: number; latitude: number; longitude: number } | null {
    if (!ticket) return null;
    return normalizeLocation(ticket.technicianLocation) || null;
}

// ─── 6. normalizeTicketStatus ─────────────────────────────────────────────────

/**
 * Normalizes any legacy or uppercase status string to a canonical lowercase value.
 */
export function normalizeTicketStatus(status: string | undefined | null): string {
    if (!status) return 'open';
    const s = status.toLowerCase().replace(/_/g, '_');
    const map: Record<string, string> = {
        open: 'open',
        pending_assignment: 'open',
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
    return map[s] ?? 'open';
}

// ─── 7. isTrackingActive ──────────────────────────────────────────────────────

/**
 * Returns true if the ticket is in an active tracking state (technician en route).
 */
export function isTrackingActive(
    status: string | undefined | null,
    trackingStatus: string | undefined | null
): boolean {
    const s = normalizeTicketStatus(status);
    const ts = (trackingStatus || '').toLowerCase();
    return (
        s === 'on_the_way' ||
        ts === 'live_tracking' ||
        ts === 'en_route'
    );
}

// ─── 8. buildGoogleMapsDirectionsUrl ─────────────────────────────────────────

/**
 * Builds a Google Maps directions URL from technician location to job location.
 * Falls back to a search URL if either point is missing.
 */
export function buildGoogleMapsDirectionsUrl(
    techLocation: any,
    jobLocation: any
): string {
    const tech = normalizeLocation(techLocation);
    const job = normalizeLocation(jobLocation);
    if (tech && job) {
        return `https://www.google.com/maps/dir/?api=1&origin=${tech.lat},${tech.lng}&destination=${job.lat},${job.lng}&travelmode=driving`;
    }
    if (job) {
        return `https://www.google.com/maps/search/?api=1&query=${job.lat},${job.lng}`;
    }
    return 'https://www.google.com/maps';
}

// ─── Stale label ──────────────────────────────────────────────────────────────

export function getStaleLabel(updatedAt: any): string {
    if (!updatedAt) return 'Location pending';
    const ms = updatedAt?.seconds
        ? updatedAt.seconds * 1000
        : Date.parse(String(updatedAt));
    if (!Number.isFinite(ms)) return 'Location pending';
    const diffMin = Math.round((Date.now() - ms) / 60000);
    if (diffMin <= 1) return 'Updated just now';
    if (diffMin < 60) return `Updated ${diffMin} min ago`;
    return `Updated ${Math.floor(diffMin / 60)}h ago`;
}

export function isLocationStale(updatedAt: any, maxMinutes = 2): boolean {
    if (!updatedAt) return true;
    const ms = updatedAt?.seconds
        ? updatedAt.seconds * 1000
        : Date.parse(String(updatedAt));
    if (!Number.isFinite(ms)) return true;
    return (Date.now() - ms) > maxMinutes * 60 * 1000;
}

// ─── GPS Tracking Core ────────────────────────────────────────────────────────

/**
 * Starts GPS tracking for a technician on an active ticket.
 * Writes throttled location updates to:
 *   - maintenanceTickets/{ticketId}  (technicianLocation)
 *   - technicians/{technicianUid}    (currentLocation, isTracking, activeTicketId)
 *
 * SAFETY: Only writes when explicitly called. Never auto-starts.
 */
export const startLiveTracking = (
    ticketId: string,
    technicianUid: string,
    onLocationUpdate?: (loc: GeoPoint) => void,
    onError?: (msg: string) => void
): void => {
    if (!navigator.geolocation) {
        const msg = 'Geolocation is not supported by this browser.';
        console.error(msg);
        if (onError) onError(msg);
        return;
    }

    // Clear any existing watch first
    if (_state.watchId !== null) {
        navigator.geolocation.clearWatch(_state.watchId);
        _state.watchId = null;
    }

    _state.activeTicketId = ticketId;
    _state.lastPushTime = 0;

    _state.watchId = navigator.geolocation.watchPosition(
        async (position) => {
            const now = Date.now();

            // Throttle: max 1 write per 10 seconds
            if (now - _state.lastPushTime < 10000) return;

            // Safety: reject weak GPS signals
            if (position.coords.accuracy > 100) {
                console.warn(`[Tracking] Weak GPS accuracy: ${position.coords.accuracy}m, skipping.`);
                return;
            }

            const payload: GeoPoint = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                heading: position.coords.heading,
                speed: position.coords.speed,
                updatedAt: serverTimestamp(),
            };

            _state.lastPushTime = now;

            if (onLocationUpdate) onLocationUpdate(payload);

            try {
                await Promise.all([
                    updateDoc(doc(db, 'maintenanceTickets', ticketId), {
                        technicianLocation: payload,
                        technicianLocationUpdatedAt: serverTimestamp(),
                        trackingStatus: 'LIVE_TRACKING',
                        dispatchStatus: 'EN_ROUTE',
                        updatedAt: serverTimestamp(),
                    }),
                    updateDoc(doc(db, 'technicians', technicianUid), {
                        currentLocation: payload,
                        lastLocation: payload,
                        locationUpdatedAt: serverTimestamp(),
                        activeTicketId: ticketId,
                        isOnDuty: true,
                        onDuty: true,
                        isTracking: true,
                        lastSeenAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    }),
                ]);
            } catch (err) {
                console.error('[Tracking] Firestore write failed:', err);
            }
        },
        (error) => {
            let msg = 'Unknown GPS error.';
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    msg = 'GPS permission denied. Please enable location in your browser/device settings.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    msg = 'GPS position unavailable. Check your device GPS.';
                    break;
                case error.TIMEOUT:
                    msg = 'GPS timed out. Try moving to an open area.';
                    break;
            }
            console.error('[Tracking] GPS Error:', msg);
            if (onError) onError(msg);
        },
        {
            enableHighAccuracy: true,
            maximumAge: 30000,
            timeout: 27000,
        }
    );
};

/**
 * Stops GPS tracking and clears live tracking flags.
 * SAFETY: Always call this on ARRIVED, COMPLETED, or CANCELLED.
 * Backward-compatible: existing callers may pass only technicianUid.
 */
export const stopLiveTracking = async (
    technicianUid?: string,
    ticketId?: string,
    finalStatus: TrackingStatus = 'ARRIVED'
): Promise<void> => {
    const activeTicketId = ticketId || _state.activeTicketId;

    if (_state.watchId !== null) {
        navigator.geolocation.clearWatch(_state.watchId);
        _state.watchId = null;
    }
    _state.activeTicketId = null;
    _state.lastPushTime = 0;

    const writes: Promise<any>[] = [];

    if (technicianUid) {
        writes.push(updateDoc(doc(db, 'technicians', technicianUid), {
            isTracking: false,
            activeTicketId: null,
            lastSeenAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        }));
    }

    if (activeTicketId) {
        writes.push(updateDoc(doc(db, 'maintenanceTickets', activeTicketId), {
            trackingStatus: finalStatus,
            technicianLocationUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        }));
    }

    try {
        await Promise.all(writes);
    } catch (err) {
        console.error('[Tracking] Failed to stop live tracking cleanly:', err);
    }
};
