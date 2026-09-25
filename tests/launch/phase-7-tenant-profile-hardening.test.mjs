import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Phase 7 home discovery distinguishes loading failure from legitimate zero inventory', async () => {
  const [backend, publicPage, tenantPage] = await Promise.all([
    read('functions/homeDiscovery.ts'),
    read('src/pages/public/PublicHomeDiscoveryPage.tsx'),
    read('src/tenant/pages/TenantMarketplacePage.tsx'),
  ]);

  assert.match(backend, /inventoryState: rows\.length > 0 \? "AVAILABLE" : "EMPTY"/);
  assert.match(backend, /HOME_DISCOVERY_INVENTORY_UNAVAILABLE/);
  assert.match(backend, /HOME_DISCOVERY_INVENTORY_QUERY_FAILED/);
  assert.match(publicPage, /'LOADING' \| 'AVAILABLE' \| 'EMPTY' \| 'FAILED'/);
  assert.match(publicPage, /public-home-load-failed/);
  assert.match(publicPage, /public-home-empty/);
  assert.match(tenantPage, /'LOADING' \| 'AVAILABLE' \| 'EMPTY' \| 'FAILED'/);
  assert.match(tenantPage, /tenant-home-load-failed/);
  assert.match(tenantPage, /There are currently zero BIN-verified homes available/);
});

test('Phase 7 home seekers receive sanitized inventory and submit interest only through server authority', async () => {
  const [backend, tenantPage, rules, ownerPage] = await Promise.all([
    read('functions/homeDiscovery.ts'),
    read('src/tenant/pages/TenantMarketplacePage.tsx'),
    read('firestore.rules'),
    read('src/owner/pages/ContractorMarketplacePage.tsx'),
  ]);

  const projection = backend.slice(backend.indexOf('function publicListing'), backend.indexOf('function normalizeFilters'));
  assert.doesNotMatch(projection, /ownerEmail|ownerId|propertyAddress|latitude|longitude|\blat\b|\blng\b/);
  assert.match(projection, /publicLocationQuery/);
  assert.match(backend, /submitHomeDiscoveryInterest = onCall/);
  assert.match(backend, /enforceAppCheck: true/);
  assert.match(backend, /assertCurrentTenantAuthority/);
  assert.match(backend, /admin\.auth\(\)\.getUser\(uid\)/);
  assert.match(backend, /isVerifiedPublicListing\(listingSnap\.data\(\)\)/);
  assert.match(backend, /transaction\.create\(applicationRef/);
  assert.match(backend, /transaction\.create\(auditRef/);
  assert.match(backend, /clientRequestId/);

  assert.match(tenantPage, /getPublicHomeDiscoveryListings/);
  assert.match(tenantPage, /submitHomeDiscoveryInterest/);
  assert.doesNotMatch(tenantPage, /contractorProfiles/);
  assert.doesNotMatch(tenantPage, /addDoc\(collection\(db, 'jobPostings'/);
  assert.doesNotMatch(tenantPage, /ownerEmail|ownerId|propertyAddress/);

  assert.match(rules, /match \/contractorProfiles\/\{profileId\} \{[\s\S]*?allow read: if isAdmin\(\) \|\| emailOwns\(resource\.data\);/);
  assert.match(ownerPage, /where\('ownerEmail', '==', ownerEmail\)/);
});

test('Phase 7 residence and documents never turn read failures into empty-state claims', async () => {
  const [requestPage, dashboard, docs] = await Promise.all([
    read('src/tenant/pages/TenantRequestPage.tsx'),
    read('src/tenant/pages/TenantDashboardPage.tsx'),
    read('src/tenant/pages/TenantDocumentsPage.tsx'),
  ]);

  assert.match(requestPage, /residenceLoadError/);
  assert.match(requestPage, /tenant-residence-load-failed/);
  assert.match(requestPage, /data-loading failure, not confirmation that no unit is linked/);
  assert.match(requestPage, /No verified unit link was found/);

  assert.match(dashboard, /Residence, property or lease data failed to load/);
  const safeGetStart = dashboard.indexOf('async function safeGetDocument');
  const firstByFieldStart = dashboard.indexOf('async function getFirstByField');
  const dashboardComponentStart = dashboard.indexOf('export default function TenantDashboardPage');
  assert.ok(safeGetStart >= 0 && firstByFieldStart > safeGetStart && dashboardComponentStart > firstByFieldStart);
  const safeGetBody = dashboard.slice(safeGetStart, firstByFieldStart);
  const firstByFieldBody = dashboard.slice(firstByFieldStart, dashboardComponentStart);
  assert.doesNotMatch(safeGetBody, /catch/);
  assert.doesNotMatch(firstByFieldBody, /catch/);

  assert.match(docs, /tenant-documents-load-failed/);
  assert.match(docs, /This is a loading failure, not confirmation that your document vault is empty/);
  assert.match(docs, /!loadError && documents\.length === 0/);
});

test('Phase 7 Tenant identity, unit-link, ticket creation, completion review and handover use protected server authority', async () => {
  const [unitLink, ticketOps, review, handover, runtime] = await Promise.all([
    read('functions/secureTenantUnitLinkRequest.ts'),
    read('functions/tenantTicketOperations.ts'),
    read('functions/tenantTicketReview.ts'),
    read('functions/tenantHandoverInspections.ts'),
    read('functions/runtime.ts'),
  ]);

  for (const source of [unitLink, ticketOps, review, handover]) {
    assert.match(source, /enforceAppCheck: true/);
  }
  assert.match(unitLink, /admin\.auth\(\)\.getUser\(auth\.uid\)/);
  assert.match(unitLink, /Current verified tenant authority is required/);

  assert.match(ticketOps, /tenantOwnsUnit/);
  assert.match(ticketOps, /resolveDispatchReadyPropertyGeo/);
  assert.match(ticketOps, /transaction\.create\(ticketRef/);
  assert.match(ticketOps, /TENANT_\$\{kind\}_TICKET_CREATED/);

  assert.match(review, /requireCurrentReviewTenant/);
  assert.match(review, /admin\.auth\(\)\.getUser\(auth\.uid\)/);
  assert.match(review, /TENANT_APPROVED_TICKET/);
  assert.match(review, /TENANT_DISPUTED_TICKET/);

  assert.match(handover, /requireCurrentTenant/);
  assert.match(handover, /admin\.auth\(\)\.getUser\(auth\.uid\)/);
  assert.match(handover, /inspectionType must be MOVE_IN or MOVE_OUT/);
  assert.match(handover, /canonicalOwnerId/);
  assert.match(handover, /TENANT_\$\{inspectionType\}_HANDOVER_SUBMITTED/);
  assert.doesNotMatch(handover, /ownerId: payload\.ownerId/);

  assert.match(runtime, /tenantRequestUnitLink/);
  assert.match(runtime, /tenantTicketReview/);
  assert.match(runtime, /tenantHandoverInspections/);
});

test('Phase 7 maintenance-to-Technician resolution flow remains executable and evidence-backed', async () => {
  const [requestPage, ticketPage, tracking, tenantApp] = await Promise.all([
    read('src/tenant/pages/TenantRequestPage.tsx'),
    read('src/tenant/pages/TenantTicketDetailPage.tsx'),
    read('src/components/tracking/LiveTechnicianTrackingCard.tsx'),
    read('src/tenant/TenantApp.tsx'),
  ]);

  assert.match(requestPage, /createTenantServiceTicket/);
  assert.match(requestPage, /maintenanceTickets\/\$\{ticketId\}\/tenant/);
  assert.match(requestPage, /evidenceStatus: 'TENANT_EVIDENCE_UPLOADED'/);

  assert.match(ticketPage, /tenantReviewTicketCompletion/);
  assert.match(ticketPage, /LiveTechnicianTrackingCard/);
  assert.match(ticketPage, /tenantManageScheduledService/);
  assert.match(ticketPage, /tenantApproved/);
  assert.match(ticketPage, /DISPUTED/);

  assert.match(tracking, /FRESH FOREGROUND GPS/);
  assert.match(tracking, /GPS STALE/);
  assert.match(tracking, /GPS POINT PENDING/);
  assert.match(tracking, /Awaiting Technician Assignment/);

  for (const route of ['/dashboard', '/request', '/tickets', '/ticket/:id', '/ai-concierge', '/documents', '/move-inspection', '/move-inspection/:type', '/homes']) {
    assert.ok(tenantApp.includes(`path="${route}"`) || tenantApp.includes(`path='${route}'`), `Missing Tenant route ${route}`);
  }
});

test('Phase 7 completion notification and move-in/out evidence remain auditable', async () => {
  const [review, movePage, handover] = await Promise.all([
    read('functions/tenantTicketReview.ts'),
    read('src/tenant/pages/TenantMoveInspectionPage.tsx'),
    read('functions/tenantHandoverInspections.ts'),
  ]);

  assert.match(review, /onTenantCompletionReviewRequired/);
  assert.match(review, /COMPLETION_REQUEST/);
  assert.match(review, /firebase_auth_verified_email/);
  assert.match(review, /TENANT_COMPLETION_REVIEW_NOTIFICATION_QUEUED/);

  assert.match(movePage, /MOVE_IN/);
  assert.match(movePage, /MOVE_OUT/);
  assert.match(movePage, /roomChecks/);
  assert.match(movePage, /evidencePhotos/);
  assert.match(movePage, /Tenant signature is required/);
  assert.match(movePage, /submitTenantMoveInspection/);

  assert.match(handover, /ownerReviewStatus: "PENDING"/);
  assert.match(handover, /source: "TENANT_PORTAL_CALLABLE"/);
  assert.match(handover, /audit_logs/);
});
