import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';
import { build } from 'esbuild';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const PROPERTY_TYPES = [
  'Villa', 'Apartment', 'Residential Building', 'Commercial Building', 'Office', 'Gym / Fitness Centre',
  'Retail Center', 'Mall', 'Hotel', 'Resort', 'Hospital', 'Clinic', 'School', 'Warehouse', 'Industrial Property',
  'Labour Camp', 'Staff Accommodation', 'Government Property', 'Government Majlis', 'Private Majlis',
  'Mosque / Masjid', 'Mixed-Use Tower', 'Skyscraper', 'Stadium', 'Sports Complex', 'Event Venue', 'Farm / Estate',
];

const HIGH_RISE = ['Residential Building', 'Commercial Building', 'Mixed-Use Tower', 'Skyscraper', 'Office'];

const srcDetails = read('src/utils/assetTypeDetails.ts');
const fnDetails = read('functions/pricing/assetTypeDetails.ts');
const sharedDetails = read('packages/shared/src/pricing/assetTypeDetails.ts');
const assetProfile = read('src/components/onboarding/AssetProfileStep.tsx');
const detailsPanel = read('src/components/onboarding/AssetTypeDetailsPanel.tsx');
const commercial = read('src/components/onboarding/CommercialTermsStep.tsx');
const page = read('src/pages/PropertyOnboardingPage.tsx');
const store = read('src/store/onboardingStore.ts');
const css = read('src/styles/onboardingReadable.css');
const language = read('src/context/LanguageContext.tsx');
const matrix = read('src/utils/uaePricingMatrix2026.ts');
const rules = read('firestore.rules');
const hardener = read('scripts/harden-property-geo-authority.mjs');

test('assetTypeDetails sources cannot drift', () => {
  assert.equal(fnDetails, srcDetails);
  assert.equal(sharedDetails, srcDetails);
});

let detailsMod;
let tempDir;
test.before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'bin-asset-details-'));
  const outfile = join(tempDir, 'assetTypeDetails.mjs');
  await build({
    entryPoints: ['src/utils/assetTypeDetails.ts'],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });
  detailsMod = await import(`${pathToFileURL(outfile).href}?v=${Date.now()}`);
});
test.after(() => { if (tempDir) rmSync(tempDir, { recursive: true, force: true }); });

test('every selectable type has bilingual type-specific details, including high-rise fields', () => {
  const { ASSET_TYPE_DETAIL_GROUPS, fieldsForPropertyType } = detailsMod;
  assert.equal(PROPERTY_TYPES.length, 27);
  for (const type of PROPERTY_TYPES) {
    const groups = ASSET_TYPE_DETAIL_GROUPS[type];
    assert.ok(groups?.length, `${type} is missing detail groups`);
    const fields = fieldsForPropertyType(type);
    assert.ok(fields.length > 0, `${type} has no fields`);
    for (const field of fields) {
      assert.ok(field.labelEn && field.labelAr, `${type}.${field.key} needs EN and AR labels`);
      assert.notEqual(field.labelEn, field.labelAr, `${type}.${field.key} EN/AR labels should not be identical`);
    }
    assert.match(assetProfile, new RegExp(`['"]${type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`));
  }
  for (const type of HIGH_RISE) {
    const keys = new Set(detailsMod.fieldsForPropertyType(type).map((field) => field.key));
    for (const key of [
      'buildingName', 'towerBlockCount', 'floorsAboveGround', 'floorsBelowGround', 'unitsPerFloor', 'totalUnits',
      'passengerLifts', 'serviceLifts', 'parkingLevels', 'parkingSpaces', 'facadeType', 'bmuFacadeAccess',
      'civilDefenceCertificateExpiry', 'sprinklers', 'fireAlarmSystem', 'centralAcChiller', 'districtCoolingService',
      'waterTanks', 'waterPumps', 'generators', 'commonAreas', 'buildingManagementName', 'oaContactName',
      'reraDldOrPermitNumber',
    ]) {
      assert.ok(keys.has(key), `${type} is missing high-rise field ${key}`);
    }
  }
  const warehouse = new Set(detailsMod.fieldsForPropertyType('Warehouse').map((field) => field.key));
  assert.ok(warehouse.has('coldStorage') && warehouse.has('loadingDocks'));
  const school = new Set(detailsMod.fieldsForPropertyType('School').map((field) => field.key));
  assert.ok(school.has('classrooms'));
  const mosque = new Set(detailsMod.fieldsForPropertyType('Mosque / Masjid').map((field) => field.key));
  assert.ok(mosque.has('prayerHallAreaSqft') && mosque.has('mosqueOwnership'));
  const farm = new Set(detailsMod.fieldsForPropertyType('Farm / Estate').map((field) => field.key));
  assert.ok(farm.has('landAreaSqft') && farm.has('irrigation'));
  const stadium = new Set(detailsMod.fieldsForPropertyType('Stadium').map((field) => field.key));
  assert.ok(stadium.has('seatedCapacity'));
  const hotel = new Set(detailsMod.fieldsForPropertyType('Hotel').map((field) => field.key));
  assert.ok(hotel.has('hotelKeys'));
  const camp = new Set(detailsMod.fieldsForPropertyType('Labour Camp').map((field) => field.key));
  assert.ok(camp.has('bedCount'));
});

test('sanitizer allowlists keys and types, and only syncs existing pricing drivers', () => {
  const { sanitizeAssetDetails, applyAssetDetailsToProperty, ASSET_DETAIL_ALLOWED_KEYS } = detailsMod;
  const dirty = sanitizeAssetDetails('Residential Building', {
    buildingName: 'Tower A',
    floorsAboveGround: 40,
    passengerLifts: 6,
    serviceLifts: 2,
    paymentVerified: true,
    quoteHash: 'abc',
    verifiedMaintenanceRate: 99,
    adminApproved: true,
  });
  assert.equal(dirty.buildingName, 'Tower A');
  assert.equal(dirty.floorsAboveGround, 40);
  assert.equal(dirty.paymentVerified, undefined);
  assert.equal(dirty.quoteHash, undefined);
  assert.ok(ASSET_DETAIL_ALLOWED_KEYS.includes('buildingName'));
  assert.ok(!ASSET_DETAIL_ALLOWED_KEYS.includes('paymentVerified'));

  const patch = applyAssetDetailsToProperty('Residential Building', {
    floorsAboveGround: 40,
    passengerLifts: 6,
    serviceLifts: 2,
    totalUnits: 120,
    bmuFacadeAccess: true,
    fireAlarmSystem: true,
  });
  assert.equal(patch.floors, 40);
  assert.equal(patch.lifts, 8);
  assert.equal(patch.units, 120);
  assert.equal(patch.bmu, true);
  assert.equal(patch.fireAlarm, true);

  const apartment = applyAssetDetailsToProperty('Apartment', { bedroomCount: '0' });
  assert.equal(apartment.bedrooms, 0);
  const dropped = sanitizeAssetDetails('Villa', { bedroomCount: '2', unknownKey: 'x' });
  assert.equal(dropped.bedroomCount, undefined);
  assert.equal(dropped.unknownKey, undefined);

  // Bounds follow the selected type: a school form caps floors at 50, a tower may go to 300.
  assert.equal(sanitizeAssetDetails('School', { floorsAboveGround: 60 }).floorsAboveGround, undefined);
  assert.equal(sanitizeAssetDetails('Residential Building', { floorsAboveGround: 60 }).floorsAboveGround, 60);
  assert.equal(sanitizeAssetDetails('Residential Building', { floorsAboveGround: 301 }).floorsAboveGround, undefined);
});

test('live form requires apartment bedrooms, warns on blank area, and does not auto-tag mosques as government', () => {
  assert.match(assetProfile, /isApartment &&/);
  assert.match(assetProfile, /label\('Bedrooms', 'غرف النوم'\)/);
  assert.match(assetProfile, /Studio\/1BR 1\.00x/);
  assert.match(assetProfile, /A blank count is not priced as 2BR on this form/);
  assert.match(assetProfile, /Suggested title-deed values were applied\. Please check them/);
  assert.match(assetProfile, /They are not verified until Admin reviews the document/);
  assert.doesNotMatch(assetProfile, /Only verified title-deed values were applied/);
  assert.match(assetProfile, /Al Ain and Al Dhafra are priced as their own regions/);
  assert.match(assetProfile, /'Al Ain'/);
  assert.match(assetProfile, /'Al Dhafra'/);
  assert.match(assetProfile, /Zone A \(1\.20x\)/);
  assert.match(assetProfile, /Premium does not change the rate/);
  assert.match(assetProfile, /Leave blank if unknown/);
  assert.match(assetProfile, /AssetTypeDetailsPanel/);
  assert.match(assetProfile, /Mosque \/ Masjid' \? \(current\?\.ownerType/);
  assert.doesNotMatch(assetProfile, /\['Government Property', 'Government Majlis', 'Mosque \/ Masjid'\]/);
  assert.match(detailsPanel, /Type-specific details/);
  assert.match(detailsPanel, /تفاصيل نوع العقار/);
  assert.match(page, /for \(const \[index, property\] of properties\.entries\(\)\)/);
  assert.match(store, /bedrooms: property\.bedrooms/);
  assert.match(store, /floorsUnknown:/);
  assert.match(store, /liftsUnknown:/);
  assert.match(store, /floors: undefined/);
  assert.match(store, /bedrooms: undefined/);
  assert.match(store, /lifts: undefined/);
});

test('type cards have distinct icons and WCAG AA contrast on the white-platinum theme', () => {
  assert.match(assetProfile, /Commercial Building'.+Layers/s);
  assert.doesNotMatch(assetProfile, /Commercial Building'.+Warehouse/);
  assert.match(assetProfile, /Stadium'.+Castle/s);
  assert.match(assetProfile, /Hospital'.+Hospital,/);
  assert.match(assetProfile, /Clinic'.+Stethoscope/);
  assert.match(assetProfile, /School'.+GraduationCap/);
  assert.match(assetProfile, /Mosque \/ Masjid'.+Church/);
  assert.match(css, /asset-type-card__icon\{color:#1F2937/);
  assert.match(css, /asset-type-card--selected \.asset-type-card__icon\{color:#7A5C12/);
  assert.match(assetProfile, /color=\{selected \? '#7A5C12' : '#1F2937'\}/);
  // Contrast: #1F2937 and #7A5C12 on white / selected cream must meet AA 4.5:1 for text-size icons/labels.
  const lum = (hex) => {
    const n = hex.replace('#', '');
    const rgb = [0, 2, 4].map((i) => {
      const c = Number.parseInt(n.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  };
  const ratio = (fg, bg) => {
    const a = lum(fg);
    const b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  };
  assert.ok(ratio('#1F2937', '#FFFFFF') >= 4.5, ratio('#1F2937', '#FFFFFF'));
  assert.ok(ratio('#1F2937', '#F8F9FB') >= 4.5);
  assert.ok(ratio('#7A5C12', '#FFFFFF') >= 4.5, ratio('#7A5C12', '#FFFFFF'));
  assert.ok(ratio('#7A5C12', '#F8F1D8') >= 4.5, ratio('#7A5C12', '#F8F1D8'));
  assert.ok(ratio('#111827', '#F8F9FB') >= 4.5);
  assert.ok(ratio('#4B5563', '#FFFFFF') >= 4.5);
});

test('Majlis SLA labels are separated from the unused 12k/25k/45k package list', () => {
  assert.match(commercial, /properties\.forEach\(\(_, index\) => updateProperty\(index, data\)\)/);
  assert.match(language, /'onboarding.sla.majlis_basic': 'Standard Maintenance'/);
  assert.match(language, /'onboarding.sla.majlis_elite': 'Elite Maintenance'/);
  assert.doesNotMatch(language, /Majlis Basic Maintenance/);
  assert.doesNotMatch(language, /24\/7 dedicated response readiness/);
  assert.match(language, /Event standby is an optional add-on quoted separately/);
  assert.match(matrix, /legacy catalogue, not live pricing/);
  assert.match(matrix, /These package prices must not be shown as selectable SLA or quote amounts/);
  assert.doesNotMatch(commercial, /12000|25000|45000/);
  assert.match(matrix, /Mosque \/ Masjid is priced by calculateMosqueQuote/);
  assert.doesNotMatch(matrix, /id: 'mosque_fm'/);
  assert.match(matrix, /custom FM formula/);
});

test('Firestore rules keep assetDetails server-written; the sanitizer allowlists keys and types', () => {
  assert.match(rules, /function assetDetailsWriteIsSafe\(/);
  assert.match(rules, /!data\.keys\(\)\.hasAny\(\['assetDetails'\]\)/);
  assert.match(rules, /affectedKeys\(\)\.hasAny\(\['assetDetails'\]\)/);
  assert.match(rules, /assetDetailsWriteIsSafe\(data\)/);
  assert.match(rules, /assetDetailsWriteIsSafe\(request\.resource.data\)/);
  assert.match(hardener, /assetDetailsWriteIsSafe\(data\)/);
  assert.match(hardener, /assetDetailsWriteIsSafe\(request\.resource.data\)/);
  assert.doesNotMatch(rules, /function assetDetailsMapIsSafe\(/);
  const { ASSET_DETAIL_ALLOWED_KEYS: allowedKeys } = detailsMod;
  assert.ok(allowedKeys.length >= 140);
  assert.ok(allowedKeys.includes('buildingName'));
  assert.ok(allowedKeys.includes('floorsAboveGround'));
  assert.ok(!allowedKeys.includes('paymentVerified'));
});

test('leftover payment screens stay quarantined off the live five-page route', () => {
  assert.match(read('src/components/onboarding/PaymentTermsStep.tsx'), /QUARANTINED/);
  assert.match(read('src/components/onboarding/PaymentSubmissionStep.tsx'), /QUARANTINED/);
  assert.match(read('src/components/onboarding/PaymentStatusCard.tsx'), /QUARANTINED/);
  assert.doesNotMatch(page, /PaymentTermsStep|PaymentSubmissionStep|PaymentStatusCard/);
});
