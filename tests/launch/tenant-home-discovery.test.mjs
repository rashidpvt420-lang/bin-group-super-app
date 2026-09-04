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
  assert.match(start, /returnTo=\/tenant\/homes/);
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

test('tenant portal exposes the canonical home discovery route', async () => {
  const tenantApp = await read('src/tenant/TenantApp.tsx');

  assert.match(tenantApp, /navigate\('\/tenant\/homes'\)/);
  assert.match(tenantApp, /Find a Home/);
  assert.match(tenantApp, /path="\/homes" element=\{<TenantMarketplacePage \/>\}/);
  assert.match(tenantApp, /path="\/marketplace" element=\{<TenantMarketplacePage \/>\}/);
});

test('home discovery supports verified inventory, photos, filters, favorites, viewings and applications', async () => {
  const page = await read('src/tenant/pages/TenantMarketplacePage.tsx');

  assert.match(page, /HOME_RENT_LISTING/);
  assert.match(page, /PROPERTY_RENT_LISTING/);
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
  assert.match(page, /VIEWING_REQUESTED/);
  assert.match(page, /APPLICATION_SUBMITTED/);
  assert.match(page, /tenantLifecycleStage: 'APPLICANT'/);
  assert.match(page, /type: 'ROOM_RENT_APPLICATION'/, 'requests must remain visible to the existing Admin marketplace queue');
  assert.match(page, /requestMode/);
  assert.match(page, /permitVerificationUrl/);
  assert.match(page, /google\.com\/maps\/search/);
  assert.match(page, /Maintenance history/);
  assert.match(page, /Rental cost snapshot/);
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

  assert.match(admin, /recordType: 'ROOM_RENT_LISTING'/);
  assert.match(admin, /listingType: 'HOME_RENT_LISTING'/);
  assert.match(admin, /listingVersion: 'HOME_DISCOVERY_V1'/);
  assert.match(admin, /approved: true/);
  assert.match(admin, /hasBinContract: true/);
  assert.match(admin, /notRented: true/);
  assert.match(admin, /verifiedByAdmin: true/);
  assert.match(admin, /coverImageUrl/);
  assert.match(admin, /propertyType/);
  assert.match(admin, /areaSqFt/);
  assert.match(admin, /permitNumber/);
  assert.match(admin, /permitVerified/);
  assert.match(admin, /permitVerificationUrl/);
  assert.match(admin, /HOME_LISTING_PUBLISHED/);
  assert.match(admin, /VIEWING_COORDINATION_STARTED/);
});

test('home discovery remains BIN-contract and availability gated', async () => {
  const page = await read('src/tenant/pages/TenantMarketplacePage.tsx');

  assert.match(page, /row\.active !== false/);
  assert.match(page, /row\.approved !== false/);
  assert.match(page, /row\.hasBinContract !== false/);
  assert.match(page, /row\.notRented !== false/);
  assert.match(page, /'RENTED', 'CLOSED', 'INACTIVE', 'WITHDRAWN'/);
});
