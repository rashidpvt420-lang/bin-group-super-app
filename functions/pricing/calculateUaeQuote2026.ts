import { UAE_PRICING_MATRIX_2026 } from './uaePricingMatrix2026';

export interface QuoteInput {
  assetClassId: string;
  emirate: string;
  zone: 'A' | 'B' | 'C';
  contractType: 'FM_ONLY' | 'PM_ONLY' | 'BOTH';
  sqft?: number;
  units?: number;
  beds?: number;
  annualRent?: number;
  annualRevenue?: number;
  propertyAge: number;
  floors?: number;
  lifts?: number;
  hasPool?: boolean;
  hasGym?: boolean;
  hasCentralHVAC?: boolean;
  hasDistrictCooling?: boolean;
  hasCivilDefenseSystem?: boolean;
  hasSiraCctv?: boolean;
  hasGenerator?: boolean;
  hasBmu?: boolean;
  hasDataCenterCriticality?: boolean;
  addOns?: string[];
  slaTier: 'standard' | 'premium' | 'elite';
  paymentPlan: 'annual' | 'quarterly' | 'monthly';
  hasWaterTank?: boolean;
  hvacCount?: number;
  offices?: number;
  shops?: number;
  gymComplexity?: 'STANDARD_DRY' | 'ENHANCED' | 'WET_RECOVERY';
  gymOpeningSchedule?: 'STANDARD_HOURS' | 'EXTENDED_HOURS' | '24_7';
  gymEquipmentCount?: number;
}

export interface QuoteOutput {
  baseQuote: number;
  zoneAdjustedQuote: number;
  emirateAdjustedQuote: number;
  complexityPremium: number;
  compliancePremium: number;
  addOnTotal: number;
  discount: number;
  annualTotal: number;
  quarterlyPayment: number;
  monthlyPayment: number;
  mobilizationFee: number;
  recommendedTier: string;
  pricingExplanation: string[];
  riskFlags: string[];
}

export const ASSET_PROFILE_PROPERTY_TYPES = [
  'Villa', 'Apartment', 'Residential Building', 'Commercial Building', 'Office', 'Gym / Fitness Centre', 'Retail Center', 'Mall',
  'Hotel', 'Resort', 'Hospital', 'Clinic', 'School', 'Warehouse', 'Industrial Property', 'Labour Camp',
  'Staff Accommodation', 'Government Property', 'Government Majlis', 'Private Majlis', 'Mosque / Masjid',
  'Mixed-Use Tower', 'Skyscraper', 'Stadium', 'Sports Complex', 'Event Venue', 'Farm / Estate',
] as const;

const LUXURY_GRADES = new Set(['Luxury', 'Ultra-Luxury', 'Sovereign']);

/**
 * Single authoritative mapping for every selectable Asset Profile property type.
 * Never let an unrecognised type silently become an apartment.
 */
export function resolveAssetClassIdForPropertyType(propertyType: string, assetGrade = 'Standard'): string | null {
  const luxury = LUXURY_GRADES.has(String(assetGrade || ''));
  switch (String(propertyType || '').trim()) {
    case 'Villa': return luxury ? 'villa-lux' : 'villa-std';
    case 'Apartment': return luxury ? 'apt-lux' : 'apt-std';
    case 'Residential Building': return 'res-bldg';
    case 'Commercial Building': return 'com-twr';
    case 'Office': return 'off-sml';
    case 'Gym / Fitness Centre': return 'gym-fitness-centre';
    case 'Retail Center': return 'retail-ctr';
    case 'Mall': return 'rtl-mall';
    case 'Hotel': return 'mid_scale_hotel';
    case 'Resort': return 'resort';
    case 'Hospital': return 'hosp';
    case 'Clinic': return 'clinic';
    case 'School': return 'school';
    case 'Warehouse': return 'warehouse';
    case 'Industrial Property': return 'industrial';
    case 'Labour Camp': return 'lab-camp';
    case 'Staff Accommodation': return 'staff-accom';
    case 'Government Property': return 'gov-facility';
    case 'Government Majlis': return 'government_majlis';
    case 'Private Majlis': return 'private_majlis';
    case 'Mosque / Masjid': return 'mosque_fm';
    case 'Mixed-Use Tower': return 'mix-dev';
    case 'Skyscraper': return 'highrise';
    case 'Stadium': return 'stadium';
    case 'Sports Complex': return 'sports-complex';
    case 'Event Venue': return 'event-venue';
    case 'Farm / Estate': return 'estate';
    // Backward-compatible legacy values only.
    case 'Building': return 'res-bldg';
    case 'Commercial': return 'off-sml';
    case 'Residential': return 'apt-std';
    default: return null;
  }
}

export const ADD_ON_PRICING: Record<string, { label: string; base: number; perUnit?: number; perFloor?: number }> = {
  fire_safety: { label: 'Fire Safety AMC', base: 8000 },
  water_tank: { label: 'Water Tank Sterilization', base: 2200 },
  elevator_amc: { label: 'Elevator / Lift AMC', base: 7500 },
  hvac_pm: { label: 'HVAC Preventive Maintenance', base: 6680 },
  cleaning: { label: 'Cleaning Team / Deep Cleaning', base: 18450 },
  security: { label: 'Security Services / CCTV', base: 36600 },
  pest_control: { label: 'Pest Control', base: 2475 },
  landscaping: { label: 'Landscaping & Irrigation', base: 12000 },
  move_in_out_inspection: { label: 'Move-in / Move-out Inspection', base: 1200 },
  mep_support: { label: 'MEP Support', base: 13500 },
  waste_management: { label: 'Waste Management', base: 6600 },
  pool_care: { label: 'Swimming Pool Maintenance', base: 9600 },
  facade_access: { label: 'Facade / BMU Access', base: 18000 },
  'façade_access': { label: 'Facade / BMU Access', base: 18000 },
  dist_cooling: { label: 'District Cooling Optimization', base: 12000 },
  sira_renewal: { label: 'CCTV / SIRA / ADMCC Maintenance', base: 8500 },
  grease_trap: { label: 'Grease Trap Service', base: 4800 },
  pca_audit: { label: 'PCA Asset Audit', base: 6500 },
  majlis_deep_care: { label: 'Majlis Deep Care', base: 12000 },
  majlis_landscaping: { label: 'Majlis Landscaping', base: 12000 },
  majlis_exterior_wash: { label: 'Majlis Exterior Wash', base: 4500 },
  majlis_standby: { label: 'Majlis Event Standby', base: 4500 },
  manpower: { label: 'Manpower Support', base: 30000 },
  concierge: { label: 'Concierge Desk', base: 42000 },
  generator: { label: 'Generator Maintenance', base: 7500 },
  cctv: { label: 'CCTV / Surveillance AMC', base: 8500 },
  office_units: { label: 'Office Unit Support', base: 6500 },
  retail_shops: { label: 'Retail Shops Support', base: 8500 },
  parking_management: { label: 'Parking Management', base: 9000 },
  fit_out_quotation: { label: 'Fit-out Quotation', base: 0 },
  emergency_priority: { label: 'Emergency Priority SOS', base: 2500 },
  technician_standby: { label: 'Technician Standby / Event Support', base: 7500 },
  tech_standby: { label: 'Technician Standby / Event Support', base: 7500 },
  event_support: { label: 'Event Support', base: 7500 },
  cleaning_team: { label: 'Cleaning Team', base: 18000 },
  deep_cleaning: { label: 'Deep Cleaning', base: 4500 },
  cctv_security: { label: 'CCTV / Security Systems', base: 8500 },
  inspection_move: { label: 'Move-in / Move-out Inspection', base: 1200 },
  gym_equipment_pm: { label: 'Fitness Equipment Preventive Maintenance — separate scope', base: 0 },
  gym_wet_area_care: { label: 'Gym Wet / Recovery Area Specialist Care — separate scope', base: 0 },
  gym_pool_operations: { label: 'Gym Pool Operations / Specialist Scope — separate scope', base: 0 },
};

const VALID_ZONES = new Set(['A', 'B', 'C']);
const VALID_CONTRACT_TYPES = new Set(['FM_ONLY', 'PM_ONLY', 'BOTH']);
const VALID_SLA_TIERS = new Set(['standard', 'premium', 'elite']);
const VALID_PAYMENT_PLANS = new Set(['annual', 'quarterly', 'monthly']);
const VALID_GYM_COMPLEXITY = new Set(['STANDARD_DRY', 'ENHANCED', 'WET_RECOVERY']);
const VALID_GYM_OPENING_SCHEDULES = new Set(['STANDARD_HOURS', 'EXTENDED_HOURS', '24_7']);
const QUARTERLY_BILLING_SURCHARGE = 0.03;
const MONTHLY_BILLING_SURCHARGE = 0.06;

const ASSET_CLASS_ALIASES: Record<string, string> = {
  standard_apartment: 'apt-std', apartment: 'apt-std', residential: 'apt-std', luxury_apartment: 'apt-lux',
  villa: 'villa-std', standard_villa: 'villa-std', luxury_estate_villa: 'villa-lux', luxury_villa: 'villa-lux',
  building: 'res-bldg', residential_building: 'res-bldg', commercial: 'off-sml', commercial_building: 'com-twr',
  commercial_tower: 'com-twr', office: 'off-sml', office_building: 'off-sml', small_office: 'off-sml',
  gym: 'gym-fitness-centre', gym_fitness_centre: 'gym-fitness-centre', gym_fitness_center: 'gym-fitness-centre',
  fitness_centre: 'gym-fitness-centre', fitness_center: 'gym-fitness-centre', health_club: 'gym-fitness-centre',
  retail_center: 'retail-ctr', retail_centre: 'retail-ctr', retail_mall: 'rtl-mall', mall: 'rtl-mall',
  hotel: 'mid_scale_hotel', mid_scale_hotel: 'mid_scale_hotel', resort: 'resort',
  hospital: 'hosp', large_hospital: 'hosp', clinic: 'clinic', primary_clinic: 'clinic',
  school: 'school', education: 'school', campus: 'school',
  warehouse: 'warehouse', logistics_warehouse: 'warehouse', industrial_property: 'industrial', industrial: 'industrial',
  labor_camp: 'lab-camp', labour_camp: 'lab-camp', staff_accommodation: 'staff-accom',
  government_property: 'gov-facility', government_building: 'gov-facility', government_facility: 'gov-facility',
  government_majlis: 'government_majlis', private_majlis: 'private_majlis', majlis: 'government_majlis',
  mosque: 'mosque_fm', masjid: 'mosque_fm', mosque_fm: 'mosque_fm', religious_facility: 'mosque_fm', mosque_masjid: 'mosque_fm',
  mixed_use: 'mix-dev', mixed_use_development: 'mix-dev', mixed_use_tower: 'mix-dev',
  skyscraper: 'highrise', high_rise: 'highrise', highrise: 'highrise', stadium: 'stadium',
  sports_complex: 'sports-complex', event_venue: 'event-venue', farm_estate: 'estate', estate: 'estate',
  data_center: 'data-ctr', data_centre: 'data-ctr',
};

function aliasKey(value?: string): string {
  return String(value || '').trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function finiteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'string') {
    const numeric = Number.parseFloat(value.replace(/x/gi, '').trim());
    return Number.isFinite(numeric) ? numeric : fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function positiveNumber(value: unknown, fallback = 0): number { return Math.max(finiteNumber(value, fallback), 0); }

function normalizeAssetClassId(assetClassId?: string): string {
  const raw = String(assetClassId || '').trim();
  if (!raw) return '';
  const keyed = aliasKey(raw);
  return ASSET_CLASS_ALIASES[raw] || ASSET_CLASS_ALIASES[raw.toLowerCase()] || ASSET_CLASS_ALIASES[keyed] || raw;
}

function safeZone(value: unknown): 'A' | 'B' | 'C' {
  const zone = String(value || '').trim().toUpperCase();
  return VALID_ZONES.has(zone) ? (zone as 'A' | 'B' | 'C') : 'B';
}
function safeContractType(value: unknown): 'FM_ONLY' | 'PM_ONLY' | 'BOTH' {
  const type = String(value || '').trim().toUpperCase();
  return VALID_CONTRACT_TYPES.has(type) ? (type as 'FM_ONLY' | 'PM_ONLY' | 'BOTH') : 'FM_ONLY';
}
function safeSlaTier(value: unknown): 'standard' | 'premium' | 'elite' {
  const tier = String(value || '').trim().toLowerCase();
  return VALID_SLA_TIERS.has(tier) ? (tier as 'standard' | 'premium' | 'elite') : 'standard';
}
function safePaymentPlan(value: unknown): 'annual' | 'quarterly' | 'monthly' {
  const plan = String(value || '').trim().toLowerCase();
  return VALID_PAYMENT_PLANS.has(plan) ? (plan as 'annual' | 'quarterly' | 'monthly') : 'annual';
}
function safeGymComplexity(value: unknown): 'STANDARD_DRY' | 'ENHANCED' | 'WET_RECOVERY' {
  const band = String(value || '').trim().toUpperCase();
  return VALID_GYM_COMPLEXITY.has(band) ? (band as 'STANDARD_DRY' | 'ENHANCED' | 'WET_RECOVERY') : 'STANDARD_DRY';
}
function safeGymOpeningSchedule(value: unknown): 'STANDARD_HOURS' | 'EXTENDED_HOURS' | '24_7' {
  const schedule = String(value || '').trim().toUpperCase();
  return VALID_GYM_OPENING_SCHEDULES.has(schedule) ? (schedule as 'STANDARD_HOURS' | 'EXTENDED_HOURS' | '24_7') : 'STANDARD_HOURS';
}

function sanitizeQuoteInput(input: Partial<QuoteInput> | null | undefined): QuoteInput {
  const raw = input || {};
  return {
    assetClassId: normalizeAssetClassId(raw.assetClassId),
    emirate: String(raw.emirate || '').trim(),
    zone: safeZone(raw.zone),
    contractType: safeContractType(raw.contractType),
    sqft: positiveNumber(raw.sqft), units: positiveNumber(raw.units), beds: positiveNumber(raw.beds),
    annualRent: positiveNumber(raw.annualRent), annualRevenue: positiveNumber(raw.annualRevenue),
    propertyAge: positiveNumber(raw.propertyAge), floors: positiveNumber(raw.floors), lifts: positiveNumber(raw.lifts),
    hasPool: raw.hasPool === true, hasGym: raw.hasGym === true, hasCentralHVAC: raw.hasCentralHVAC === true,
    hasDistrictCooling: raw.hasDistrictCooling === true, hasCivilDefenseSystem: raw.hasCivilDefenseSystem === true,
    hasSiraCctv: raw.hasSiraCctv === true, hasGenerator: raw.hasGenerator === true, hasBmu: raw.hasBmu === true,
    hasDataCenterCriticality: raw.hasDataCenterCriticality === true,
    addOns: Array.isArray(raw.addOns) ? raw.addOns.filter(Boolean) : [],
    slaTier: safeSlaTier(raw.slaTier), paymentPlan: safePaymentPlan(raw.paymentPlan), hasWaterTank: raw.hasWaterTank === true,
    hvacCount: positiveNumber(raw.hvacCount), offices: positiveNumber(raw.offices), shops: positiveNumber(raw.shops),
    gymComplexity: safeGymComplexity(raw.gymComplexity),
    gymOpeningSchedule: safeGymOpeningSchedule(raw.gymOpeningSchedule),
    gymEquipmentCount: positiveNumber(raw.gymEquipmentCount),
  };
}

function planSurcharge(paymentPlan: QuoteInput['paymentPlan']): number {
  if (paymentPlan === 'monthly') return MONTHLY_BILLING_SURCHARGE;
  if (paymentPlan === 'quarterly') return QUARTERLY_BILLING_SURCHARGE;
  return 0;
}
function slaMultiplier(slaTier: QuoteInput['slaTier']): number {
  if (slaTier === 'elite') return 1.3;
  if (slaTier === 'premium') return 1.15;
  return 1;
}
function addPaymentExplanation(paymentPlan: QuoteInput['paymentPlan'], explanation: string[]) {
  if (paymentPlan === 'monthly') explanation.push('Monthly billing facility adds 6% to the annual service value.');
  else if (paymentPlan === 'quarterly') explanation.push('Quarterly billing facility adds 3% to the annual service value.');
  else explanation.push('Annual settlement uses the base annual service value.');
}
function zeroQuote(reason: string, tier: QuoteInput['slaTier'] = 'standard', extraFlags: string[] = []): QuoteOutput {
  return {
    baseQuote: 0, zoneAdjustedQuote: 0, emirateAdjustedQuote: 0, complexityPremium: 0, compliancePremium: 0,
    addOnTotal: 0, discount: 0, annualTotal: 0, quarterlyPayment: 0, monthlyPayment: 0, mobilizationFee: 0,
    recommendedTier: tier, pricingExplanation: [reason], riskFlags: [reason, ...extraFlags],
  };
}

export function resolveMandatoryAddOns(input: QuoteInput): string[] {
  const safeInput = sanitizeQuoteInput(input);
  if (safeInput.contractType === 'PM_ONLY') return [];
  const ids = new Set<string>();
  const asset = normalizeAssetClassId(safeInput.assetClassId);
  const isMosque = asset === 'mosque_fm';
  if (isMosque) {
    ids.add('water_tank'); ids.add('hvac_pm'); ids.add('cleaning'); ids.add('sira_renewal'); ids.add('emergency_priority');
  }
  if (safeInput.hasCivilDefenseSystem) ids.add('fire_safety');
  if (safeInput.hasWaterTank) ids.add('water_tank');
  if ((safeInput.lifts || 0) > 0) ids.add('elevator_amc');
  if (safeInput.hasSiraCctv) ids.add('sira_renewal');
  if (safeInput.hasBmu) ids.add('facade_access');
  if (safeInput.propertyAge > 15) ids.add('pca_audit');
  if (safeInput.hasPool) ids.add('pool_care');
  if (safeInput.hasCentralHVAC || (safeInput.hvacCount || 0) > 0) ids.add('hvac_pm');
  return Array.from(ids);
}

export function calculateAddOnAnnualValue(addOns: string[] | undefined, property: { units?: number; floors?: number; offices?: number; shops?: number }): number {
  if (!addOns?.length) return 0;
  let total = 0;
  new Set(addOns).forEach((id) => {
    const canonicalId = id === 'façade_access' ? 'facade_access' : id;
    const item = ADD_ON_PRICING[canonicalId];
    if (!item) return;
    total += item.base;
    if (item.perUnit) total += item.perUnit * Math.max(property.units || 0, property.offices || 0, property.shops || 0, 1);
    if (item.perFloor) total += item.perFloor * Math.max(property.floors || 0, 1);
  });
  return Math.round(total);
}

function calculateMosqueQuote(input: QuoteInput): QuoteOutput {
  const safeInput = sanitizeQuoteInput(input);
  if (safeInput.contractType !== 'FM_ONLY') {
    return zeroQuote('Mosque / Masjid currently requires Maintenance Only pricing; Property Management is not auto-quoted.', safeInput.slaTier, ['FM_ONLY_REQUIRED']);
  }
  if (!(safeInput.sqft && safeInput.sqft > 0) || !(safeInput.units && safeInput.units > 0)) {
    return zeroQuote('Measured mosque area and worshipper capacity are required before a quote can be issued.', safeInput.slaTier, ['MISSING_PRICING_DRIVER']);
  }
  const pricingExplanation: string[] = [];
  const riskFlags: string[] = [];
  const sqft = safeInput.sqft;
  const age = safeInput.propertyAge || 0;
  const capacity = safeInput.units;
  const mepRate = 12;
  const ageCoefficient = age <= 3 ? 1 : age <= 9 ? 1.08 : age <= 15 ? 1.15 : 1.25;
  const capacityMultiplier = capacity <= 300 ? 1 : capacity <= 1000 ? 1.08 : capacity <= 3000 ? 1.15 : 1.25;
  const baseQuote = sqft * mepRate * ageCoefficient;
  const softServices = sqft * 4 * capacityMultiplier;
  const wuduAreaProxySqft = Math.min(Math.max(Math.ceil(capacity * 0.12), 35), 650);
  const wuduCleaning = wuduAreaProxySqft * 18 * 12;
  const ramadanSurge = 8500 + (safeInput.hasCentralHVAC ? 1500 : 0);
  const compliancePremium = Math.max(baseQuote * 0.03, 1500);
  const complexityPremium = (baseQuote + softServices) * 0.06;
  const mergedAddOns = Array.from(new Set([...(safeInput.addOns || []), ...resolveMandatoryAddOns(safeInput)]));
  const addOnTotal = calculateAddOnAnnualValue(mergedAddOns, { ...safeInput, units: 1 });
  const subtotal = baseQuote + softServices + wuduCleaning + ramadanSurge + compliancePremium + complexityPremium + addOnTotal;
  const annualTotal = subtotal * slaMultiplier(safeInput.slaTier) * (1 + planSurcharge(safeInput.paymentPlan));
  pricingExplanation.push(`${mepRate} AED/sqft mosque MEP benchmark applied to ${sqft} measured sqft.`);
  pricingExplanation.push(`Wudu service uses a bounded ${wuduAreaProxySqft} sqft proxy rather than multiplying by worshipper capacity.`);
  pricingExplanation.push('Prayer-time scheduling and Ramadan readiness are included in the operational model.');
  addPaymentExplanation(safeInput.paymentPlan, pricingExplanation);
  if (age > 10) riskFlags.push('Aging mosque MEP review required');
  if (!safeInput.hasSiraCctv) riskFlags.push('Mosque security/compliance review required');
  return {
    baseQuote, zoneAdjustedQuote: baseQuote, emirateAdjustedQuote: baseQuote, complexityPremium, compliancePremium,
    addOnTotal, discount: 0, annualTotal, quarterlyPayment: annualTotal / 4, monthlyPayment: annualTotal / 12,
    mobilizationFee: annualTotal * 0.15, recommendedTier: safeInput.slaTier, pricingExplanation, riskFlags,
  };
}

export function calculateUaeQuote2026(input: Partial<QuoteInput> | null | undefined): QuoteOutput {
  const safeInput = sanitizeQuoteInput(input);
  const assetId = normalizeAssetClassId(safeInput.assetClassId);
  if (!assetId) return zeroQuote('Asset type is required before pricing can be calculated.', safeInput.slaTier, ['ASSET_TYPE_REQUIRED']);
  if (assetId === 'mosque_fm') return calculateMosqueQuote(safeInput);

  const assetClass = UAE_PRICING_MATRIX_2026.assetClasses.find((asset) => asset.id === assetId);
  if (!assetClass) return zeroQuote(`Asset class '${assetId}' is not configured for automatic pricing.`, safeInput.slaTier, ['ASSET_CLASS_REVIEW_REQUIRED']);

  const pricingExplanation: string[] = [];
  const riskFlags: string[] = [];
  const managedRevenue = safeInput.annualRent || safeInput.annualRevenue || 0;
  const managementRate = positiveNumber(assetClass.managementRange.min);

  // Property Management is a percentage of actual annual rent/revenue. It must never be multiplied by sqft/units/beds.
  if (safeInput.contractType === 'PM_ONLY') {
    if (managementRate <= 0) return zeroQuote(`${assetClass.label} does not support an automatic Property Management Only quote.`, safeInput.slaTier, ['PM_NOT_SUPPORTED']);
    if (managedRevenue <= 0) return zeroQuote('Annual rent / managed revenue is required for Property Management pricing; no placeholder revenue is assumed.', safeInput.slaTier, ['ANNUAL_RENT_REQUIRED']);
    const baseQuote = managedRevenue * (managementRate / 100);
    const annualTotal = baseQuote * (1 + planSurcharge(safeInput.paymentPlan));
    pricingExplanation.push(`${managementRate}% property-management fee applied once to AED ${Math.round(managedRevenue)} annual rent / managed revenue.`);
    pricingExplanation.push('No technical FM add-ons, sqft multiplier, unit multiplier, age premium or regional premium is applied to PM-only pricing.');
    addPaymentExplanation(safeInput.paymentPlan, pricingExplanation);
    return {
      baseQuote, zoneAdjustedQuote: baseQuote, emirateAdjustedQuote: baseQuote, complexityPremium: 0, compliancePremium: 0,
      addOnTotal: 0, discount: 0, annualTotal, quarterlyPayment: annualTotal / 4, monthlyPayment: annualTotal / 12,
      mobilizationFee: annualTotal * 0.15, recommendedTier: safeInput.slaTier, pricingExplanation, riskFlags,
    };
  }

  let baseRate = positiveNumber(assetClass.maintenanceRange.min);
  if (assetId === 'gym-fitness-centre') {
    if (safeInput.gymComplexity === 'WET_RECOVERY') baseRate = positiveNumber(assetClass.maintenanceRange.max, baseRate);
    else if (safeInput.gymComplexity === 'ENHANCED') baseRate = positiveNumber(assetClass.maintenanceRange.target, baseRate);
    pricingExplanation.push(`Gym ${safeInput.gymComplexity} BIN-configured service-rate band selected; this is not a statutory UAE tariff.`);
    pricingExplanation.push('Gym member count, licensed capacity and equipment count are scope information only and do not multiply the property price.');
    if (safeInput.gymOpeningSchedule === '24_7') pricingExplanation.push('24/7 operation is recorded for visit/SLA verification; no occupancy multiplier is applied automatically.');
    if ((safeInput.gymEquipmentCount || 0) > 0) pricingExplanation.push('Fitness equipment count is recorded for a separate equipment-PM scope and does not multiply the property rate.');
  }

  let baseQuote = 0;
  if (assetClass.pricingUnit === 'facility') {
    baseQuote = baseRate;
    pricingExplanation.push(`Flat annual facility rate of AED ${baseRate} applied once.`);
  } else if (assetClass.pricingUnit === 'sqft') {
    if (!(safeInput.sqft && safeInput.sqft > 0)) return zeroQuote(`${assetClass.label} requires measured service area in sqft before pricing.`, safeInput.slaTier, ['MISSING_SQFT']);
    baseQuote = baseRate * safeInput.sqft;
    pricingExplanation.push(`${baseRate} AED/sqft applied to ${safeInput.sqft} measured service sqft.`);
  } else if (assetClass.pricingUnit === 'unit') {
    if (!(safeInput.units && safeInput.units > 0)) return zeroQuote(`${assetClass.label} requires a verified unit count before pricing.`, safeInput.slaTier, ['MISSING_UNITS']);
    baseQuote = baseRate * safeInput.units;
    pricingExplanation.push(`${baseRate} AED/unit applied to ${safeInput.units} units.`);
  } else if (assetClass.pricingUnit === 'bed') {
    if (!(safeInput.beds && safeInput.beds > 0)) return zeroQuote(`${assetClass.label} requires a verified bed count before pricing.`, safeInput.slaTier, ['MISSING_BEDS']);
    baseQuote = baseRate * safeInput.beds;
    pricingExplanation.push(`${baseRate} AED/bed/year applied to ${safeInput.beds} beds.`);
  } else {
    return zeroQuote(`Unsupported pricing driver '${assetClass.pricingUnit}' for ${assetClass.label}.`, safeInput.slaTier, ['PRICING_DRIVER_REVIEW_REQUIRED']);
  }

  if (baseQuote < assetClass.minimumAnnualContract) {
    baseQuote = assetClass.minimumAnnualContract;
    pricingExplanation.push(`Minimum technical annual contract of AED ${assetClass.minimumAnnualContract} applied.`);
  }

  const zoneEntry = UAE_PRICING_MATRIX_2026.zones[safeInput.zone] || UAE_PRICING_MATRIX_2026.zones.B || { multiplier: 1 };
  const zoneMultiplier = finiteNumber(zoneEntry.multiplier, 1);
  const zoneAdjustedQuote = baseQuote * zoneMultiplier;
  if (zoneMultiplier !== 1) pricingExplanation.push(`Zone ${safeInput.zone} technical-service factor ${zoneMultiplier}x applied.`);

  const normalizedEmirate = safeInput.emirate.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const emirateMultiplier = normalizedEmirate.includes('dubai') ? 1.15
    : normalizedEmirate.includes('abudhabi') ? 1.1
    : normalizedEmirate.includes('sharjah') ? 0.9
    : (normalizedEmirate === 'rak' || normalizedEmirate.includes('rasalkhaimah') || normalizedEmirate.includes('ajman') || normalizedEmirate.includes('fujairah') || normalizedEmirate === 'uaq' || normalizedEmirate.includes('ummalquwain')) ? 0.8
    : 1;
  if (!normalizedEmirate) riskFlags.push('Emirate confirmation required');
  const emirateAdjustedQuote = zoneAdjustedQuote * emirateMultiplier;
  if (emirateMultiplier !== 1) pricingExplanation.push(`Regional technical-service factor ${emirateMultiplier}x applied for ${safeInput.emirate}.`);

  const ageMultiplier = safeInput.propertyAge > 20 ? 1.2 : safeInput.propertyAge > 10 ? 1.12 : safeInput.propertyAge > 5 ? 1.06 : 1;
  if (ageMultiplier > 1) pricingExplanation.push(`Asset-age factor ${ageMultiplier}x applied for ${safeInput.propertyAge} years.`);

  let complexityPremiumPercent = 0;
  if ((safeInput.floors || 0) >= 40) complexityPremiumPercent += 12;
  else if ((safeInput.floors || 0) >= 15) complexityPremiumPercent += 6;
  if ((safeInput.lifts || 0) > 10) complexityPremiumPercent += 8;
  else if ((safeInput.lifts || 0) > 4) complexityPremiumPercent += 4;
  if (safeInput.hasCentralHVAC) complexityPremiumPercent += 4;
  if (safeInput.hasDistrictCooling) complexityPremiumPercent -= 3;
  if (safeInput.hasGenerator) complexityPremiumPercent += 3;
  if (safeInput.hasBmu) complexityPremiumPercent += 5;
  if (safeInput.hasCivilDefenseSystem) complexityPremiumPercent += 3;
  if (['hosp', 'data-ctr', 'stadium'].includes(assetId)) { complexityPremiumPercent += 12; riskFlags.push('Specialist systems review required'); }
  if (['highrise', 'rtl-mall', 'resort'].includes(assetId)) complexityPremiumPercent += 6;

  const complexityPremium = emirateAdjustedQuote * (complexityPremiumPercent / 100);
  if (complexityPremiumPercent !== 0) pricingExplanation.push(`${complexityPremiumPercent}% technical complexity adjustment applied.`);

  const appliedSlaMultiplier = slaMultiplier(safeInput.slaTier);
  if (appliedSlaMultiplier > 1) pricingExplanation.push(`${safeInput.slaTier.toUpperCase()} service-level factor ${appliedSlaMultiplier}x applied to technical FM.`);

  const mergedAddOns = Array.from(new Set([...(safeInput.addOns || []), ...resolveMandatoryAddOns(safeInput)]));
  const addOnDriver = assetClass.pricingUnit === 'facility' ? { ...safeInput, units: 1, offices: 0, shops: 0 } : safeInput;
  const addOnTotal = calculateAddOnAnnualValue(mergedAddOns, addOnDriver);
  const technicalSubtotal = (emirateAdjustedQuote * ageMultiplier * appliedSlaMultiplier) + complexityPremium + addOnTotal;

  let managementFee = 0;
  if (safeInput.contractType === 'BOTH' && managementRate > 0) {
    if (managedRevenue <= 0) return zeroQuote('Annual rent / managed revenue is required for a combined Maintenance + Property Management quote; no placeholder revenue is assumed.', safeInput.slaTier, ['ANNUAL_RENT_REQUIRED']);
    managementFee = managedRevenue * (managementRate / 100);
    pricingExplanation.push(`${managementRate}% property-management fee (AED ${Math.round(managementFee)}) added once from verified annual rent / managed revenue.`);
  }

  const subtotal = technicalSubtotal + managementFee;
  const annualTotal = subtotal * (1 + planSurcharge(safeInput.paymentPlan));
  addPaymentExplanation(safeInput.paymentPlan, pricingExplanation);
  return {
    baseQuote, zoneAdjustedQuote, emirateAdjustedQuote, complexityPremium, compliancePremium: 0, addOnTotal,
    discount: 0, annualTotal, quarterlyPayment: annualTotal / 4, monthlyPayment: annualTotal / 12,
    mobilizationFee: annualTotal * 0.15, recommendedTier: safeInput.slaTier, pricingExplanation, riskFlags,
  };
}