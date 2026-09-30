// F-8: Owner-entered property locations.
// - Pins the Owner types/drops are tagged "owner_manual". "admin_manual" is reserved for the
//   Founder-MFA verification contract and must never be produced by the Owner browser.
// - The emirate centroid is a map-centering hint only; it is never accepted as the property's
//   coordinates.
export const OWNER_MANUAL_GEO_SOURCE = 'owner_manual' as const;

const CENTROID_TOLERANCE = 0.00005; // ~5 m

export function isEmirateCentroid(lat: number, lng: number, emirates: ReadonlyArray<{ lat: number; lng: number }>): boolean {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    return emirates.some((emirate) => Math.abs(emirate.lat - lat) < CENTROID_TOLERANCE && Math.abs(emirate.lng - lng) < CENTROID_TOLERANCE);
}
