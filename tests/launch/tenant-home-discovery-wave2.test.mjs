import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const ARABIC = /[\u0600-\u06FF]/;

test('Wave 2 backend is deployed through runtime and public browsing is sanitized and verified-only', async () => {
  const [runtime, backend] = await Promise.all([
    read('functions/runtime.ts'),
    read('functions/homeDiscovery.ts'),
  ]);

  assert.match(runtime, /export \* from ["']\.\/homeDiscovery["']/);
  assert.match(backend, /export const getPublicHomeDiscoveryListings = onCall/);
  assert.match(backend, /enforceAppCheck: true/);
  assert.match(backend, /data\.active === true/);
  assert.match(backend, /data\.approved === true/);
  assert.match(backend, /data\.hasBinContract === true/);
  assert.match(backend, /data\.verifiedByAdmin === true/);
  assert.match(backend, /SANITIZED_VERIFIED_LISTINGS_ONLY/);
  assert.match(backend, /exactAddressExposed: false/);
  assert.match(backend, /ownerIdentityExposed: false/);

  const publicProjection = backend.slice(backend.indexOf('function publicListing'), backend.indexOf('function normalizeFilters'));
  assert.doesNotMatch(publicProjection, /ownerEmail|ownerId|propertyAddress|latitude|longitude|\blat\b|\blng\b/);
});

test('Wave 2 provides tenant-owned server saved searches and event-driven new-match and price-drop alerts', async () => {
  const backend = await read('functions/homeDiscovery.ts');

  assert.match(backend, /export const saveHomeDiscoverySearch = onCall/);
  assert.match(backend, /export const listHomeDiscoverySavedSearches = onCall/);
  assert.match(backend, /export const deleteHomeDiscoverySavedSearch = onCall/);
  assert.match(backend, /assertTenantAuth\(request\.auth\)/);
  assert.match(backend, /homeDiscoverySavedSearches/);
  assert.match(backend, /alertsEnabled/);
  assert.match(backend, /export const notifyHomeDiscoveryNewMatches = onDocumentCreated/);
  assert.match(backend, /export const notifyHomeDiscoveryPriceDrops = onDocumentUpdated/);
  assert.match(backend, /HOME_NEW_MATCH/);
  assert.match(backend, /HOME_PRICE_DROP/);
  assert.match(backend, /afterRent < beforeRent/);
  assert.match(backend, /link: ["']\/tenant\/homes["']/);
});

test('AI Home Match is inventory-grounded and fails over to deterministic ranking without inventing listing facts', async () => {
  const backend = await read('functions/homeDiscovery.ts');

  assert.match(backend, /defineSecret\(["']OPENAI_API_KEY["']\)/);
  assert.match(backend, /export const recommendHomeDiscoveryListings = onCall/);
  assert.match(backend, /reserveAiUsageQuota\(request\.auth, ["']chat["']/);
  assert.match(backend, /The inventory JSON is authoritative/);
  assert.match(backend, /Never invent a listing, price, location, amenity, availability, fee, or property fact/);
  assert.match(backend, /const allowed = new Set\(candidates\.map/);
  assert.match(backend, /allowed\.has\(id\)/);
  assert.match(backend, /provider = ["']grounded-rules["']/);
  assert.match(backend, /openai-grounded-ranking/);
  assert.match(backend, /inventoryAuthoritative: true/);
  assert.match(backend, /grounded: true/);
  assert.match(backend, /using deterministic matching against current verified inventory/);
});

test('Owner Wave 2 intake uses controlled Firebase photo upload and remains Admin-review gated', async () => {
  const [page, ownerApp] = await Promise.all([
    read('src/owner/pages/HomeDiscoveryInventoryPage.tsx'),
    read('src/owner/OwnerApp.tsx'),
  ]);

  assert.match(page, /uploadBytesResumable/);
  assert.match(page, /owners\/\$\{user\.uid\}\/listing-media\/\$\{requestId\}/);
  assert.match(page, /MAX_PHOTOS = 12/);
  assert.match(page, /MAX_PHOTO_BYTES = 10 \* 1024 \* 1024/);
  assert.match(page, /photos\.length < 3/);
  assert.match(page, /evidenceType: ["']home_listing_photo["']/);
  assert.match(page, /mediaSource: ["']FIREBASE_OWNER_CONTROLLED_UPLOAD["']/);
  assert.match(page, /listingSchema: ["']HOME_DISCOVERY_V2["']/);
  assert.match(page, /stage: ["']BIN_LISTING_REVIEW_REQUIRED["']/);
  assert.match(page, /verifiedByAdmin: false/);
  assert.match(page, /approved: false/);
  assert.match(page, /active: false/);
  assert.match(page, ARABIC);

  assert.match(ownerApp, /HomeDiscoveryInventoryPage/);
  assert.match(ownerApp, /path=["']\/home-discovery["'] element=\{<HomeDiscoveryInventoryPage \/>\}/);
  assert.match(ownerApp, /path=["']\/contractor-marketplace["'] element=\{<HomeDiscoveryInventoryPage \/>\}/);
});

test('Tenant Wave 2 UI exposes grounded AI, server alerts and preserves the verified Wave 1 catalog', async () => {
  const [page, tenantApp] = await Promise.all([
    read('src/tenant/pages/TenantHomeDiscoveryWave2Page.tsx'),
    read('src/tenant/TenantApp.tsx'),
  ]);

  assert.match(page, /recommendHomeDiscoveryListings/);
  assert.match(page, /saveHomeDiscoverySearch/);
  assert.match(page, /listHomeDiscoverySavedSearches/);
  assert.match(page, /deleteHomeDiscoverySavedSearch/);
  assert.match(page, /AI Home Match/);
  assert.match(page, /cannot invent price, availability or property facts/);
  assert.match(page, /Saved Search Alerts/);
  assert.match(page, /TenantMarketplacePage/);
  assert.match(page, ARABIC);

  assert.match(tenantApp, /TenantHomeDiscoveryWave2Page/);
  assert.match(tenantApp, /path=["']\/homes["'] element=\{<TenantHomeDiscoveryWave2Page \/>\}/);
  assert.match(tenantApp, /path=["']\/marketplace["'] element=\{<TenantHomeDiscoveryWave2Page \/>\}/);
});

test('Wave 2 exposes a privacy-safe pre-login homes route with secure tenant conversion CTA', async () => {
  const [app, page] = await Promise.all([
    read('src/App.tsx'),
    read('src/pages/public/PublicHomeDiscoveryPage.tsx'),
  ]);

  assert.match(app, /PublicHomeDiscoveryPage/);
  assert.match(app, /path=["']\/homes["']/);
  assert.match(page, /getPublicHomeDiscoveryListings/);
  assert.match(page, /Public browsing never exposes owner identity, exact private property coordinates/);
  assert.match(page, /returnTo=\$\{encodeURIComponent\(["']\/tenant\/homes["']\)\}/);
  assert.match(page, /BIN VERIFIED/);
  assert.match(page, ARABIC);
});
