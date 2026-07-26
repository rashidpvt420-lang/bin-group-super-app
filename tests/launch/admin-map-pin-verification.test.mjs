import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync('apps/admin-panel/src/pages/map/LiveMapPage.tsx', 'utf8');

test('Admin map defines one fail-closed verified property-pin contract', () => {
  assert.match(source, /export const verifiedTicketPin/);
  assert.match(source, /const authoritativePinCandidate/);
  assert.match(source, /dispatchSnapshot\?\.verification/);
  assert.match(source, /canonicalSnapshot\?\.verification/);
  assert.match(source, /boundPropertyId === text\(ticket\?\.propertyId\)/);
  assert.match(source, /metadata\.verified === true \|\| status === 'VERIFIED'/);
  assert.match(source, /metadata\.dispatchReady === true/);
  assert.doesNotMatch(source, /metadata\.dispatchReady === true \|\| ticket\?\.dispatchGeoReady === true/);
  assert.match(source, /verifiedByUid \|\| metadata\.verifiedBy \|\| metadata\.verifierUid/);
  assert.match(source, /verifiedAt \|\| metadata\.verificationTimestamp \|\| metadata\.reviewedAt/);
  assert.match(source, /captureSource \|\| metadata\.source \|\| metadata\.captureMethod/);
  assert.match(source, /candidate\.immutable/);
  assert.match(source, /accuracyMeters > 0 && accuracyMeters <= 100/);
  assert.match(source, /NON_AUTHORITATIVE_PIN_SOURCE/);
});

test('verification metadata cannot certify a coordinate from another field', () => {
  assert.match(source, /Coordinate and verification metadata must come from the same immutable/);
  assert.match(source, /dispatchPoint && dispatchMetadata/);
  assert.match(source, /canonicalPoint &&\s*canonicalMetadata/);
  assert.doesNotMatch(source, /const point = recordedTicketCoordinate\(ticket\);\s*const metadata = verificationMetadata\(ticket\);/s);
  assert.doesNotMatch(source, /const verificationMetadata/);
});

test('numeric coordinates without verification are excluded from map markers', () => {
  assert.match(source, /ticketsWithVerifiedPins/);
  assert.match(source, /verifiedTicketPin\(ticket, nowMs\)/);
  assert.match(source, /for \(const \{ ticket, verifiedPin \} of ticketsWithVerifiedPins/);
  assert.doesNotMatch(source, /for \(const \{ ticket, point \} of ticketsWithCoordinates/);
  assert.match(source, /Recorded coordinate is unverified and excluded from map and dispatch-distance claims/);
  assert.match(source, /Inspect recorded coordinate/);
  assert.match(source, /recorded coordinates were not rendered as verified markers/i);
  assert.doesNotMatch(source, />\s*Open verified pin\s*</);
});

test('fresh GPS markers expire from a UI clock without a Firestore snapshot', () => {
  assert.match(source, /const MAP_CLOCK_INTERVAL_MS = 1_000/);
  assert.match(source, /const \[nowMs, setNowMs\] = useState\(\(\) => Date\.now\(\)\)/);
  assert.match(source, /window\.setInterval\(\(\) => setNowMs\(Date\.now\(\)\), MAP_CLOCK_INTERVAL_MS\)/);
  assert.match(source, /liveLocationIsFresh\(location, nowMs\)/);
  assert.match(source, /\[liveLocations, nowMs\]/);
  assert.match(source, /expiresAt <= nowMs/);
  assert.match(source, /nowMs - updatedAt > LIVE_LOCATION_MAX_AGE_MS/);
});

test('clock ticks update marker membership without resetting the Admin viewport', () => {
  assert.match(source, /const markerRefs = useRef<Map<string, any>>\(new Map\(\)\)/);
  assert.match(source, /const hasAutoFittedViewportRef = useRef\(false\)/);
  assert.match(source, /const upsertMarker =/);
  assert.match(source, /marker\.setPosition\(options\.position\)/);
  assert.match(source, /markerRefs\.current\.delete\(key\)/);
  assert.match(source, /if \(!hasAutoFittedViewportRef\.current && pointCount > 0\)/);
  assert.match(source, /hasAutoFittedViewportRef\.current = true/);
  assert.match(source, /for \(const marker of markerRefs\.current\.values\(\)\) marker\.setMap\(null\)/);
  assert.match(source, /markerRefs\.current\.clear\(\)/);
  assert.doesNotMatch(source, /markerRefs\.current\.forEach\(\(marker\) => marker\.setMap\(null\)\)/);
  assert.doesNotMatch(source, /mapRef\.current\.setCenter\(UAE_CENTRE\)/);
});

test('Admin map copy distinguishes verified pins from recorded coordinates', () => {
  assert.match(source, /Contract-verified property pin/);
  assert.match(source, /Recorded\/unverified coordinates are feed-only/);
  assert.match(source, /verified property pins/);
  assert.match(source, /recorded coordinates unverified/);
  assert.match(source, /data-testid={`verified-property-pin-\$\{ticket\.id\}`}/);
  assert.match(source, /data-testid={`unverified-recorded-coordinate-\$\{ticket\.id\}`}/);
});
