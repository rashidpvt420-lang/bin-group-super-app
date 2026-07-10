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
const adminNavigation = read('apps/admin-panel/src/components/Navigation.tsx');
const adminApi = read('apps/admin-panel/src/services/api.ts');
const firebaseJson = read('firebase.json');
const sharedIndex = read('packages/shared/src/index.ts');

assert(!existsSync('apps/owner-app'), 'The undeployed duplicate apps/owner-app workspace must not exist.');
assert(!packageJson.includes('build:owner'), 'package.json must not expose a build for the removed legacy Owner workspace.');
assert(ownerApp.includes('path="/community-operations"'), 'OwnerApp must register the consolidated Community Operations route.');
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
assert(adminNavigation.includes("path: '/ops/announcements'"), 'Admin navigation must expose community operations.');
assert(adminNavigation.includes("path: '/payments'"), 'Admin navigation must expose payment approvals.');
assert(adminNavigation.includes("path: '/reports/institutional'"), 'Admin navigation must expose institutional reports.');
assert(adminNavigation.includes("path: '/staff-access'"), 'Admin navigation must expose staff access controls.');

assert(!existsSync('src/services/api.ts'), 'The unused root localhost REST client must not return.');
assert(!adminApi.includes('http://localhost:5000'), 'The Admin compatibility adapter must not default to localhost.');
assert(adminApi.includes('Legacy REST endpoint'), 'The Admin legacy REST adapter must fail closed with a migration message.');

assert(sharedIndex.includes("export * from './components/SafeIcon'"), 'SafeIcon must be canonical in packages/shared.');
assert(read('src/components/SafeIcon.tsx').includes('packages/shared'), 'Root SafeIcon path must be a shared compatibility alias.');
assert(read('apps/admin-panel/src/components/SafeIcon.tsx').includes('packages/shared'), 'Admin SafeIcon path must be a shared compatibility alias.');
assert(read('src/utils/buildingHealthEngine.ts').includes('packages/shared'), 'Root building health engine must use shared source.');
assert(read('src/utils/DesignStudioPricingEngine.ts').includes('packages/shared'), 'Root design pricing must use shared source.');
assert(read('src/utils/propertyClassifier.ts').includes('packages/shared'), 'Root property classifier must use shared source.');

assert(firebaseJson.includes('"target": "admin"'), 'Firebase must retain the dedicated admin hosting target.');
assert(firebaseJson.includes('"public": "apps/admin-panel/build"'), 'Admin hosting must deploy apps/admin-panel/build.');

if (failures.length) {
  console.error('\nCanonical route architecture verification failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Canonical route architecture verification passed. One live Owner app, one full Admin app, shared canonical utilities, and no localhost REST fallback are enforced.');
