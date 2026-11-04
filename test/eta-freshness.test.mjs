// ETA is hidden when technician GPS is older than 5 minutes and is always labelled
// as an estimate (audit 2026-11-04, fix 3). No paid routing API is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freshEtaMinutes, locationAgeMinutes, ETA_MAX_LOCATION_AGE_MINUTES } from '../src/utils/eta.ts';

const tech = { lat: 25.2048, lng: 55.2708 };
const job = { lat: 25.2148, lng: 55.2808 };
const now = Date.parse('2026-11-04T12:00:00Z');

test('estimate shown for a location up to 5 minutes old', () => {
  assert.equal(ETA_MAX_LOCATION_AGE_MINUTES, 5);
  assert.ok(freshEtaMinutes(tech, job, new Date(now - 60_000).toISOString(), now) >= 1);
  assert.ok(freshEtaMinutes(tech, job, { seconds: (now - 5 * 60_000) / 1000 }, now) >= 1);
});

test('estimate hidden when location is older than 5 minutes or undated', () => {
  assert.equal(freshEtaMinutes(tech, job, new Date(now - 5 * 60_000 - 1000).toISOString(), now), null);
  assert.equal(freshEtaMinutes(tech, job, null, now), null);
  assert.equal(freshEtaMinutes(tech, job, 'not a date', now), null);
  assert.equal(locationAgeMinutes(undefined, now), null);
});

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('ticket lists use the freshness-gated estimate and label it', () => {
  const lt = read('src/utils/liveTracking.ts');
  assert.match(lt, /export const ETA_MAX_LOCATION_AGE_MINUTES = 5;/);
  assert.match(lt, /isLocationStale\(getTechnicianLocationUpdatedAt\(ticket, techLocation\), ETA_MAX_LOCATION_AGE_MINUTES\)/);
  for (const page of ['src/owner/pages/OwnerTicketsPage.tsx', 'src/tenant/pages/TenantTicketsPage.tsx', 'src/technician/pages/TechnicianJobsPage.tsx']) {
    const src = read(page);
    assert.match(src, /estimateTicketArrivalMinutes\(/, page);
    assert.doesNotMatch(src, /calculateEtaMinutes\(/, page);
    assert.match(src, /min \(estimate\)/, page);
  }
  const card = read('src/tenant/components/TechnicianArrivalCard.tsx');
  assert.match(card, /freshEtaMinutes\(/);
  assert.match(card, /Estimate only/);
});

test('no paid routing API is called for ETA', () => {
  for (const p of ['src/utils/liveTracking.ts', 'src/utils/eta.ts']) {
    assert.doesNotMatch(read(p), /routes\.googleapis|DirectionsService|distancematrix/i);
  }
});
