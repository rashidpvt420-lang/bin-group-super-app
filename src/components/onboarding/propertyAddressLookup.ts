// "Find Property Address" lookup for the Owner property-location step.
//
// Production incident 2026-09-30 (commit 0b2ac993): the button called Nominatim directly from the
// browser, but the Hosting CSP connect-src did not allow nominatim.openstreetmap.org, so the browser
// refused the request and the raw "Failed to fetch" TypeError was shown to the Owner. The query also
// appended ", <emirate>, UAE" to addresses that already contained them, which Nominatim answers with
// zero results.
//
// This module has no imports so it can be unit-tested in isolation.

export type AddressLookupResult = {
    lat: number;
    lng: number;
    address: string;
    emirate?: string;
    city?: string;
    area?: string;
    provider: 'google' | 'nominatim';
};

export type AddressLookupFailure = 'unavailable' | 'not_found';

// A flat shape (not a discriminated union) so narrowing also works without strictNullChecks.
export type AddressLookupOutcome = {
    ok: boolean;
    result?: AddressLookupResult;
    reason?: AddressLookupFailure;
};

// Minimal shape of google.maps.Geocoder that we rely on.
export type GeocoderLike = {
    geocode: (request: Record<string, unknown>, callback: (results: any[] | null, status: string) => void) => unknown;
};

export type FetchLike = (input: string, init?: Record<string, unknown>) => Promise<{ ok: boolean; json: () => Promise<any> }>;

export const NOMINATIM_SEARCH_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

const UAE_SUFFIX_PATTERN = /(?:^|[\s,])(uae|u\.a\.e\.?|united arab emirates)\s*$/i;

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const containsWord = (haystack: string, needle: string) =>
    Boolean(needle) && new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(needle)}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(haystack);

/**
 * Build the geocoder query. The emirate and "UAE" are appended only when the Owner has not
 * already typed them ("Business Bay, Dubai, UAE" must stay as-is; "Business Bay" becomes
 * "Business Bay, Dubai, UAE").
 */
export function buildAddressQuery(addressText: string, emirate?: string): string {
    const base = (addressText || '').trim().replace(/[\s,]+$/, '');
    if (!base) return '';
    const parts = [base];
    const cleanEmirate = (emirate || '').trim();
    if (cleanEmirate && !containsWord(base, cleanEmirate)) parts.push(cleanEmirate);
    if (!UAE_SUFFIX_PATTERN.test(base)) parts.push('UAE');
    return parts.join(', ');
}

/** True for browser network-level fetch failures (CSP block, CORS, offline, DNS). */
export function isNetworkFetchError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const name = String((error as { name?: unknown }).name || '');
    const message = String((error as { message?: unknown }).message || '');
    if (name === 'AbortError') return true;
    return name === 'TypeError' && /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(message);
}

const readComponent = (components: any[] | undefined, ...types: string[]) => {
    const match = (components || []).find((component) => types.some((type) => (component?.types || []).includes(type)));
    return match?.long_name ? String(match.long_name) : undefined;
};

const readLatLng = (location: any): { lat: number; lng: number } | null => {
    if (!location) return null;
    const lat = typeof location.lat === 'function' ? location.lat() : location.lat;
    const lng = typeof location.lng === 'function' ? location.lng() : location.lng;
    const latNumber = Number(lat);
    const lngNumber = Number(lng);
    if (!Number.isFinite(latNumber) || !Number.isFinite(lngNumber)) return null;
    if (Math.abs(latNumber) > 90 || Math.abs(lngNumber) > 180) return null;
    return { lat: latNumber, lng: lngNumber };
};

/**
 * Geocode with the Google Maps JavaScript API Geocoder that the page already loaded for the map.
 * Its traffic goes to maps.googleapis.com, which the Hosting CSP already allows.
 * Resolves null when Google has no result; rejects on transport errors.
 */
export function geocodeWithGoogle(geocoder: GeocoderLike, query: string, timeoutMs = 10000): Promise<AddressLookupResult | null> {
    return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(new Error('GOOGLE_GEOCODER_TIMEOUT'));
        }, timeoutMs);
        try {
            geocoder.geocode({ address: query, region: 'ae', componentRestrictions: { country: 'AE' } }, (results, status) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (status === 'ZERO_RESULTS') return resolve(null);
                if (status !== 'OK') return reject(new Error(`GOOGLE_GEOCODER_${status || 'UNKNOWN'}`));
                const first = Array.isArray(results) ? results[0] : null;
                const point = readLatLng(first?.geometry?.location);
                if (!first || !point) return resolve(null);
                const components = first.address_components;
                resolve({
                    lat: point.lat,
                    lng: point.lng,
                    address: String(first.formatted_address || query),
                    emirate: readComponent(components, 'administrative_area_level_1'),
                    city: readComponent(components, 'locality', 'administrative_area_level_2'),
                    area: readComponent(components, 'sublocality_level_1', 'sublocality', 'neighborhood', 'route'),
                    provider: 'google',
                });
            });
        } catch (error) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            reject(error);
        }
    });
}

/** Geocode with Nominatim (fallback when the Google Maps script is not available). */
export async function geocodeWithNominatim(fetchImpl: FetchLike, query: string): Promise<AddressLookupResult | null> {
    const url = `${NOMINATIM_SEARCH_ENDPOINT}?format=jsonv2&limit=1&countrycodes=ae&addressdetails=1&q=${encodeURIComponent(query)}`;
    const response = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const results = await response.json();
    const first = Array.isArray(results) ? results[0] : null;
    const point = readLatLng(first ? { lat: first.lat, lng: first.lon } : null);
    if (!first || !point) return null;
    const address = first.address || {};
    return {
        lat: point.lat,
        lng: point.lng,
        address: String(first.display_name || query),
        emirate: address.state || undefined,
        city: address.city || address.town || address.village || address.county || undefined,
        area: address.suburb || address.neighbourhood || address.road || undefined,
        provider: 'nominatim',
    };
}

/**
 * Resolve a typed property address. Google first (when the map script loaded), Nominatim second.
 * Never throws: the caller gets a typed outcome and shows Owner-friendly copy, never a raw
 * browser error such as "Failed to fetch".
 */
export async function resolvePropertyAddress(options: {
    query: string;
    googleGeocoder?: GeocoderLike | null;
    fetchImpl?: FetchLike | null;
}): Promise<AddressLookupOutcome> {
    const { query, googleGeocoder, fetchImpl } = options;
    if (!query.trim()) return { ok: false, reason: 'not_found' };
    let transportFailures = 0;
    let attempts = 0;

    if (googleGeocoder) {
        attempts += 1;
        try {
            const result = await geocodeWithGoogle(googleGeocoder, query);
            if (result) return { ok: true, result };
        } catch {
            transportFailures += 1;
        }
    }

    if (fetchImpl) {
        attempts += 1;
        try {
            const result = await geocodeWithNominatim(fetchImpl, query);
            if (result) return { ok: true, result };
        } catch {
            transportFailures += 1;
        }
    }

    if (attempts === 0 || transportFailures === attempts) return { ok: false, reason: 'unavailable' };
    return { ok: false, reason: 'not_found' };
}
