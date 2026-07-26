import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const adminMap = read('apps/admin-panel/src/pages/map/LiveMapPage.tsx');
const verifiedPinContract = read('apps/admin-panel/src/lib/verifiedPropertyPin.ts');
const adminMapsLoader = read('apps/admin-panel/src/lib/googleMaps.ts');
const technicianCommandCenter = read('apps/admin-panel/src/components/ops/TechnicianCommandCenter.tsx');
const technicianMap = read('src/technician/pages/TechnicianMapPage.tsx');
const trackingSummary = read('src/components/tracking/LiveTechnicianTrackingCard.tsx');
const liveTracking = read('src/utils/liveTracking.ts');
const gpsRetryQueue = read('src/utils/gpsRetryQueue.ts');
const locationCallable = read('functions/technicianLiveLocation.ts');
const indexes = JSON.parse(read('firestore.indexes.json'));
const ruleHardener = read('scripts/harden-technician-live-location-authority.mjs');
const packageJson = JSON.parse(read('package.json'));
const readinessCatalogue = JSON.parse(read('launch_package/hard-launch-readiness.json'));
const globalBusinessEvidence = read('tests/e2e/business-global.spec.ts');

test('Admin operational map renders only canonical verified property pins', () => {
  assert.match(adminMap, /loadAdminGoogleMaps\(\)/);
  assert.match(adminMap, /collection\(db, 'technician_live_locations'\)/);
  assert.match(adminMap, /collection\(db, 'properties'\)/);
  assert.match(adminMap, /verifiedPinForTicket\(ticket, propertiesById\)/);
  assert.match(adminMap, /Recorded coordinate is unverified and is not rendered as an operational map marker/);
  assert.match(adminMap, /Open recorded coordinate \(unverified\)/);
  assert.match(adminMap, /No markers have been fabricated/);
  assert.match(adminMap, /data-testid="admin-live-google-map"/);
  assert.doesNotMatch(adminMap, /ticketCoordinate\(ticket\)/);
  assert.doesNotMatch(adminMap, /Open verified pin/);
  assert.doesNotMatch(adminMap, /AI Autonomous|AI INTERCEPTING|Marina Bridges|DUBAI-HQ|Streaming live telemetry/i);
  assert.doesNotMatch(adminMap, /55\.12|55\.42|25\.3 - loc\.lat|const positions = \[/);
  assert.doesNotMatch(adminMap, /Auto-SMS Triggered/);
});

test('Canonical property verification contract is fail-closed and metadata-complete', () => {
  assert.match(verifiedPinContract, /geo\.verified !== true/);
  assert.match(verifiedPinContract, /geo\.dispatchReady !== true/);
  assert.match(verifiedPinContract, /geo\.requiresGeoReview === true/);
  assert.match(verifiedPinContract, /geo\.verifiedBy/);
  assert.match(verifiedPinContract, /timestampMillis\(geo\.verifiedAt\)/);
  assert.match(verifiedPinContract, /ALLOWED_VERIFICATION_SOURCES/);
  assert.match(verifiedPinContract, /propertiesById\.get\(propertyId\)/);
  assert.doesNotMatch(verifiedPinContract, /return recordedTicketCoordinate/);
});

test('Admin live-location freshness re-evaluates when time passes without Firestore changes', () => {
  assert.match(adminMap, /MAP_CLOCK_INTERVAL_MS = 15_000/);
  assert.match(adminMap, /setInterval\(\(\) => setNowMs\(Date\.now\(\)\)/);
  assert.match(adminMap, /liveLocationIsFreshAt\(location, nowMs\)/);
  assert.match(verifiedPinContract, /expiresAt <= nowMs/);
  assert.match(verifiedPinContract, /nowMs - updatedAt > 120_000/);
});

test('Admin Maps loader fails closed on missing key, provider auth and script failure', () => {
  assert.match(adminMapsLoader, /GOOGLE_MAPS_API_KEY_MISSING/);
  assert.match(adminMapsLoader, /GOOGLE_MAPS_AUTH_FAILED/);
  assert.match(adminMapsLoader, /GOOGLE_MAPS_SCRIPT_LOAD_FAILED/);
  assert.match(adminMapsLoader, /REACT_APP_GOOGLE_MAPS_API_KEY/);
});

test('Technician Command Center uses measured records and exposes missing data truthfully', () => {
  assert.match(technicianCommandCenter, /collection\(db, 'technician_live_locations'\)/);
  assert.match(technicianCommandCenter, /Not measured/);
  assert.match(technicianCommandCenter, /Not reported/);
  assert.match(technicianCommandCenter, /Average GPS accuracy/);
  assert.match(technicianCommandCenter, /Completed jobs with before\/after proof/);
  assert.doesNotMatch(technicianCommandCenter, /reliability:\s*96|compliance:\s*100/);
  assert.doesNotMatch(technicianCommandCenter, /\{n:'Marina'|\{n:'DT'|\{n:'Palm'|\{n:'Bay'/);
  assert.doesNotMatch(technicianCommandCenter, /±\s*5m|tech\.reliability \|\| 95|tech\.battery \|\| 100/);
  assert.doesNotMatch(technicianCommandCenter, /evidence_sync[\s\S]*tech\.stable/);
});

test('Technician mission map distinguishes data failure from an empty authenticated result', () => {
  assert.match(technicianMap, /const \[jobsError, setJobsError\]/);
  assert.match(technicianMap, /data-testid="technician-map-jobs-error"/);
  assert.match(technicianMap, /Mission Control will not report an empty healthy queue/);
  assert.match(technicianMap, /!jobsError && jobs\.length === 0/);
  assert.match(technicianMap, /The authenticated production query returned no active assigned mission/);
  assert.match(technicianMap, /Straight-line estimate/);
  assert.match(technicianMap, /traffic not included/);
  assert.match(technicianMap, /FOREGROUND GPS FRESH/);
  assert.doesNotMatch(technicianMap, /setJobs\(\[\]\);\s*setLoading\(false\);\s*\}\);/);
});

test('Owner and Tenant tracking card identifies schematic and freshness limitations', () => {
  assert.match(trackingSummary, /TRACKING SUMMARY — NOT A STREET MAP/);
  assert.match(trackingSummary, /FRESH FOREGROUND GPS/);
  assert.match(trackingSummary, /GPS STALE/);
  assert.match(trackingSummary, /straight-line estimate/i);
  assert.match(trackingSummary, /Traffic and road routing are available only in Google Maps/);
  assert.match(trackingSummary, /Open Traffic-Aware Google Maps/);
  assert.doesNotMatch(trackingSummary, />\s*LIVE\s*</);
  assert.doesNotMatch(trackingSummary, /~\$\{etaMin\} min ETA/);
});

test('Technician GPS client uses protected callable with durable scoped STOP and memory-only UPDATE queues', () => {
  assert.match(liveTracking, /httpsCallable\(functions, 'updateTechnicianLiveLocation'\)/);
  assert.match(liveTracking, /purgeGpsQueuesExceptTechnician\(technicianUid\)/);
  assert.match(liveTracking, /replay\.pendingStops > 0/);
  assert.match(liveTracking, /STOP_REQUEST_QUEUED/);
  assert.match(liveTracking, /serverAcknowledged: false/);
  assert.match(liveTracking, /_state\.lastPushTime = now;[\s\S]*await replayForTechnician/);
  assert.match(liveTracking, /window\.addEventListener\('online'/);
  assert.match(liveTracking, /onError\?\.\(message\);\s*throw new Error\(message\);/);
  assert.match(liveTracking, /stopSuperseded = response\.superseded/);
  assert.match(liveTracking, /STOP_SUPERSEDED_RECONCILED/);
  assert.match(liveTracking, /canonicalSessionUnchanged: true/);
  assert.doesNotMatch(liveTracking, /status: 'STOPPED'[\s\S]{0,300}catch/);
  assert.doesNotMatch(liveTracking, /updateDoc\(doc\(db, 'maintenanceTickets'/);
  assert.doesNotMatch(liveTracking, /updateDoc\(doc\(db, 'users'/);
  assert.doesNotMatch(liveTracking, /updateDoc\(doc\(db, 'technicians'/);

  assert.match(gpsRetryQueue, /STOP_QUEUE_KEY = 'bin-technician-gps-stop-queue-v3'/);
  assert.match(gpsRetryQueue, /UPDATE_QUEUE_KEY = 'bin-technician-gps-update-memory-v3'/);
  assert.match(gpsRetryQueue, /stop: scopedStorage\(safeStorage\('localStorage'\), technicianUid\)/);
  assert.match(gpsRetryQueue, /update: scopedStorage\(memoryStorage, technicianUid\)/);
  assert.match(gpsRetryQueue, /migrateAndRemoveLegacyGpsQueue/);
  assert.match(gpsRetryQueue, /GPS_STOP_MIGRATION_VERIFICATION_FAILED/);
  assert.match(gpsRetryQueue, /Legacy UPDATE coordinates are[\s\S]*never migrated/);
  assert.doesNotMatch(gpsRetryQueue, /update: safeStorage\('sessionStorage'\)/);
  assert.match(gpsRetryQueue, /UPDATE_TTL_MS = 5 \* 60 \* 1000/);
  assert.match(gpsRetryQueue, /STOP_TTL_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(gpsRetryQueue, /retryCount >= MAX_RETRY_COUNT/);
  assert.match(gpsRetryQueue, /action === 'STOP' && terminal/);
  assert.match(gpsRetryQueue, /boundedStopEntries/);
  assert.match(gpsRetryQueue, /GPS_STOP_QUEUE_CAPACITY_EXCEEDED/);
  assert.match(gpsRetryQueue, /entry\.action === 'STOP'\) break/);
  assert.match(gpsRetryQueue, /Number\(latitude\.toFixed\(6\)\)/);
  assert.doesNotMatch(gpsRetryQueue, /heading|speed/);
});

test('Canonical live-location callable validates assignment and uses session compare-and-set authority', () => {
  assert.match(locationCallable, /enforceAppCheck: true/);
  assert.match(locationCallable, /db\.runTransaction/);
  assert.match(locationCallable, /collection\("technician_live_locations"\)/);
  assert.match(locationCallable, /classifyStopRequest\(/);
  assert.match(locationCallable, /classifyUpdateRequest\(/);
  assert.match(locationCallable, /assignedTechnicianId\(ticket\) !== technicianUid/);
  assert.match(locationCallable, /accuracy > 100/);
  assert.match(locationCallable, /sequence = previousSequence \+ 1/);
  assert.match(locationCallable, /lastStoppedTicketId: ticketId/);
  assert.match(locationCallable, /lastStoppedTicketId: null/);
  assert.match(locationCallable, /TECHNICIAN_LIVE_LOCATION_STOP_SKIPPED/);
  assert.match(locationCallable, /superseded: true/);
  assert.match(locationCallable, /tx\.set\(ticketRef/);
  assert.match(locationCallable, /tx\.set\(technicianRef/);
  assert.match(locationCallable, /tx\.set\(userRef/);
});

test('Server watchdog clears only the exact still-expired canonical tracking session', () => {
  assert.match(locationCallable, /reconcileExpiredTechnicianLiveLocations = onSchedule/);
  assert.match(locationCallable, /schedule: "every 5 minutes"/);
  assert.match(locationCallable, /where\("isTracking", "==", true\)/);
  assert.match(locationCallable, /where\("expiresAt", "<=", queryNow\)/);
  assert.match(locationCallable, /for \(const snapshot of stale\.docs\)[\s\S]*db\.runTransaction/);
  assert.match(locationCallable, /classifyWatchdogCandidate\(/);
  assert.match(locationCallable, /TECHNICIAN_LIVE_LOCATION_EXPIRY_SKIPPED/);
  assert.match(locationCallable, /const ticketSnap = ticketRef \? await tx\.get\(ticketRef\) : null/);
  assert.match(locationCallable, /ticketMissing: Boolean\(ticketId\) && ticketSnap\?\.exists !== true/);
  assert.match(locationCallable, /SERVER_EXPIRY_WATCHDOG/);
  assert.match(locationCallable, /TECHNICIAN_LIVE_LOCATION_EXPIRED/);
  assert.doesNotMatch(locationCallable, /const batch = db\.batch\(\)/);
  const watchdogIndex = indexes.indexes.find((entry) => entry.collectionGroup === 'technician_live_locations');
  assert.deepEqual(watchdogIndex?.fields, [
    { fieldPath: 'isTracking', order: 'ASCENDING' },
    { fieldPath: 'expiresAt', order: 'ASCENDING' },
  ]);
});

test('Canonical location rules are suspension-aware dispatch-read and browser-write denied', () => {
  assert.match(ruleHardener, /match \/technician_live_locations\/\{technicianId\} \{/);
  assert.match(ruleHardener, /allow read: if canDispatchJobs\(\);/);
  assert.match(ruleHardener, /allow create, update, delete: if false;/);
  assert.match(ruleHardener, /technician_live_locations'\]/);
  assert.equal(packageJson.scripts['harden:live-location-authority'], 'node scripts/harden-technician-live-location-authority.mjs');
  assert.match(packageJson.scripts['prepare:rules'], /harden:live-location-authority/);
});

test('Static readiness file is a catalogue and cannot claim live launch readiness', () => {
  assert.equal(readinessCatalogue.decision, 'NON_AUTHORITATIVE_GATE_CATALOGUE');
  assert.equal(readinessCatalogue.authority?.authoritative, false);
  assert.equal(readinessCatalogue.authority?.canonicalRuntimeRecord, 'system_health/admin_summaries');
  assert.equal(readinessCatalogue.authority?.staticScoresAccepted, false);
  assert.equal('scores' in readinessCatalogue, false);
  assert.equal('profileScores' in readinessCatalogue, false);
  assert.equal(readinessCatalogue.paymentPolicy?.controlledPilot?.mode, 'bank-pilot');
  assert.equal(readinessCatalogue.paymentPolicy?.controlledPilot?.stripeRequired, false);
  assert.equal(readinessCatalogue.paymentPolicy?.unrestrictedPublicLaunch?.stripeRequiredByCurrentRuntimeGate, true);
  assert.ok(readinessCatalogue.hardLaunchGates.some((gate) => gate.id === 'aiProviderHealth'));
  assert.ok(readinessCatalogue.hardLaunchGates.some((gate) => gate.id === 'signedFinalDecision'));
});

test('Global production evidence cannot bypass the language UI or pass without a map', () => {
  assert.match(globalBusinessEvidence, /language control is required and must be visible/i);
  assert.match(globalBusinessEvidence, /production map UI/);
  assert.match(globalBusinessEvidence, /toBeVisible\(\{ timeout: 15_000 \}\)/);
  assert.doesNotMatch(globalBusinessEvidence, /localStorage\.setItem/);
  assert.doesNotMatch(globalBusinessEvidence, /if \(await mapContainer\.isVisible/);
});
