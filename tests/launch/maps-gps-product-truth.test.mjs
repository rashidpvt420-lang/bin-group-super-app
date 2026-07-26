import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const adminMap = read('apps/admin-panel/src/pages/map/LiveMapPage.tsx');
const adminMapsLoader = read('apps/admin-panel/src/lib/googleMaps.ts');
const technicianCommandCenter = read('apps/admin-panel/src/components/ops/TechnicianCommandCenter.tsx');
const liveTracking = read('src/utils/liveTracking.ts');
const locationCallable = read('functions/technicianLiveLocation.ts');
const ruleHardener = read('scripts/harden-technician-live-location-authority.mjs');
const packageJson = JSON.parse(read('package.json'));
const globalBusinessEvidence = read('tests/e2e/business-global.spec.ts');

test('Admin operational map renders Google Maps from verified Firebase coordinates only', () => {
  assert.match(adminMap, /loadAdminGoogleMaps\(\)/);
  assert.match(adminMap, /collection\(db, 'technician_live_locations'\)/);
  assert.match(adminMap, /data-testid="admin-live-google-map"/);
  assert.match(adminMap, /No markers have been fabricated/);
  assert.match(adminMap, /onSnapshot\([\s\S]*setLocationsError/);
  assert.doesNotMatch(adminMap, /AI Autonomous|AI INTERCEPTING|Marina Bridges|DUBAI-HQ|Streaming live telemetry/i);
  assert.doesNotMatch(adminMap, /55\.12|55\.42|25\.3 - loc\.lat|const positions = \[/);
  assert.doesNotMatch(adminMap, /Auto-SMS Triggered/);
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

test('Technician GPS client uses the protected callable and retains a bounded retry queue', () => {
  assert.match(liveTracking, /httpsCallable\(functions, 'updateTechnicianLiveLocation'\)/);
  assert.match(liveTracking, /QUEUE_KEY = 'bin-technician-gps-queue-v1'/);
  assert.match(liveTracking, /MAX_QUEUE_SIZE = 25/);
  assert.match(liveTracking, /window\.addEventListener\('online'/);
  assert.doesNotMatch(liveTracking, /updateDoc\(doc\(db, 'maintenanceTickets'/);
  assert.doesNotMatch(liveTracking, /updateDoc\(doc\(db, 'users'/);
  assert.doesNotMatch(liveTracking, /updateDoc\(doc\(db, 'technicians'/);
});

test('Canonical live-location callable atomically validates assignment and updates all mirrors', () => {
  assert.match(locationCallable, /enforceAppCheck: true/);
  assert.match(locationCallable, /db\.runTransaction/);
  assert.match(locationCallable, /collection\("technician_live_locations"\)/);
  assert.match(locationCallable, /assignedTechnicianId\(ticket\) !== technicianUid/);
  assert.match(locationCallable, /accuracy > 100/);
  assert.match(locationCallable, /expiresAt/);
  assert.match(locationCallable, /sequence = previousSequence \+ 1/);
  assert.match(locationCallable, /tx\.set\(ticketRef/);
  assert.match(locationCallable, /tx\.set\(technicianRef/);
  assert.match(locationCallable, /tx\.set\(userRef/);
});

test('Canonical location rules are generated as Admin-read and browser-write denied', () => {
  assert.match(ruleHardener, /match \/technician_live_locations\/\{technicianId\} \{/);
  assert.match(ruleHardener, /allow read: if isAdmin\(\);/);
  assert.match(ruleHardener, /allow create, update, delete: if false;/);
  assert.match(ruleHardener, /technician_live_locations'\]/);
  assert.equal(packageJson.scripts['harden:live-location-authority'], 'node scripts/harden-technician-live-location-authority.mjs');
  assert.match(packageJson.scripts['prepare:rules'], /harden:live-location-authority/);
});

test('Global production evidence cannot bypass the language UI or pass without a map', () => {
  assert.match(globalBusinessEvidence, /language control is required and must be visible/i);
  assert.match(globalBusinessEvidence, /production map UI/);
  assert.match(globalBusinessEvidence, /toBeVisible\(\{ timeout: 15_000 \}\)/);
  assert.doesNotMatch(globalBusinessEvidence, /localStorage\.setItem/);
  assert.doesNotMatch(globalBusinessEvidence, /if \(await mapContainer\.isVisible/);
});
