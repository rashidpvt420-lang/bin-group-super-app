import { existsSync, readFileSync } from 'node:fs';

const failures = [];

function read(path) {
  if (!existsSync(path)) {
    failures.push(`Missing required canonical file: ${path}`);
    return '';
  }
  return readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function routePaths(source) {
  return [...source.matchAll(/<Route\s+path=["']([^"']+)["']/g)].map((match) => match[1]);
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

const rootApp = read('src/App.tsx');
const ownerApp = read('src/owner/OwnerApp.tsx');
const tenantApp = read('src/tenant/TenantApp.tsx');
const technicianApp = read('src/technician/TechnicianApp.tsx');
const brokerApp = read('src/broker/BrokerApp.tsx');
const adminApp = read('apps/admin-panel/src/App.tsx');
const adminNavigation = read('apps/admin-panel/src/components/Navigation.tsx');
const adminBridge = read('src/admin/AdminTerminal.tsx');
const packageJson = read('package.json');

for (const [name, source] of [
  ['root app', rootApp],
  ['owner portal', ownerApp],
  ['tenant portal', tenantApp],
  ['technician portal', technicianApp],
  ['broker portal', brokerApp],
  ['admin panel', adminApp],
]) {
  const duplicates = duplicateValues(routePaths(source));
  assert(duplicates.length === 0, `${name} contains duplicate route declarations: ${duplicates.join(', ')}`);
}

assert(!existsSync('apps/owner-app'), 'The undeployed duplicate apps/owner-app application must not return. Use src/owner and the unified root app.');
assert(!packageJson.includes('build:owner'), 'package.json must not expose a build command for the removed duplicate owner application.');

const removedLegacyRuntimeFiles = [
  'src/owner/pages/OwnerUnitsPage.tsx',
  'src/pages/DashboardPage.tsx',
  'src/pages/TenantSOSPage.tsx',
  'src/pages/TechnicianPortalPage.tsx',
  'src/pages/BrokerPortalPage.tsx',
  'src/pages/TicketDetailPage.tsx',
  'apps/admin-panel/src/pages/dashboard/DashboardPageStable.tsx',
];
for (const path of removedLegacyRuntimeFiles) {
  assert(!existsSync(path), `Removed duplicate runtime file must not return: ${path}`);
}

assert(ownerApp.includes('<Route path="/units" element={<OwnerUnitRegistryPage />} />'), 'Owner /units must render OwnerUnitRegistryPage.');
assert(ownerApp.includes('<Route path="/legacy-units" element={<Navigate to="/owner/units" replace />} />'), 'Legacy owner units URL must redirect to the canonical owner registry.');

assert(adminBridge.includes("const ADMIN_PANEL_URL = 'https://bin-group-admin-panel.web.app'"), 'The root admin route must bridge to the dedicated Admin Panel domain.');
assert(adminBridge.includes('window.location.replace(targetUrl)'), 'The root admin bridge must preserve and transfer the requested admin path.');
assert(!adminBridge.includes("collection(db, 'users')"), 'The root bridge must not become a second admin dashboard or data application.');

assert(adminApp.includes('AdminSimpleDashboardPage'), 'The dedicated Admin Panel must mount the simple command dashboard.');
assert(adminApp.includes('DashboardPage'), 'The dedicated Admin Panel must retain the advanced dashboard.');
assert(!adminApp.includes('CANONICAL_ADMIN_BASE_URL'), 'The dedicated Admin Panel must not regress into a redirect-only shell.');
assert(!adminApp.includes('AdminPlaceholder'), 'Operational admin routes must mount real pages rather than generic placeholders.');

const adminRoutes = new Set(routePaths(adminApp));
const navPaths = [...adminNavigation.matchAll(/path:\s*["']([^"']+)["']/g)].map((match) => match[1]);
const missingAdminRoutes = navPaths.filter((path) => !adminRoutes.has(path));
assert(missingAdminRoutes.length === 0, `Admin navigation points to unregistered routes: ${missingAdminRoutes.join(', ')}`);
assert(navPaths.every((path) => !path.startsWith('/admin/')), 'Admin navigation must use canonical top-level paths, not /admin aliases.');
assert(duplicateValues(navPaths).length === 0, `Admin navigation contains duplicate targets: ${duplicateValues(navPaths).join(', ')}`);

const requiredAdminRoutes = [
  '/dashboard',
  '/dashboard/full',
  '/owners',
  '/tenants',
  '/tickets',
  '/technicians',
  '/technicians/map',
  '/payments',
  '/broker-attributions',
  '/broker-commissions',
  '/unit-links',
  '/tenant-services',
  '/ops/messages',
  '/ops/whatsapp-triage',
  '/ops/rfq',
  '/ops/vendors',
  '/ops/data-governance',
  '/ops/bin-connect',
  '/ops/pilot-completion',
  '/ops/public-launch-command',
  '/disputes',
  '/sos',
  '/audit',
  '/reports',
  '/hr',
  '/staff-access',
  '/settings',
];
const missingRequiredAdminRoutes = requiredAdminRoutes.filter((path) => !adminRoutes.has(path));
assert(missingRequiredAdminRoutes.length === 0, `Canonical Admin Panel is missing required feature routes: ${missingRequiredAdminRoutes.join(', ')}`);

const canonicalPublicAliases = [
  ['<Route path="/terms-of-service" element={<Navigate to="/terms" replace />} />', 'Terms alias'],
  ['<Route path="/privacy-policy" element={<Navigate to="/privacy" replace />} />', 'Privacy alias'],
  ['<Route path="/pilot-feedback" element={<Navigate to="/feedback" replace />} />', 'Feedback alias'],
  ['<Route path="/trust" element={<Navigate to="/trust-center" replace />} />', 'Trust alias'],
  ['<Route path="/videos" element={<Navigate to="/request-demo" replace />} />', 'Video alias'],
  ['<Route path="/demo-videos" element={<Navigate to="/request-demo" replace />} />', 'Demo video alias'],
];
for (const [needle, label] of canonicalPublicAliases) assert(rootApp.includes(needle), `${label} must redirect to its canonical route.`);

if (failures.length) {
  console.error('\nCanonical route verification failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Canonical route verification passed. Admin navigation covers ${navPaths.length} unique routes and duplicate runtime applications are absent.`);
