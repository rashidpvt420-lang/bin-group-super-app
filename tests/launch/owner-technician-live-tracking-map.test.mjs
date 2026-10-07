import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const trackingCard = await readFile(
  new URL('../../src/components/tracking/LiveTechnicianTrackingCard.tsx', import.meta.url),
  'utf8',
);
const ownerDetail = await readFile(
  new URL('../../src/owner/pages/OwnerTicketDetailPage.tsx', import.meta.url),
  'utf8',
);
const functionsIndex = await readFile(
  new URL('../../functions/index.ts', import.meta.url),
  'utf8',
);

test('Owner tracking renders a real embedded Google map with live technician and job markers', () => {
  assert.match(trackingCard, /useGoogleMaps/);
  assert.match(trackingCard, /new google\.maps\.Map/);
  assert.match(trackingCard, /new google\.maps\.Marker/);
  assert.match(trackingCard, /data-testid="technician-live-map"/);
  assert.match(trackingCard, /LIVE TECHNICIAN GPS/);
  assert.match(trackingCard, /LAST KNOWN TECHNICIAN LOCATION/);
});

test('stale technician GPS never produces a live ETA claim', () => {
  assert.match(
    trackingCard,
    /const straightLineEstimateMinutes = trackingFresh \? calculateEtaMinutes\(straightLineDistanceKm\) : null;/,
  );
  assert.match(trackingCard, /GPS STALE/);
});

test('Owner sees tracking before ticket details instead of a narrow sidebar-only tracker', () => {
  const tracker = ownerDetail.indexOf('<LiveTechnicianTrackingCard');
  const detailsGrid = ownerDetail.indexOf('<Grid container spacing={4}>');
  assert.ok(tracker > 0, 'Owner tracker must render');
  assert.ok(detailsGrid > tracker, 'Owner tracker must appear above ticket detail grid');
  assert.equal((ownerDetail.match(/<LiveTechnicianTrackingCard/g) || []).length, 1);
});

test('Owner status notifications remain server-authoritative for travel and arrival', () => {
  assert.match(functionsIndex, /dispatchOmniNotification\(ownerId/);
  assert.match(functionsIndex, /\["on_the_way", "en_route"\]\.includes\(statusNorm\)/);
  assert.match(functionsIndex, /Technician On The Way/);
  assert.match(functionsIndex, /\["arrived"\]\.includes\(statusNorm\)/);
  assert.match(functionsIndex, /Technician Arrived/);
  assert.match(functionsIndex, /\["in_progress", "work_started"\]\.includes\(statusNorm\)/);
});
