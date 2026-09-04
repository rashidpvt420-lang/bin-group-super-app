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

test('home discovery remains BIN-contract and availability gated', async () => {
  const page = await read('src/tenant/pages/TenantMarketplacePage.tsx');

  assert.match(page, /row\.active !== false/);
  assert.match(page, /row\.approved !== false/);
  assert.match(page, /row\.hasBinContract !== false/);
  assert.match(page, /row\.notRented !== false/);
  assert.match(page, /'RENTED', 'CLOSED', 'INACTIVE', 'WITHDRAWN'/);
});
