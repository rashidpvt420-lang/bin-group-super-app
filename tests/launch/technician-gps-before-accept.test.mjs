import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const FIREBASE_IMPORT = "import { functions, httpsCallable } from '../../lib/firebase';";

async function loadAvailabilityHelper() {
  const source = await read('src/technician/utils/availabilityLocation.ts');
  assert.ok(source.includes(FIREBASE_IMPORT), 'helper must import the shared Firebase callable client');
  const stubbed = source.replace(
    FIREBASE_IMPORT,
    'const functions = {}; const httpsCallable = (_fns, name) => (payload) => globalThis.__gpsCallable(name, payload);',
  );
  const js = ts.transpileModule(stubbed, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
}

function stubGeolocation(result) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      geolocation: {
        getCurrentPosition: (resolve, reject, options) => {
          assert.equal(options.enableHighAccuracy, true);
          assert.equal(options.maximumAge, 0, 'action refresh must request a new fix rather than a cached coordinate');
          return result.error ? reject(result.error) : resolve(result.position);
        },
      },
    },
  });
}

test('only a live-tracked (EN ROUTE) mission pauses dispatch GPS; ASSIGNED/ACCEPTED/ARRIVED do not', async () => {
  const helper = await loadAvailabilityHelper();
  for (const status of ['ASSIGNED', 'AUTO_ASSIGNED', 'ACCEPTED', 'accepted', 'ARRIVED', 'IN_PROGRESS', 'OPEN']) {
    assert.equal(helper.isLiveTrackedMission({ status }), false, `${status} must not pause dispatch GPS`);
  }
  for (const status of ['EN_ROUTE', 'en_route', 'ON_THE_WAY', 'on the way']) {
    assert.equal(helper.isLiveTrackedMission({ status }), true, `${status} is published by live tracking`);
  }
  assert.equal(helper.isLiveTrackedMission({ status: 'ACCEPTED', trackingStatus: 'LIVE_TRACKING' }), true);
  assert.equal(helper.isLiveTrackedMission({ status: 'ARRIVED', trackingStatus: 'STOPPED' }), false);
  assert.equal(helper.hasLiveTrackedMission([{ status: 'ASSIGNED' }]), false);
  assert.equal(helper.hasLiveTrackedMission([{ status: 'ASSIGNED' }, { status: 'EN_ROUTE' }]), true);
  assert.equal(helper.hasLiveTrackedMission([]), false);
});

test('refreshTechnicianDispatchGps sends a real fix and surfaces real refusals', async () => {
  const helper = await loadAvailabilityHelper();
  const calls = [];
  globalThis.__gpsCallable = async (name, payload) => { calls.push({ name, payload }); return { data: { ok: true } }; };
  stubGeolocation({ position: { coords: { latitude: 24.2, longitude: 55.7, accuracy: 12 }, timestamp: 1_791_130_000_000 } });
  assert.deepEqual(await helper.refreshTechnicianDispatchGps(), { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'reportTechnicianAvailabilityLocation');
  assert.deepEqual(calls[0].payload, { latitude: 24.2, longitude: 55.7, accuracy: 12, deviceTimestampMs: 1_791_130_000_000 });

  // Only the specific 15 s server throttle proves GPS is already fresh.
  globalThis.__gpsCallable = async () => { throw Object.assign(new Error('Availability location was reported moments ago; try again shortly.'), { code: 'functions/resource-exhausted' }); };
  assert.deepEqual(await helper.refreshTechnicianDispatchGps(), { ok: true });

  // A readiness / accuracy refusal is NOT swallowed.
  globalThis.__gpsCallable = async () => { throw Object.assign(new Error('GPS accuracy must be between 0 and 100 metres.'), { code: 'functions/failed-precondition' }); };
  const refused = await helper.refreshTechnicianDispatchGps();
  assert.equal(refused.ok, false);
  assert.match(refused.message, /accuracy/);

  // Location permission denied gives an actionable message and never calls the server.
  calls.length = 0;
  globalThis.__gpsCallable = async (name, payload) => { calls.push({ name, payload }); };
  stubGeolocation({ error: { code: 1, message: 'User denied Geolocation' } });
  const denied = await helper.refreshTechnicianDispatchGps();
  assert.equal(denied.ok, false);
  assert.match(denied.message, /Location permission/);
  assert.equal(calls.length, 0);
});

test('quota failures and older coordinates never masquerade as accepted GPS', async () => {
  const helper = await loadAvailabilityHelper();
  stubGeolocation({ position: { coords: { latitude: 24.2, longitude: 55.7, accuracy: 12 }, timestamp: Date.now() } });
  for (const [code, message] of [
    ['functions/resource-exhausted', 'Quota exceeded.'],
    ['functions/failed-precondition', 'This GPS coordinate is older than the last reported availability location.'],
    ['functions/failed-precondition', 'Availability location was reported moments ago; try again shortly.'],
  ]) {
    globalThis.__gpsCallable = async () => { throw Object.assign(new Error(message), { code }); };
    assert.deepEqual(await helper.refreshTechnicianDispatchGps(), { ok: false, message });
  }
});

test('job page shares dispatch GPS on open and before Accept and every lifecycle callable', async () => {
  const page = await read('src/technician/pages/TechnicianJobDetailPage.tsx');
  assert.match(page, /import \{ AVAILABILITY_REPORT_INTERVAL_MS, isLiveTrackedMission, refreshTechnicianDispatchGps \} from '\.\.\/utils\/availabilityLocation';/);
  assert.match(page, /const shouldShareDispatchGps = Boolean\(user\?\.uid && ticket\?\.id\) && online && !ticketLiveTracked && !ticketTerminal;/);
  assert.match(page, /window\.setInterval\(share, AVAILABILITY_REPORT_INTERVAL_MS\)/);

  const acceptStart = page.indexOf('const acceptJob = async');
  const acceptEnd = page.indexOf('const updateLifecycle = async', acceptStart);
  const accept = page.slice(acceptStart, acceptEnd);
  const gpsAt = accept.indexOf('if (!(await ensureFreshDispatchGps())) return;');
  const callAt = accept.indexOf("httpsCallable(functions, 'acceptTechnicianTicket')");
  assert.ok(gpsAt > 0 && callAt > gpsAt, 'fresh GPS must be shared before acceptTechnicianTicket');
  assert.ok(accept.indexOf("queueAction('ACCEPTED'") < gpsAt, 'offline Accept still queues without a GPS call');

  const lifecycleStart = acceptEnd;
  const lifecycle = page.slice(lifecycleStart, page.indexOf('if (loading) {', lifecycleStart));
  const refreshAt = lifecycle.indexOf('if (!trackingActive && !(await ensureFreshDispatchGps())) return;');
  const lifecycleCallAt = lifecycle.indexOf("httpsCallable(functions, 'updateTicketLifecycle')");
  assert.ok(refreshAt > 0 && lifecycleCallAt > refreshAt, 'fresh GPS must be shared before updateTicketLifecycle');
  assert.ok(lifecycle.indexOf("stopLiveTracking(user.uid, id, 'ARRIVED')") < refreshAt, 'tracking stops before the arrival GPS refresh');
  assert.equal((lifecycle.match(/trackingActive = false;/g) || []).length, 3);
});

test('dashboard reporter is paused only by a live-tracked mission, not by an assigned one', async () => {
  const page = await read('src/technician/pages/TechnicianDashboardPage.tsx');
  assert.doesNotMatch(page, /activeJobs\.length === 0;/);
  assert.match(page, /const shouldReportAvailability = Boolean\(user\?\.uid\) && isOnDuty && !isBreakDuty && !missionLiveTracked;/);
  assert.match(page, /const missionLiveTracked = hasLiveTrackedMission\(activeJobs\);/);
});

test('freshness gates are unchanged and validated mission GPS stamps lastGpsAt (STOP does not)', async () => {
  const [ops, assignment, availability, live] = await Promise.all([
    read('functions/secureTechnicianOperations.ts'),
    read('functions/secureAdminTechnicianAssignment.ts'),
    read('functions/technicianAvailabilityLocation.ts'),
    read('functions/technicianLiveLocation.ts'),
  ]);
  assert.match(ops, /firstPresent\(merged\.lastGpsAt, merged\.lastLocationAt, merged\.locationUpdatedAt, merged\.gpsUpdatedAt\)/);
  assert.match(ops, /Number\(merged\.gpsMaxAgeMs \|\| 15 \* 60_000\)/);
  assert.match(assignment, /firstPresent\(merged\.lastGpsAt, merged\.lastLocationAt, merged\.locationUpdatedAt, merged\.gpsUpdatedAt\)/);
  assert.match(availability, /const MAX_AVAILABILITY_GPS_AGE_MS = 5 \* 60_000;/);
  assert.match(availability, /accuracy <= 0 \|\| accuracy > 100/);
  assert.match(availability, /An active mission tracking session is running/);

  const stopStart = live.indexOf('const ticketExists = ticketSnap.exists;');
  const updateStart = live.indexOf('if (!ticketSnap.exists)', stopStart);
  assert.ok(stopStart >= 0 && updateStart > stopStart);
  assert.doesNotMatch(live.slice(stopStart, updateStart), /lastGpsAt/, 'STOP must not count as fresh GPS');
  const update = live.slice(updateStart);
  assert.match(update, /accuracy <= 0 \|\| accuracy > 100/);
  assert.equal((update.match(/lastGpsAt: now,/g) || []).length, 2, 'technicians/{uid} and users/{uid} both stamped');
});
