import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const ARABIC = /[\u0600-\u06FF]/;

test('public role-first entry splits existing tenants from home seekers', async () => {
  const start = await read('src/pages/public/SimpleStartPage.tsx');

  assert.match(start, /Tenant & Home Search/);
  assert.match(start, /I Already Rent With BIN/);
  assert.match(start, /I’m Looking for a Home/);
  assert.match(start, /path: '\/login\?intendedRole=tenant'/);
  assert.match(start, /secondaryPath: '\/homes'/);
  assert.match(start, /Find rooms & homes/);
  assert.match(start, /Viewings & applications/);
  assert.match(start, ARABIC);
});

test('publicly self-assigned tenants begin as home seekers while managed tenants keep their normal portal', async () => {
  const gateway = await read('src/pages/RoleGatewayPage.tsx');

  assert.match(gateway, /tenant: '\/tenant\/homes'/);
  assert.match(gateway, /Continue as Tenant \/ Home Seeker/);
  assert.match(gateway, /Find a verified home first/);
  assert.match(gateway, /navigate\(roleId === 'owner' \? '\/onboarding' : \(roleHome\[roleId\] \|\| '\/'\)\)/);
});

test('tenant portal exposes the canonical Wave 2 home discovery route while preserving the Wave 1 catalog', async () => {
  const [tenantApp, wave2] = await Promise.all([
    read('src/tenant/TenantApp.tsx'),
    read('src/tenant/pages/TenantHomeDiscoveryWave2Page.tsx'),
  ]);

  assert.match(tenantApp, /navigate\('\/tenant\/homes'\)/);
  assert.match(tenantApp, /Find a Home/);
  assert.match(tenantApp, /path="\/homes" element=\{<TenantHomeDiscoveryWave2Page \/>\}/);
  assert.match(tenantApp, /path="\/marketplace" element=\{<TenantHomeDiscoveryWave2Page \/>\}/);
  assert.match(wave2, /TenantMarketplacePage/);
});

test('home discovery supports sanitized inventory, photos, filters, favorites, viewings and server-authoritative applications', async () => {
  const [page, backend] = await Promise.all([
    read('src/tenant/pages/TenantMarketplacePage.tsx'),
    read('functions/homeDiscovery.ts'),
  ]);

  assert.match(page, /getPublicHomeDiscoveryListings/);
  assert.match(page, /submitHomeDiscoveryInterest/);
  assert.doesNotMatch(page, /contractorProfiles/);
  assert.doesNotMatch(page, /addDoc\(collection\(db, 'jobPostings'/);
  assert.match(page, /imageUrls/);
  assert.match(page, /coverImageUrl/);
  assert.match(page, /propertyType/);
  assert.match(page, /emirate/);
  assert.match(page, /minRent/);
  assert.match(page, /maxRent/);
  assert.match(page, /bedrooms/);
  assert.match(page, /furnishing/);
  assert.match(page, /bin_tenant_home_favorites_v1/);
  assert.match(page, /bin_tenant_home_search_v1/);
  assert.match(page, /requestMode/);
  assert.match(page, /permitVerificationUrl/);
  assert.match(page, /google\.com\/maps\/search/);
  assert.match(page, /Maintenance history/);
  assert.match(page, /Rental cost snapshot/);
  assert.match(page, /privacy-safe availability summary/);

  assert.match(backend, /type: "ROOM_RENT_APPLICATION"/);
  assert.match(backend, /VIEWING_REQUESTED/);
  assert.match(backend, /APPLICATION_SUBMITTED/);
  assert.match(backend, /tenantLifecycleStage: "APPLICANT"/);
  assert.match(backend, /TENANT_HOME_VIEWING_REQUESTED/);
  assert.match(backend, /TENANT_HOME_APPLICATION_SUBMITTED/);
  assert.match(page, ARABIC);
});

test('owner vacancy intake collects the facts needed for a full home listing', async () => {
  const owner = await read('src/owner/pages/ContractorMarketplacePage.tsx');

  assert.match(owner, /HOME_RENT_LISTING_REQUEST/);
  assert.match(owner, /owner_home_discovery_v1/);
  assert.match(owner, /propertyType/);
  assert.match(owner, /propertyAddress/);
  assert.match(owner, /areaSqFt/);
  assert.match(owner, /bathrooms/);
  assert.match(owner, /furnishing/);
  assert.match(owner, /availableFrom/);
  assert.match(owner, /numberOfCheques/);
  assert.match(owner, /securityDeposit/);
  assert.match(owner, /imageUrls/);
  assert.match(owner, /amenities/);
  assert.match(owner, /BIN_LISTING_REVIEW_REQUIRED/);
  assert.match(owner, /submitting this form does not make a listing live immediately/);
  assert.match(owner, ARABIC);
});

test('Admin review publishes enriched verified inventory without breaking the legacy queue transport', async () => {
  const admin = await read('apps/admin-panel/src/pages/ops/MarketplaceApprovalsPage.tsx');
  const backend = await read('functions/adminOperationalMutations.ts');

  assert.match(admin, /runAdminOperationalMutation\('PUBLISH_HOME_LISTING'/);
  assert.match(backend, /recordType: "ROOM_RENT_LISTING"/);
  assert.match(backend, /listingType: "HOME_RENT_LISTING"/);
  assert.match(backend, /listingVersion: "HOME_DISCOVERY_V1"/);
  assert.match(backend, /approved: true/);
  assert.match(backend, /hasBinContract: true/);
  assert.match(backend, /notRented: true/);
  assert.match(backend, /verifiedByAdmin: true/);
  assert.match(backend, /coverImageUrl/);
  assert.match(backend, /propertyType/);
  assert.match(backend, /areaSqFt/);
  assert.match(backend, /permitNumber/);
  assert.match(backend, /permitVerified/);
  assert.match(backend, /permitVerificationUrl/);
  assert.match(backend, /HOME_LISTING_PUBLISHED/);
  assert.match(backend, /VIEWING_COORDINATION_STARTED/);
});

test('home discovery remains server-side BIN-contract and availability gated', async () => {
  const backend = await read('functions/homeDiscovery.ts');

  assert.match(backend, /data\.active === true/);
  assert.match(backend, /data\.approved === true/);
  assert.match(backend, /data\.hasBinContract === true/);
  assert.match(backend, /data\.verifiedByAdmin === true/);
  assert.match(backend, /data\.notRented !== false/);
  assert.match(backend, /RENTED/);
  assert.match(backend, /WITHDRAWN/);
});
