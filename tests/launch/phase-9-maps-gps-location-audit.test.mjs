import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

const rootGeo = read('src/utils/geoAnchor.ts');
const ownerGeo = read('apps/owner-app/src/utils/geoAnchor.ts');
const adminGeo = read('apps/admin-panel/src/utils/geoAnchor.ts');
const ownerLocation = read('src/components/onboarding/PropertyLocationStep.tsx');
const ownerIntake = read('src/components/onboarding/PropertyIntakeStep.tsx');
const ownerAppLocation = read('apps/owner-app/src/components/onboarding/PropertyLocationStep.tsx');
const geoAuthority = read('functions/propertyGeoAuthority.ts');
const adminReview = read('functions/adminPropertyReview.ts');
const runtime = read('functions/runtime.ts');
const inspectionFirstBackend = read('functions/inspectionFirstOwnerOnboarding.ts');
const inspectionCompletion = read('functions/ownerInspectionCompletion.ts');
const canonicalInspectionCompletion = read('functions/canonicalOwnerInspectionCompletion.ts');
const adminOwnerOperations = read('functions/adminOwnerOperations.ts');
const legacyGeoRepair = read('functions/profileP1Workflows.ts');
const geoRepairCenter = read('apps/admin-panel/src/pages/admin/GeoRepairCommandCenter.tsx');
const assetRegistry = read('apps/admin-panel/src/pages/admin/PropertyManagementPage.tsx');
const technicianLive = read('functions/technicianLiveLocation.ts');
const liveTracking = read('src/utils/liveTracking.ts');
const verifiedPins = read('apps/admin-panel/src/lib/verifiedPropertyPin.ts');
const mapsLib = read('src/lib/maps.ts');
const uaePropertyMap = read('src/components/maps/UaePropertyMap.tsx');
const adminMaps = read('apps/admin-panel/src/lib/googleMaps.ts');
const homeDiscovery = read('functions/homeDiscovery.ts');
const envWriter = read('scripts/write-production-env.mjs');
const mapsRestrictionVerifier = read('scripts/verify-google-maps-api-key-restrictions.mjs');
const deployWorkflow = read('.github/workflows/firebase-production-deploy.yml');
const mobileAudit = read('scripts/mobile-store-readiness-audit.mjs');
const capacitor = read('capacitor.config.ts');
const androidBuild = read('android/app/build.gradle');
const androidManifest = read('android/app/src/main/AndroidManifest.xml');
const iosProject = read('ios/App/App.xcodeproj/project.pbxproj');
const playIntegrityVerifier = read('scripts/verify-android-play-integrity-appcheck.mjs');

test('Owner submitted coordinates remain evidence-only across both onboarding clients', () => {
  for (const source of [ownerLocation, ownerAppLocation]) {
    assert.match(source, /submittedGeo:/);
    assert.match(source, /source: 'owner_submission'/);
    assert.match(source, /verified: false/);
    assert.match(source, /dispatchReady: false/);
    assert.match(source, /requiresGeoReview: true/);
  }
  for (const helper of [rootGeo, ownerGeo]) {
    assert.match(helper, /verified: false/);
    assert.match(helper, /requiresGeoReview: true/);
    assert.match(helper, /dispatchReady: false/);
    assert.match(helper, /verifiedBy: null/);
  }
  assert.match(ownerGeo, /verifiedAt: null/);
  assert.doesNotMatch(ownerGeo, /verified: input\.verified \?\? !isManual/);
  assert.doesNotMatch(ownerGeo, /dispatchReady: isManual \? false : input\.dispatchReady \?\? true/);
});

test('Coordinate helpers reject zero and likely UAE lat-lng reversal', () => {
  for (const source of [rootGeo, ownerGeo, adminGeo, geoAuthority, technicianLive, liveTracking, verifiedPins, mapsLib, adminMaps, uaePropertyMap]) {
    assert.match(source, /lat === 0 && lng === 0|latitude === 0 && longitude === 0|lat === 0 && geo\.lng === 0|lat === 0/);
    assert.match(source, /51/);
    assert.match(source, /57/);
    assert.match(source, /22/);
    assert.match(source, /27/);
  }
});

test('Only server-authoritative review or physical inspection can promote property geo', () => {
  assert.match(geoAuthority, /source: "FOUNDER_MFA_REVIEW"/);
  assert.match(geoAuthority, /source: "PHYSICAL_INSPECTION_EVIDENCE"/);
  assert.match(geoAuthority, /inspection\.evidenceStatus/);
  assert.match(geoAuthority, /arrival\?\.withinRadius !== true/);
  assert.match(adminReview, /requireVerifiedFounderSession/);
  assert.match(adminReview, /enforceAppCheck: true/);
  assert.match(adminReview, /buildFounderVerifiedPropertyGeo/);
  assert.match(adminReview, /Inspection-first properties cannot be approved or made dispatch-ready/);

  assert.match(adminGeo, /verified: false/);
  assert.match(adminGeo, /dispatchReady: false/);
  assert.match(adminGeo, /requiresGeoReview: true/);
  assert.doesNotMatch(adminGeo, /verified: input\.verified \?\? true/);
});

test('Tenant/property operational inheritance accepts canonical verified geo only', () => {
  const gpsHelper = adminOwnerOperations.slice(
    adminOwnerOperations.indexOf('function gpsOf'),
    adminOwnerOperations.indexOf('function geohash'),
  );
  assert.match(gpsHelper, /geo\.verified !== true/);
  assert.match(gpsHelper, /geo\.dispatchReady !== true/);
  assert.match(gpsHelper, /geo\.requiresGeoReview === true/);
  assert.doesNotMatch(gpsHelper, /x\?\.location/);
  assert.doesNotMatch(gpsHelper, /x\?\.coordinates/);
  assert.doesNotMatch(gpsHelper, /x\?\.gps/);
  assert.match(adminOwnerOperations, /const g = gpsOf\(prop\)/);
  assert.match(adminOwnerOperations, /locationInherited: Boolean\(tenantLocation\)/);
});

test('Inspection-first geo promotion stays fail-closed across the two-stage server transaction', () => {
  assert.doesNotMatch(runtime, /^export \* from "\.\/inspectionFirstOwnerOnboarding";/m);
  assert.match(runtime, /export \{ adminCompleteOwnerPortfolioInspections \} from "\.\/canonicalOwnerInspectionCompletion"/);
  assert.match(inspectionFirstBackend, /export const adminCompleteOwnerPropertyInspection/);
  assert.doesNotMatch(runtime, /adminCompleteOwnerPropertyInspection/);

  assert.match(inspectionCompletion, /evidenceStatus\) !== "VERIFIED"/);
  assert.match(inspectionCompletion, /evidenceHash/);
  assert.match(inspectionCompletion, /evidenceGeneration/);
  assert.match(inspectionCompletion, /arrivalLocation\?\.withinRadius !== true/);
  assert.match(inspectionCompletion, /checklistVerified !== true/);
  assert.match(inspectionCompletion, /visitStartedAt/);
  assert.match(inspectionCompletion, /visitCompletedAt/);
  assert.match(inspectionCompletion, /geoPromotionState: "PENDING_CANONICAL_PHYSICAL_EVIDENCE_PROMOTION"/);
  assert.match(inspectionCompletion, /locationVerified: false/);
  assert.match(inspectionCompletion, /verified: false/);
  assert.match(inspectionCompletion, /dispatchReady: false/);

  assert.match(canonicalInspectionCompletion, /buildInspectionVerifiedPropertyGeo/);
  assert.match(canonicalInspectionCompletion, /geo: canonical\.geo/);
  assert.match(canonicalInspectionCompletion, /geoVerification: canonical\.geoVerification/);
  assert.match(canonicalInspectionCompletion, /geoPromotionState: "CANONICAL_PHYSICAL_EVIDENCE_PROMOTED"/);
  assert.match(canonicalInspectionCompletion, /dispatchReady: true/);

  const retiredApproval = adminOwnerOperations.slice(
    adminOwnerOperations.indexOf('export const approveOwnerSubmissionOperationalFlow'),
    adminOwnerOperations.indexOf('export const', adminOwnerOperations.indexOf('export const approveOwnerSubmissionOperationalFlow') + 1),
  );
  assert.match(retiredApproval, /Legacy intake conversion is disabled/);
  assert.ok(
    retiredApproval.indexOf('throw new HttpsError') < retiredApproval.indexOf('const intakeId'),
    'retired Admin conversion must fail before any legacy geo activation path can execute',
  );
});

test('Legacy Admin geo repair cannot mint canonical trust', () => {
  const repairBlock = legacyGeoRepair.slice(
    legacyGeoRepair.indexOf('export const adminRepairPropertyGeo'),
    legacyGeoRepair.indexOf('export const submitBrokerKycProfile'),
  );
  assert.match(repairBlock, /enforceAppCheck: true/);
  assert.match(repairBlock, /submittedGeo/);
  assert.match(repairBlock, /submittedSource: "admin_repair_candidate"/);
  assert.match(repairBlock, /verified: false/);
  assert.match(repairBlock, /dispatchReady: false/);
  assert.match(repairBlock, /requiresGeoReview: true/);
  assert.match(repairBlock, /canonicalGeoChanged: false/);
  assert.doesNotMatch(repairBlock, /source: "ADMIN_WAR_ROOM_CALLABLE"/);
  assert.doesNotMatch(repairBlock, /geo,\s*location:/);
  assert.doesNotMatch(repairBlock, /verified: true/);

  assert.match(geoRepairCenter, /adminRepairPropertyGeo/);
  assert.match(geoRepairCenter, /location candidate was saved for authoritative review/);
  assert.doesNotMatch(geoRepairCenter, /verified and locked/);
  assert.match(assetRegistry, /submittedGeo:/);
  assert.match(assetRegistry, /status: 'PENDING_REVIEW'/);
  assert.doesNotMatch(assetRegistry, /\n\s*geo,\n/);
});

test('Technician live GPS is temporary, fresh, identity-bound, ticket-bound and installation-bound', () => {
  assert.match(technicianLive, /enforceAppCheck: true/);
  assert.match(technicianLive, /assignedTechnicianId\(ticket\) !== technicianUid/);
  assert.match(technicianLive, /resolveTechnicianArrivalBinding/);
  assert.match(technicianLive, /installationHash/);
  assert.match(technicianLive, /accuracy > 100/);
  assert.match(technicianLive, /deviceTimestampMs/);
  assert.match(technicianLive, /maxGpsAgeMs = arrivalBinding\.physicalDeviceBound \? 60_000 : 5 \* 60_000/);
  assert.match(technicianLive, /expiresAt/);
  assert.match(technicianLive, /90 \* 1000|90_000/);
  assert.match(technicianLive, /technicianUid/);
  assert.match(technicianLive, /activeTicketId: ticketId/);
  assert.match(technicianLive, /trackingSessionId/);
  assert.match(technicianLive, /reconcileExpiredTechnicianLiveLocations/);
});

test('Technician client handles permission denial, timeout and inaccurate GPS fail-closed', () => {
  assert.match(liveTracking, /permission.*denied|PERMISSION_DENIED/i);
  assert.match(liveTracking, /TIMEOUT/);
  assert.match(liveTracking, /accuracy > 100/);
  assert.match(liveTracking, /WEAK_OR_INVALID_SIGNAL/);
  assert.match(liveTracking, /maximumAge: 15_000/);
  assert.match(liveTracking, /timeout: 27_000/);
  assert.match(liveTracking, /looksLikeReversedUaeLatLng/);
});

test('Public property discovery exposes privacy-reduced location only', () => {
  const publicListingBlock = homeDiscovery.slice(
    homeDiscovery.indexOf('function publicListing'),
    homeDiscovery.indexOf('export const', homeDiscovery.indexOf('function publicListing')),
  );
  assert.match(publicListingBlock, /area/);
  assert.match(publicListingBlock, /emirate/);
  assert.match(publicListingBlock, /publicLocationQuery/);
  assert.doesNotMatch(publicListingBlock, /latitude/);
  assert.doesNotMatch(publicListingBlock, /longitude/);
  assert.doesNotMatch(publicListingBlock, /\blat\b/);
  assert.doesNotMatch(publicListingBlock, /\blng\b/);
  assert.match(homeDiscovery, /exactAddressExposed: false/);
  assert.match(homeDiscovery, /exactCoordinatesExposed: false/);
});

test('Maps rendering never converts invalid coordinates into convincing links or markers', () => {
  assert.match(mapsLib, /isUsableMapCoordinate/);
  assert.match(mapsLib, /hasCoords = isUsableMapCoordinate/);
  assert.match(uaePropertyMap, /usableCoordinatePair/);
  assert.match(adminMaps, /return 'https:\/\/www\.google\.com\/maps'/);
  assert.match(verifiedPins, /if \(lat === 0 && lng === 0\) return null/);
});

test('Google Maps production key is injected into both protected web builds and live-restriction gated', () => {
  assert.match(envWriter, /'VITE_GOOGLE_MAPS_API_KEY'/);
  assert.match(envWriter, /'REACT_APP_GOOGLE_MAPS_API_KEY', process\.env\.VITE_GOOGLE_MAPS_API_KEY/);
  assert.match(mapsRestrictionVerifier, /browserKeyRestrictions/);
  assert.match(mapsRestrictionVerifier, /allowedReferrers/);
  for (const service of [
    'maps-backend.googleapis.com',
    'places-backend.googleapis.com',
    'geocoding-backend.googleapis.com',
    'static-maps-backend.googleapis.com',
  ]) {
    assert.match(mapsRestrictionVerifier, new RegExp(service.replace(/\./g, '\\.'), 'i'));
  }
  for (const referrer of [
    'bin-groups.com/*',
    'www.bin-groups.com/*',
    'bin-group-57c60.web.app/*',
    'bin-group-admin-panel.web.app/*',
    'localhost/*',
  ]) {
    assert.ok(mapsRestrictionVerifier.includes(referrer), `missing required Maps referrer: ${referrer}`);
  }
  assert.match(deployWorkflow, /Verify Google Maps production key restrictions and enabled APIs/);
  assert.match(deployWorkflow, /verify-google-maps-api-key-restrictions\.mjs/);
});

test('Android/iOS Maps restrictions are deliberately N-A until native Maps SDKs are installed', () => {
  assert.match(capacitor, /appId: 'ae\.bingroups\.superapp'/);
  assert.match(capacitor, /androidScheme: 'https'/);
  assert.match(capacitor, /iosScheme: 'https'/);
  assert.match(androidBuild, /applicationId "ae\.bingroups\.superapp"/);
  assert.doesNotMatch(androidBuild, /play-services-maps/);
  assert.doesNotMatch(androidBuild, /com\.google\.android\.libraries\.places/);
  assert.doesNotMatch(androidManifest, /com\.google\.android\.geo\.API_KEY/);
  assert.match(iosProject, /PRODUCT_BUNDLE_IDENTIFIER = ae\.bingroups\.superapp;/);
  assert.doesNotMatch(iosProject, /GoogleMaps|GooglePlaces|GoogleNavigation/);
  assert.match(mobileAudit, /Native Maps SDK for Android is not approved/);
  assert.match(mobileAudit, /Native Google Maps\/Places\/Navigation iOS SDK is not approved/);

  // Android SHA-256 still matters for Firebase/Play Integrity, not for this browser Maps key.
  assert.match(playIntegrityVerifier, /CURRENT_PLAY_SIGNING_SHA256/);
  assert.match(playIntegrityVerifier, /PREVIOUS_PLAY_SIGNING_SHA256/);
  assert.match(playIntegrityVerifier, /PACKAGE_NAME = 'ae\.bingroups\.superapp'/);
  assert.match(playIntegrityVerifier, /playSigningSha256Registered: true/);
});

test('Places/autocomplete, geocoding, map loading, routing and marker truth remain covered', () => {
  assert.match(ownerLocation, /new google\.maps\.Geocoder\(\)/);
  assert.match(ownerIntake, /importLibrary\("places"\)/);
  assert.match(ownerIntake, /new Autocomplete\(/);
  assert.match(ownerAppLocation, /importLibrary\('places'\)/);
  assert.match(ownerAppLocation, /importLibrary\('geocoding'\)/);
  assert.match(mapsLib, /libraries=places,geometry/);
  assert.match(mapsLib, /GOOGLE_MAPS_AUTH_FAILED/);
  assert.match(mapsLib, /GOOGLE_MAPS_SCRIPT_LOAD_FAILED/);
  assert.match(liveTracking, /buildGoogleMapsDirectionsUrl/);
  assert.match(verifiedPins, /resolveVerifiedPropertyPin/);
});
