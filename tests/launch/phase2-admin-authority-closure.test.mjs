import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const adminMutationSurfaces = [
  'apps/admin-panel/src/pages/ops/MessagesPage.tsx',
  'apps/admin-panel/src/pages/ops/KeyRegisterPage.tsx',
  'apps/admin-panel/src/pages/ops/ParcelDeskPage.tsx',
  'apps/admin-panel/src/pages/ops/CommunityModerationPage.tsx',
  'apps/admin-panel/src/pages/ops/TenantServicesQueuePage.tsx',
  'apps/admin-panel/src/pages/ops/AmenityControlPage.tsx',
  'apps/admin-panel/src/pages/ops/MarketplaceApprovalsPage.tsx',
  'apps/admin-panel/src/pages/tickets/TicketsManagementPage.tsx',
  'apps/admin-panel/src/pages/ops/StaffDirectoryPage.tsx',
  'apps/admin-panel/src/pages/ops/AnnouncementsPage.tsx',
  'apps/admin-panel/src/pages/admin/DataGovernanceAuditPage.tsx',
  'apps/admin-panel/src/components/DigitalTwinTab.tsx',
  'apps/admin-panel/src/pages/ops/DocumentLibraryPage.tsx',
  'apps/admin-panel/src/utils/uaePricingEngine.ts',
  'apps/admin-panel/src/pages/ops/EmergencyCommandCenterPage.tsx',
  'apps/admin-panel/src/pages/admin/BinGptEngineerPage.tsx',
  'apps/admin-panel/src/components/BulkImporter.tsx',
  'apps/admin-panel/src/pages/tenants/TenantsManagementPage.tsx',
  'apps/admin-panel/src/components/tenants/BulkTenantImportDialog.tsx',
];

test('Phase 2 Admin operational mutation surfaces are callable-only', () => {
  for (const path of adminMutationSurfaces) {
    const source = read(path);
    assert.doesNotMatch(source, /\b(?:addDoc|updateDoc|deleteDoc|setDoc|writeBatch)\s*\(/, path);
  }
});

test('Admin operational gateway enforces App Check, MFA, role authority and audit evidence', () => {
  const backend = read('functions/adminOperationalMutations.ts');
  assert.match(backend, /export const adminOperationalMutation = onCall\(\{ cors: true, enforceAppCheck: true \}/);
  assert.match(backend, /const actor = await requireAdminActor\(request\.auth\)/);
  assert.match(backend, /async function requireAdminActor[\s\S]*?await requirePrivilegedMfaSession\(auth\)/);
  assert.match(backend, /ADMIN_ROLES/);
  assert.match(backend, /db\.collection\("audit_logs"\)/);
  for (const action of [
    'SEND_MESSAGE',
    'CREATE_KEY',
    'ISSUE_KEY',
    'RETURN_KEY',
    'CREATE_PARCEL',
    'RELEASE_PARCEL',
    'MODERATE_COMMUNITY',
    'DELETE_COMMUNITY',
    'REVIEW_VISITOR_PARKING',
    'REVIEW_TENANT_SERVICE',
    'CREATE_AMENITY',
    'REVIEW_AMENITY_BOOKING',
    'DELETE_AMENITY',
    'PUBLISH_HOME_LISTING',
    'TOGGLE_HOME_LISTING',
    'MARK_HOME_APPLICATION_CONTACTED',
    'UPDATE_TICKET_ESTIMATE',
    'BULK_MASTER_IMPORT',
    'BULK_TENANT_IMPORT',
    'MANAGE_TENANT',
    'CREATE_PROPERTY_CONTACT',
    'DELETE_PROPERTY_CONTACT',
    'CREATE_ANNOUNCEMENT',
    'DELETE_ANNOUNCEMENT',
    'CREATE_GOVERNANCE_EVENT',
    'CREATE_ASSET',
    'CREATE_DOCUMENT',
    'DELETE_DOCUMENT',
    'CREATE_ENGINEER_COMMAND',
    'RECORD_PRICING_AUDIT',
  ]) {
    assert.match(backend, new RegExp(`case "\${action}"`), action);
  }
  assert.match(backend, /rows\.length < 1 \|\| rows\.length > 50/);
});

test('Visitor parking and Tenant invitation side callables cannot bypass MFA', () => {
  const qr = read('functions/qrSecurity.ts');
  const index = read('functions/index.ts');
  assert.match(qr, /reviewVisitorParkingRequest[\s\S]*?requirePrivilegedMfaSession\(request\.auth\)/);
  assert.match(index, /sendTenantInvitations[\s\S]*?requirePrivilegedMfaSession\(request\.auth\)/);
  assert.match(index, /resendTenantInvitation[\s\S]*?requirePrivilegedMfaSession\(request\.auth\)/);
});

test('final production rules writer removes Admin browser mutation authority for Phase 2 collections', () => {
  const writer = read('scripts/write-production-firestore-rules.mjs');
  for (const collection of [
    'visitorParkingRequests',
    'keyRegister',
    'keyMovements',
    'parcels',
    'communityPosts',
    'tenant_services_requests',
    'amenities',
    'amenityBookings',
    'jobPostings',
    'contractorProfiles',
    'staffDirectory',
    'announcements',
    'data_governance_events',
    'assets',
    'documentLibrary',
    'conversations',
    'pricingAuditLogs',
    'binGptEngineerCommands',
    'tenant_invitations',
    'tenantInvitations',
    'tenant_import_batches',
    'tenancies',
  ]) {
    assert.match(writer, new RegExp(`'${collection}'`), collection);
  }
  assert.match(writer, /maintenanceTicketBlock[\s\S]*?allow create: if false;/);
  assert.match(writer, /source = source\.replace\('        \(admin && safeAdminTicketUpdate\(\)\) \|\|', '        false \|\|'\);/);
});

test('hard-clearance and Public Launch command center remain outside this Phase 2 closure', () => {
  const publicLaunch = read('apps/admin-panel/src/pages/admin/PublicLaunchCommandCenterPageV2.tsx');
  assert.match(publicLaunch, /launch_evidence/);
  assert.doesNotMatch(publicLaunch, /runAdminOperationalMutation/);
});
