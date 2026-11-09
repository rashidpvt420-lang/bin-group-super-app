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

type PinnedLike = { geo?: { lat?: unknown; lng?: unknown } | null } | null | undefined;

const finiteCoordinate = (value: unknown) => value !== null && value !== undefined && String(value).trim() !== '' && Number.isFinite(Number(value));

/** True when the property carries its own valid, non-centroid map pin (P1-1, multi-property onboarding). */
export function propertyHasPin(property: PinnedLike, emirates: ReadonlyArray<{ lat: number; lng: number }>): boolean {
    const lat = property?.geo?.lat;
    const lng = property?.geo?.lng;
    if (!finiteCoordinate(lat) || !finiteCoordinate(lng)) return false;
    const la = Number(lat);
    const ln = Number(lng);
    if (la < -90 || la > 90 || ln < -180 || ln > 180 || (la === 0 && ln === 0)) return false;
    return !isEmirateCentroid(la, ln, emirates);
}

/** Index of the first property without its own pin, or -1 when every property is pinned. */
export function firstPropertyMissingPin(properties: ReadonlyArray<PinnedLike>, emirates: ReadonlyArray<{ lat: number; lng: number }>): number {
    return (properties || []).findIndex((property) => !propertyHasPin(property, emirates));
}
