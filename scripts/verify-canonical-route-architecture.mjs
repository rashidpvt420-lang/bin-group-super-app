import { existsSync, readFileSync } from 'node:fs';

const failures = [];
const read = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';
const assert = (condition, message) => { if (!condition) failures.push(message); };

const packageJson = read('package.json');
const rootApp = read('src/App.tsx');
const ownerApp = read('src/owner/OwnerApp.tsx');
const ownerCommunity = read('src/owner/pages/OwnerCommunityOperationsPage.tsx');
const ownerTenants = read('src/owner/pages/OwnerTenantsPage.tsx');
const ownerUnits = read('src/owner/pages/OwnerUnitRegistryPage.tsx');
const tenantRequest = read('src/tenant/pages/TenantRequestPage.tsx');
const technicianApp = read('src/technician/TechnicianApp.tsx');
const technicianWorkforce = read('src/technician/pages/TechnicianWorkforceCenterPage.tsx');
const technicianOverview = read('src/technician/components/TechnicianWorkforceOverview.tsx');
const brokerApp = read('src/broker/BrokerApp.tsx');
const brokerCommissions = read('src/broker/pages/BrokerCommissionsPage.tsx');
const brokerProfile = read('src/broker/pages/BrokerProfilePage.tsx');
const brokerReferrals = read('src/broker/pages/BrokerReferralsPage.tsx');
const rootAdmin = read('src/admin/AdminTerminal.tsx');
const adminApp = read('apps/admin-panel/src/App.tsx');
const adminDashboard = read('apps/admin-panel/src/pages/dashboard/DashboardPage.tsx');
const adminProfitability = read('apps/admin-panel/src/pages/admin/ProfitabilityPage.tsx');
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
assert(ownerTenants.includes("collection(db, 'tenants')"), 'Owner tenant directory must use the owner-scoped tenants collection.');
assert(!ownerTenants.includes("collection(db, 'users')"), 'Owner tenant directory must not list the global users collection.');
assert(ownerTenants.includes("navigate('/owner/bin-connect')"), 'Owner tenant communication must route through BIN Connect.');
assert(ownerTenants.includes('useLanguage') && ownerTenants.includes("lang === 'ar'"), 'Owner tenant directory must be bilingual and RTL-aware.');
assert(ownerApp.includes('path="/units" element={<OwnerUnitRegistryPage />}'), 'Owner portal must use one canonical unit registry route.');
assert(!ownerApp.includes('/legacy-units'), 'Owner portal must not expose a legacy units route.');
assert(!existsSync('src/owner/pages/OwnerUnitsPage.tsx'), 'Superseded Owner units page must not return.');
assert(ownerUnits.includes('paymentStatus') && ownerUnits.includes('nextPaymentDate'), 'Canonical Owner unit registry must preserve payment-cycle visibility.');
assert(ownerUnits.includes('exportLedger') && ownerUnits.includes('text/csv'), 'Canonical Owner unit registry must provide a working ledger export.');
assert(!existsSync('src/owner/pages/OwnerStatementsPage.tsx'), 'Placeholder Owner statements page must not return.');
assert(!existsSync('src/owner/pages/OwnerApprovalsPage.tsx'), 'Placeholder Owner approvals page must not return.');
assert(!existsSync('src/owner/pages/OwnerInspectionsPage.tsx'), 'Duplicate Owner inspections page must not return.');

assert(!existsSync('src/tenant/pages/TenantAIConciergePage.tsx'), 'Conflicting Tenant ticket creator must not return.');
assert(tenantRequest.includes('At least one photo is required before dispatch'), 'Canonical Tenant request must require photo evidence.');
assert(tenantRequest.includes('slaMinutesForPriority'), 'Canonical Tenant request must use the shared SLA policy.');
assert(tenantRequest.includes('notifyTicketCreated') && tenantRequest.includes('notifyEmergency'), 'Canonical Tenant request must trigger notifications.');

assert(technicianApp.includes("from './pages/TechnicianWorkforceCenterPage'"), 'Technician App must use the consolidated Workforce Center.');
assert(technicianWorkforce.includes('TechnicianWorkforceOverview') && technicianWorkforce.includes('TechnicianHRPageV2'), 'Workforce Center must combine employment controls with multilingual ESS.');
assert(technicianOverview.includes('staffAgreements') && technicianOverview.includes('payrollStatus') && technicianOverview.includes('leaveBalance'), 'Technician Workforce Overview must retain agreement, payroll, and leave functions.');
assert(technicianOverview.includes('logAuditAction'), 'Technician agreement acceptance must use the callable audit bridge.');
assert(!existsSync('src/technician/pages/TechnicianHRPage.tsx'), 'Superseded Technician HR duplicate must not return.');
for (const path of ['/schedule', '/messages', '/performance', '/payroll', '/activity', '/documents', '/payments', '/safety', '/time-tracking', '/leaderboard']) {
  assert(technicianApp.includes(`path="${path}"`), `Technician compatibility route ${path} is missing.`);
}

assert(brokerApp.includes('BinConnectInboxPage role="broker"'), 'Broker portal must expose BIN Connect.');
assert(brokerApp.includes('PilotCompletionPage role="broker"'), 'Broker portal must expose pilot evidence.');
for (const path of ['/submissions', '/withdrawals', '/agreement', '/onboarding', '/reports', '/earnings', '/payments', '/settings']) {
  assert(brokerApp.includes(`path="${path}"`), `Broker compatibility route ${path} is missing.`);
}
assert(brokerCommissions.includes('submitBrokerPayoutRequest'), 'Canonical Broker commissions page must support payout requests.');
assert(brokerProfile.includes('commissionAgreementAccepted') && brokerProfile.includes('bankIban') && brokerProfile.includes('reraLicense'), 'Canonical Broker profile must retain agreement, bank, and RERA readiness.');
assert(!brokerReferrals.includes("collection(db, 'properties')"), 'Broker referrals must not browse the private owner properties collection.');
assert(brokerReferrals.includes('propertyReferenceVerification') && brokerReferrals.includes('PENDING_ADMIN_MATCH'), 'Broker referrals must use an Admin-verified property reference workflow.');
assert(brokerReferrals.includes('logAuditAction'), 'Broker referrals must use the callable audit bridge.');
assert(brokerReferrals.includes('useLanguage') && brokerReferrals.includes("lang === 'ar'"), 'Broker referral workflow must be bilingual and RTL-aware.');

assert(rootApp.includes('<Route path="/admin/*"'), 'The unified app must preserve the /admin/* compatibility route.');
assert(rootAdmin.includes('ADMIN_PANEL_URL'), 'Root AdminTerminal must redirect to the dedicated Admin Panel.');
assert(rootAdmin.includes('window.location.replace'), 'Root AdminTerminal must perform a canonical cross-origin redirect.');
assert(!rootAdmin.includes("collection(db, 'users')"), 'Root AdminTerminal must not contain a competing live dashboard.');

assert(adminApp.includes('<Routes>'), 'Dedicated Admin App must contain a real route tree.');
assert(adminApp.includes("from './components/Navigation'"), 'Dedicated Admin App must use the canonical Navigation component.');
assert(adminApp.includes('path="/dashboard/full" element={<Navigate to="/dashboard" replace />}'), 'Legacy Admin dashboard URL must redirect to the canonical dashboard.');
assert(!adminApp.includes('DashboardPageStable'), 'Dedicated Admin App must not import a duplicate dashboard alias.');
assert(!existsSync('apps/admin-panel/src/pages/dashboard/DashboardPageStable.tsx'), 'Duplicate Admin dashboard compatibility file must not return.');
assert(adminApp.includes('path="/financials" element={<AdminOnly><ProfitabilityPage /></AdminOnly>}'), 'Admin financials must use the canonical live profitability page.');
assert(adminApp.includes('path="/profitability" element={<Navigate to="/financials" replace />}'), 'Legacy Admin profitability URL must redirect to /financials.');
assert(!adminApp.includes('ProfitabilityDashboardPage'), 'Dedicated Admin App must not import a duplicate financial dashboard alias.');
assert(!existsSync('apps/admin-panel/src/pages/financials/ProfitabilityDashboardPage.tsx'), 'Duplicate Admin financial dashboard compatibility file must not return.');
assert(adminProfitability.includes("collection(db, 'payments')") && adminProfitability.includes("collection(db, 'properties')") && adminProfitability.includes("collection(db, 'contracts')"), 'Canonical Admin financial dashboard must use live Firestore data.');
assert(adminApp.includes('path="/ops/public-launch-command"'), 'Dedicated Admin App must register the live public-launch command route.');
assert(adminApp.includes('path="/broker-attributions"'), 'Dedicated Admin App must register broker attribution review.');
assert(adminApp.includes('path="/tenant-services"'), 'Dedicated Admin App must register tenant services operations.');
assert(adminDashboard.includes("doc(db, 'system_health', 'admin_summaries')"), 'Canonical Admin dashboard must read live launch evidence.');
assert(adminDashboard.includes('getCountFromServer'), 'Canonical Admin dashboard must use live Firestore aggregate metrics.');
assert(adminDashboard.includes('useLanguage') && adminDashboard.includes("lang === 'ar'"), 'Canonical Admin dashboard must be bilingual and RTL-aware.');
assert(adminNavigation.includes("path: '/ops/announcements'"), 'Admin navigation must expose community operations.');
assert(adminNavigation.includes("path: '/payments'"), 'Admin navigation must expose payment approvals.');
assert(adminNavigation.includes("path: '/reports/institutional'"), 'Admin navigation must expose institutional reports.');
assert(adminNavigation.includes("path: '/staff-access'"), 'Admin navigation must expose staff access controls.');
assert(!existsSync('apps/admin-panel/src/pages/Placeholders.tsx'), 'Admin placeholder page bundle must not return.');

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

console.log('Canonical route architecture verification passed. One live Owner app, one full Admin app, consolidated Tenant/Technician/Broker workflows, shared utilities, and no localhost REST fallback are enforced.');
