import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const intelligence = read('src/utils/propertyIntelligence.ts');
const panel = read('src/components/onboarding/PropertyInventoryPanel.tsx');
const portfolioStep = read('src/components/onboarding/PropertyPortfolioIntelligenceStep.tsx');
const assetProfile = read('src/components/onboarding/AssetProfileStep.tsx');
const onboardingPage = read('src/pages/PropertyOnboardingPage.tsx');
const canonicalQuote = read('src/utils/calculateUaeQuote2026.ts');
const floorPlanAi = read('functions/floorPlanAnalyzer.ts');
const descriptionAi = read('functions/propertyDescriptionAnalyzer.ts');
const runtime = read('functions/runtime.ts');

const propertyTypes = [
  'Villa', 'Apartment', 'Residential Building', 'Commercial Building', 'Office', 'Gym / Fitness Centre', 'Retail Center', 'Mall',
  'Hotel', 'Resort', 'Hospital', 'Clinic', 'School', 'Warehouse', 'Industrial Property', 'Labour Camp',
  'Staff Accommodation', 'Government Property', 'Government Majlis', 'Private Majlis', 'Mosque / Masjid',
  'Mixed-Use Tower', 'Skyscraper', 'Stadium', 'Sports Complex', 'Event Venue', 'Farm / Estate',
];

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('property intelligence follows the canonical 27-type Owner Asset Profile catalog', () => {
  assert.match(intelligence, /ASSET_PROFILE_PROPERTY_TYPES/);
  assert.match(intelligence, /Record<CanonicalPropertyType, SpaceDefinition\[\]>/);
  for (const propertyType of propertyTypes) {
    const escaped = escapeRegExp(propertyType);
    assert.match(canonicalQuote, new RegExp(`['\"]${escaped}['\"]`), `canonical Asset Profile is missing ${propertyType}`);
    assert.match(intelligence, new RegExp(`(?:^|\\s|['\"])${escaped}(?:\\s*:|['\"])`, 'm'), `property intelligence is missing ${propertyType}`);
  }
  assert.equal(propertyTypes.length, 27);
  assert.match(intelligence, /'Gym \/ Fitness Centre': GYM_SET/);
});

test('Owner page 2 adds property intelligence without changing the five-page application contract', () => {
  assert.match(onboardingPage, /const PAGE_COUNT = 5/);
  assert.match(onboardingPage, /PropertyPortfolioIntelligenceStep/);
  assert.match(onboardingPage, /Rooms, floor plan & property AI/);
  assert.ok(onboardingPage.indexOf('<AssetProfileStep') < onboardingPage.indexOf('<PropertyPortfolioIntelligenceStep'));
  assert.ok(onboardingPage.indexOf('<PropertyPortfolioIntelligenceStep') < onboardingPage.indexOf('<PropertyLocationStep'));
  assert.match(portfolioStep, /PropertyInventoryPanel/);
  assert.match(portfolioStep, /does not set legal capacity, compliance, contract approval or price/);
});

test('dedicated Gym Operations Profile is preserved alongside generic property inventory', () => {
  assert.match(assetProfile, /Gym \/ Fitness Centre Operations Profile/);
  assert.match(assetProfile, /sportsEstablishmentApprovalStatus/);
  assert.match(assetProfile, /pmPricingBasis/);
  assert.match(assetProfile, /verifiedServiceAreaSqft/);
  assert.match(assetProfile, /Equipment preventive maintenance, specialist wet\/recovery care and pool operations are separate scopes/);
  assert.doesNotMatch(assetProfile, /<PropertyInventoryPanel/);
});

test('Property Profile supports manual inventory, floor plans, natural-language extraction and contextual AI', () => {
  assert.match(panel, /Upload floor plan/);
  assert.match(panel, /processFloorPlanAI/);
  assert.match(panel, /Find rooms & spaces with AI/);
  assert.match(panel, /processPropertyDescriptionAI/);
  assert.match(panel, /runSovereignAI/);
  assert.match(panel, /Add another space/);
  assert.match(panel, /Automatic property calculations/);
  assert.match(panel, /if \(existing\?\.verified === true\) continue;/);
});

test('property inventory calculations never become pricing authority', () => {
  assert.doesNotMatch(intelligence, /ownerPortfolioQuote|annualTotal|priceMultiplier/);
  assert.doesNotMatch(panel, /extraPatch\.(units|beds|annualRent|annualRevenue)\s*=/);
  assert.match(panel, /if \(!\(Number\(property\.floors\) > 0\)/);
  assert.match(panel, /if \(!\(Number\(property\.sqft\) > 0\)/);
});

test('floor-plan AI is owner-scoped, App-Check protected, quota protected, advisory and fail-closed', () => {
  assert.match(floorPlanAi, /enforceAppCheck:\s*true/);
  assert.match(floorPlanAi, /reserveAiUsageQuota/);
  assert.match(floorPlanAi, /settleAiUsageQuota/);
  assert.match(floorPlanAi, /owners\/\$\{uid\}\/property_documents\/floor_plans\//);
  assert.match(floorPlanAi, /OWNER_CONFIRMATION_REQUIRED/);
  assert.match(floorPlanAi, /autoVerified:\s*false/);
  assert.match(floorPlanAi, /Do not invent bedrooms, offices, kitchens, bathrooms, floor counts, areas, equipment, occupancy, or legal capacity/);
  assert.doesNotMatch(floorPlanAi, /autoVerified:\s*true/);
});

test('property-description AI is quota protected and refuses to invent missing counts', () => {
  assert.match(descriptionAi, /enforceAppCheck:\s*true/);
  assert.match(descriptionAi, /reserveAiUsageQuota/);
  assert.match(descriptionAi, /If the owner says a space exists without giving a count, do not turn that into count 1/);
  assert.match(descriptionAi, /OWNER_CONFIRMATION_REQUIRED/);
  assert.match(descriptionAi, /autoVerified:\s*false/);
  assert.doesNotMatch(descriptionAi, /autoVerified:\s*true/);
});

test('runtime exports both structured property-intake AI callables', () => {
  assert.match(runtime, /processFloorPlanAI/);
  assert.match(runtime, /processPropertyDescriptionAI/);
});
