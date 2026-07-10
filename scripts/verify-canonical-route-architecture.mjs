import { existsSync, readFileSync } from 'node:fs';

const failures = [];
const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';
const assert = (condition, message) => { if (!condition) failures.push(message); };

const packageJson = read('package.json');
const rootApp = read('src/App.tsx');
const ownerApp = read('src/owner/OwnerApp.tsx');
const ownerCommunity = read('src/owner/pages/OwnerCommunityOperationsPage.tsx');
const rootAdmin = read('src/admin/AdminTerminal.tsx');
const adminApp = read('apps/admin-panel/src/App.tsx');
const adminDashboard = read('apps/admin-panel/src/pages/dashboard/DashboardPage.tsx');
const firebaseJson = read('firebase.json');

assert(!existsSync('apps/owner-app'), 'The undeployed duplicate apps/owner-app workspace must not exist.');
assert(!packageJson.includes('build:owner'), 'package.json must not expose a build for the removed legacy Owner workspace.');
assert(ownerApp.includes("path=\"/community-operations\""), 'OwnerApp must register the consolidated Community Operations route.');
assert(ownerCommunity.includes("usePropertyCollection('amenities'"), 'Owner Community Operations must include amenities.');
assert(ownerCommunity.includes("usePropertyCollection('announcements'"), 'Owner Community Operations must include announcements.');
assert(ownerCommunity.includes("usePropertyCollection('parcels'"), 'Owner Community Operations must include parcels.');
assert(ownerCommunity.includes("usePropertyCollection('visitorParkingRequests'"), 'Owner Community Operations must include visitor parking.');

assert(rootApp.includes('<Route path="/admin/*"'), 'The unified app must preserve the /admin/* compatibility route.');
assert(rootAdmin.includes('ADMIN_PANEL_URL'), 'Root AdminTerminal must redirect to the dedicated Admin Panel.');
assert(rootAdmin.includes('window.location.replace'), 'Root AdminTerminal must perform a canonical cross-origin redirect.');
assert(!rootAdmin.includes("collection(db, 'users')"), 'Root AdminTerminal must not contain a competing live dashboard.');

assert(adminApp.includes('<Routes>'), 'Dedicated Admin App must contain a real route tree.');
assert(adminApp.includes("from './components/Navigation'"), 'Dedicated Admin App must use the canonical Navigation component.');
assert(adminApp.includes('path="/ops/public-launch-command"'), 'Dedicated Admin App must register the live public-launch command route.');
assert(adminApp.includes('path="/broker-attributions"'), 'Dedicated Admin App must register broker attribution review.');
assert(adminApp.includes('path="/tenant-services"'), 'Dedicated Admin App must register tenant services operations.');
assert(adminDashboard.includes("doc(db, 'system_health', 'admin_summaries')"), 'Canonical Admin dashboard must read live launch evidence.');
assert(adminDashboard.includes('getCountFromServer'), 'Canonical Admin dashboard must use live Firestore aggregate metrics.');

assert(firebaseJson.includes('"target": "admin"'), 'Firebase must retain the dedicated admin hosting target.');
assert(firebaseJson.includes('"public": "apps/admin-panel/build"'), 'Admin hosting must deploy apps/admin-panel/build.');

if (failures.length) {
  console.error('\nCanonical route architecture verification failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Canonical route architecture verification passed. One live Owner app and one full Admin app are enforced.');
