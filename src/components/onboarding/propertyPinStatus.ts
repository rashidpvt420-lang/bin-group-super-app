// P1-1: every property in a multi-property onboarding needs its own exact pin.
// Pure helpers shared by the location step, the review step and unit tests.
import { isEmirateCentroid } from './ownerLocationRules';

export const UAE_EMIRATE_CENTROIDS: ReadonlyArray<{ lat: number; lng: number }> = [
    { lat: 25.2048, lng: 55.2708 },
    { lat: 24.4539, lng: 54.3773 },
    { lat: 25.3463, lng: 55.4209 },
    { lat: 25.4052, lng: 55.5136 },
    { lat: 25.5647, lng: 55.5552 },
    { lat: 25.8007, lng: 55.9762 },
    { lat: 25.1288, lng: 56.3265 },
];

type PinnableProperty = { geo?: { lat?: unknown; lng?: unknown } | null } | null | undefined;

const isValidLatLngValue = (lat: number, lng: number) =>
    Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

export function hasValidPropertyPin(property: PinnableProperty): boolean {
    const rawLat = property?.geo?.lat;
    const rawLng = property?.geo?.lng;
    if (rawLat == null || rawLng == null || String(rawLat).trim() === '' || String(rawLng).trim() === '') return false;
    const lat = Number(rawLat);
    const lng = Number(rawLng);
    if (!isValidLatLngValue(lat, lng)) return false;
    return !isEmirateCentroid(lat, lng, UAE_EMIRATE_CENTROIDS);
}

/** Index of the first property without a valid, non-centroid pin, or -1 when all are pinned. */
export function firstUnpinnedPropertyIndex(properties: ReadonlyArray<PinnableProperty>, skipIndex = -1): number {
    return properties.findIndex((property, index) => index !== skipIndex && !hasValidPropertyPin(property));
}

export function propertiesMissingGps(properties: ReadonlyArray<PinnableProperty>): boolean {
    return firstUnpinnedPropertyIndex(properties) !== -1;
}
