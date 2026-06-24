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
};

const VALID_ZONES = new Set(['A', 'B', 'C']);
const VALID_CONTRACT_TYPES = new Set(['FM_ONLY', 'PM_ONLY', 'BOTH']);
const VALID_SLA_TIERS = new Set(['standard', 'premium', 'elite']);
const VALID_PAYMENT_PLANS = new Set(['annual', 'quarterly', 'monthly']);
const MAJLIS_ASSET_IDS = new Set(['government_majlis', 'private_majlis', 'majlis']);
const QUARTERLY_BILLING_SURCHARGE = 0.03;
const MONTHLY_BILLING_SURCHARGE = 0.06;

const ASSET_CLASS_ALIASES: Record<string, string> = {
  standard_apartment: 'apt-std',
  apartment: 'apt-std',
  residential: 'apt-std',
  luxury_apartment: 'apt-lux',
  villa: 'villa-std',
  standard_villa: 'villa-std',
  luxury_estate_villa: 'villa-lux',
  luxury_villa: 'villa-lux',
  building: 'com-twr',
  commercial: 'off-sml',
  commercial_building: 'com-twr',
  commercial_tower: 'com-twr',
  office_building: 'off-sml',
  small_office: 'off-sml',
  retail_center: 'rtl-mall',
  retail_centre: 'rtl-mall',
  retail_mall: 'rtl-mall',
  mall: 'rtl-mall',
  warehouse: 'lab-camp',
  logistics_warehouse: 'lab-camp',
  labor_camp: 'lab-camp',
  labour_camp: 'lab-camp',
  hospital: 'hosp',
  clinic: 'hosp',
  large_hospital: 'hosp',
  primary_clinic: 'hosp',
  school: 'school',
  education: 'school',
  campus: 'school',
  government_property: 'government_majlis',
  government_building: 'government_majlis',
  government_facility: 'government_majlis',
  government_majlis: 'government_majlis',
  private_majlis: 'private_majlis',
  majlis: 'government_majlis',
  data_center: 'data-ctr',
  data_centre: 'data-ctr',
  mixed_use: 'mix-dev',
  mixed_use_development: 'mix-dev',
  mixed_use_tower: 'mix-dev',
  hotel: 'mid_scale_hotel',
  mid_scale_hotel: 'mid_scale_hotel',
  mosque: 'mosque_fm',
  masjid: 'mosque_fm',
  mosque_fm: 'mosque_fm',
  religious_facility: 'mosque_fm',
  mosque_masjid: 'mosque_fm',
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

function positiveNumber(value: unknown, fallback = 0): number {
  return Math.max(finiteNumber(value, fallback), 0);
}

function normalizeAssetClassId(assetClassId?: string): string {
  const raw = String(assetClassId || '').trim();
  if (!raw) return 'apt-std';
  const keyed = aliasKey(raw);
  return ASSET_CLASS_ALIASES[raw] || ASSET_CLASS_ALIASES[raw.toLowerCase()] || ASSET_CLASS_ALIASES[keyed] || raw;
}

function safeZone(value: unknown): 'A' | 'B' | 'C' {
  const zone = String(value || '').trim().toUpperCase();
  return VALID_ZONES.has(zone) ? (zone as 'A' | 'B' | 'C') : 'B';
}

function safeContractType(value: unknown): 'FM_ONLY' | 'PM_ONLY' | 'BOTH' {
  const contractType = String(value || '').trim().toUpperCase();
  return VALID_CONTRACT_TYPES.has(contractType) ? (contractType as 'FM_ONLY' | 'PM_ONLY' | 'BOTH') : 'FM_ONLY';
}

function safeSlaTier(value: unknown): 'standard' | 'premium' | 'elite' {
  const tier = String(value || '').trim().toLowerCase();
  return VALID_SLA_TIERS.has(tier) ? (tier as 'standard' | 'premium' | 'elite') : 'standard';
}

function safePaymentPlan(value: unknown): 'annual' | 'quarterly' | 'monthly' {
  const plan = String(value || '').trim().toLowerCase();
  return VALID_PAYMENT_PLANS.has(plan) ? (plan as 'annual' | 'quarterly' | 'monthly') : 'annual';
}

function sanitizeQuoteInput(input: Partial<QuoteInput> | null | undefined): QuoteInput {
  const raw = input || {};
  return {
    assetClassId: normalizeAssetClassId(raw.assetClassId),
    emirate: String(raw.emirate || 'dubai').trim() || 'dubai',
    zone: safeZone(raw.zone),
    contractType: safeContractType(raw.contractType),
    sqft: positiveNumber(raw.sqft),
    units: positiveNumber(raw.units),
    beds: positiveNumber(raw.beds),
    annualRent: positiveNumber(raw.annualRent),
    annualRevenue: positiveNumber(raw.annualRevenue),
    propertyAge: positiveNumber(raw.propertyAge),
    floors: positiveNumber(raw.floors),
    lifts: positiveNumber(raw.lifts),
    hasPool: raw.hasPool === true,
    hasGym: raw.hasGym === true,
    hasCentralHVAC: raw.hasCentralHVAC === true,
    hasDistrictCooling: raw.hasDistrictCooling === true,
    hasCivilDefenseSystem: raw.hasCivilDefenseSystem === true,
    hasSiraCctv: raw.hasSiraCctv === true,
    hasGenerator: raw.hasGenerator === true,
    hasBmu: raw.hasBmu === true,
    hasDataCenterCriticality: raw.hasDataCenterCriticality === true,
    addOns: Array.isArray(raw.addOns) ? raw.addOns.filter(Boolean) : [],
    slaTier: safeSlaTier(raw.slaTier),
    paymentPlan: safePaymentPlan(raw.paymentPlan),
    hasWaterTank: raw.hasWaterTank === true,
    hvacCount: positiveNumber(raw.hvacCount),
    offices: positiveNumber(raw.offices),
    shops: positiveNumber(raw.shops),
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

function addPaymentExplanation(paymentPlan: QuoteInput['paymentPlan'], pricingExplanation: string[]) {
  if (paymentPlan === 'monthly') pricingExplanation.push('MONTHLY billing facility applied; monthly total is higher than annual/quarterly.');
  else if (paymentPlan === 'quarterly') pricingExplanation.push('QUARTERLY scheduled-payment facility applied while keeping the annual SLA active.');
  else pricingExplanation.push('ANNUAL best-value settlement applied with full-year contract activation.');
}

export function resolveMandatoryAddOns(input: QuoteInput): string[] {
  const safeInput = sanitizeQuoteInput(input);
  const ids = new Set<string>(['fire_safety']);
  const normalizedAsset = normalizeAssetClassId(safeInput.assetClassId);
  const isMosque = normalizedAsset === 'mosque_fm';
  const isMajlis = MAJLIS_ASSET_IDS.has(normalizedAsset);

  if (isMosque) {
    ids.add('water_tank');
    ids.add('hvac_pm');
    ids.add('cleaning');
    ids.add('sira_renewal');
    ids.add('emergency_priority');
  }
  if (safeInput.hasWaterTank) ids.add('water_tank');
  if (!isMajlis && ((safeInput.floors || 0) > 1 || (safeInput.lifts || 0) > 0)) ids.add('elevator_amc');
  if (safeInput.hasSiraCctv) ids.add('sira_renewal');
  if (safeInput.hasBmu) ids.add('facade_access');
  if (safeInput.propertyAge > 15) ids.add('pca_audit');
  if (safeInput.hasPool) ids.add('pool_care');
  if (safeInput.hasCentralHVAC || (safeInput.hvacCount || 0) > 0) ids.add('hvac_pm');

  return Array.from(ids);
}

export function calculateAddOnAnnualValue(
  addOns: string[] | undefined,
  property: { units?: number; floors?: number; offices?: number; shops?: number }
): number {
  if (!addOns || addOns.length === 0) return 0;
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
  const pricingExplanation: string[] = [];
  const riskFlags: string[] = [];

  const sqft = Math.max(safeInput.sqft || 0, 1000);
  const age = safeInput.propertyAge || 0;
  const worshipperCapacity = Math.max(safeInput.units || 1, 1);
  const mepRate = safeInput.contractType === 'FM_ONLY' ? 20 : safeInput.contractType === 'BOTH' ? 38 : 30;
  const ageCoefficient = age <= 3 ? 1 : age <= 9 ? 1.18 : age <= 15 ? 1.35 : 1.55;
  const capacityMultiplier = worshipperCapacity <= 300 ? 1 : worshipperCapacity <= 1000 ? 1.15 : worshipperCapacity <= 3000 ? 1.35 : 1.6;

  const baseQuote = sqft * mepRate * ageCoefficient;
  const softServices = sqft * 8 * capacityMultiplier;
  const wuduAreaProxySqft = Math.min(Math.max(Math.ceil(worshipperCapacity * 0.12), 35), 650);
  const wuduCleaning = wuduAreaProxySqft * 35 * 26;
  const ramadanSurge = 15500 + (safeInput.hasCentralHVAC ? 2500 : 0);
  const compliancePremium = Math.max(baseQuote * 0.04, 2500);
  const complexityPremium = (baseQuote + softServices) * 0.1;
  const mergedAddOns = Array.from(new Set([...(safeInput.addOns || []), ...resolveMandatoryAddOns(safeInput)]));
  const addOnTotal = calculateAddOnAnnualValue(mergedAddOns, safeInput);
  const annualTotal = (baseQuote + softServices + wuduCleaning + ramadanSurge + compliancePremium + complexityPremium + addOnTotal) * slaMultiplier(safeInput.slaTier) * (1 + planSurcharge(safeInput.paymentPlan));

  pricingExplanation.push(`${mepRate} AED/sqft mosque MEP rate applied to ${sqft} sqft.`);
  pricingExplanation.push(`${ageCoefficient}x mosque age/risk coefficient applied.`);
  pricingExplanation.push(`Wudu cleaning priced from ${wuduAreaProxySqft} sqft wudu-area proxy, not worshipper capacity.`);
  pricingExplanation.push('Prayer-time-safe mosque operating model included.');
  addPaymentExplanation(safeInput.paymentPlan, pricingExplanation);

  if (age > 10) riskFlags.push('Aging mosque MEP risk premium required');
  if (!safeInput.hasSiraCctv) riskFlags.push('Mosque security/compliance review required');

  return {
    baseQuote,
    zoneAdjustedQuote: baseQuote,
    emirateAdjustedQuote: baseQuote,
    complexityPremium,
    compliancePremium,
    addOnTotal,
    discount: 0,
    annualTotal,
    quarterlyPayment: annualTotal / 4,
    monthlyPayment: annualTotal / 12,
    mobilizationFee: annualTotal * 0.15,
    recommendedTier: safeInput.slaTier,
    pricingExplanation,
    riskFlags,
  };
}

export function calculateUaeQuote2026(input: Partial<QuoteInput> | null | undefined): QuoteOutput {
  const safeInput = sanitizeQuoteInput(input);
  const normalizedAssetClassId = normalizeAssetClassId(safeInput.assetClassId);

  if (normalizedAssetClassId === 'mosque_fm') return calculateMosqueQuote(safeInput);

  let assetClass = UAE_PRICING_MATRIX_2026.assetClasses.find((asset) => asset.id === normalizedAssetClassId);
  const pricingExplanation: string[] = [];
  const riskFlags: string[] = [];

  if (!assetClass) {
    assetClass = UAE_PRICING_MATRIX_2026.assetClasses.find((asset) => asset.id === 'apt-std') || UAE_PRICING_MATRIX_2026.assetClasses[0];
    pricingExplanation.push(`Unknown asset class '${input?.assetClassId || 'blank'}' was normalized to '${assetClass.id}'. Admin review required.`);
    riskFlags.push('Asset Class Review Required');
  } else if (normalizedAssetClassId !== input?.assetClassId) {
    pricingExplanation.push(`Asset class '${input?.assetClassId || 'blank'}' normalized to '${normalizedAssetClassId}'.`);
  }

  let baseRate = 0;
  if (safeInput.contractType === 'FM_ONLY') baseRate = assetClass.maintenanceRange.min;
  else if (safeInput.contractType === 'PM_ONLY') baseRate = ((safeInput.annualRent || 100000) * assetClass.managementRange.min) / 100;
  else baseRate = assetClass.combinedRange.min;

  let baseQuote = baseRate;
  if (assetClass.pricingUnit === 'sqft' && safeInput.sqft) {
    baseQuote = baseRate * safeInput.sqft;
    pricingExplanation.push(`Base rate of ${baseRate} AED/sqft applied to ${safeInput.sqft} sqft.`);
  } else if (assetClass.pricingUnit === 'unit' && safeInput.units) {
    baseQuote = baseRate * safeInput.units;
    pricingExplanation.push(`Base rate of ${baseRate} AED/unit applied to ${safeInput.units} units.`);
  } else if (assetClass.pricingUnit === 'bed' && safeInput.beds) {
    baseQuote = baseRate * safeInput.beds;
    pricingExplanation.push(`Base rate of ${baseRate} AED/bed applied to ${safeInput.beds} beds.`);
  } else {
    riskFlags.push('Missing Pricing Driver');
    pricingExplanation.push('Missing pricing driver was safely handled; minimum annual contract threshold applied.');
  }

  if (baseQuote < assetClass.minimumAnnualContract) {
    baseQuote = assetClass.minimumAnnualContract;
    pricingExplanation.push(`Minimum annual contract threshold of ${assetClass.minimumAnnualContract} AED applied.`);
  }

  const zoneEntry = UAE_PRICING_MATRIX_2026.zones[safeInput.zone] || UAE_PRICING_MATRIX_2026.zones.B || { multiplier: 1 };
  const zoneMultiplier = finiteNumber(zoneEntry.multiplier, 1);
  const zoneAdjustedQuote = baseQuote * zoneMultiplier;
  if (zoneMultiplier !== 1) pricingExplanation.push(`Strategic location premium applied for Zone ${safeInput.zone}.`);

  const normalizedEmirate = safeInput.emirate.toLowerCase();
  const emirateEntry = UAE_PRICING_MATRIX_2026.emirateMultipliers.find((entry) => entry.label.toLowerCase().includes(normalizedEmirate));
  const emirateMultiplier = emirateEntry ? finiteNumber(emirateEntry.value, 1) : 1;
  const emirateAdjustedQuote = zoneAdjustedQuote * emirateMultiplier;
  if (emirateMultiplier !== 1) pricingExplanation.push(`Regional operational cost adjustment for ${safeInput.emirate} (${emirateMultiplier}x) applied.`);

  const ageMultiplier = safeInput.propertyAge > 20 ? 1.25 : safeInput.propertyAge > 10 ? 1.15 : safeInput.propertyAge > 5 ? 1.08 : 1;
  if (ageMultiplier > 1) pricingExplanation.push(`Structural maintenance adjustment applied for ${safeInput.propertyAge}-year asset age.`);

  let complexityPremiumPercent = 0;
  if ((safeInput.floors || 0) >= 40) complexityPremiumPercent += 15;
  else if ((safeInput.floors || 0) >= 15) complexityPremiumPercent += 8;
  if ((safeInput.lifts || 0) > 10) complexityPremiumPercent += 10;
  else if ((safeInput.lifts || 0) > 4) complexityPremiumPercent += 5;
  if (safeInput.hasCentralHVAC) complexityPremiumPercent += 5;
  if (safeInput.hasDistrictCooling) complexityPremiumPercent -= 5;
  if (safeInput.hasGenerator) complexityPremiumPercent += 4;
  if (safeInput.hasBmu) complexityPremiumPercent += 6;
  if (safeInput.hasCivilDefenseSystem) complexityPremiumPercent += 5;
  if (['hosp', 'data-ctr'].includes(normalizedAssetClassId)) {
    complexityPremiumPercent += 20;
    riskFlags.push('Critical Systems Coverage Required');
  }

  const complexityPremium = emirateAdjustedQuote * (complexityPremiumPercent / 100);
  if (complexityPremiumPercent !== 0) pricingExplanation.push('Institutional technical complexity and compliance premium included.');

  const appliedSlaMultiplier = slaMultiplier(safeInput.slaTier);
  if (appliedSlaMultiplier > 1) pricingExplanation.push(`${safeInput.slaTier.toUpperCase()} Performance Service Level Agreement applied.`);

  const mergedAddOns = Array.from(new Set([...(safeInput.addOns || []), ...resolveMandatoryAddOns(safeInput)]));
  const addOnTotal = calculateAddOnAnnualValue(mergedAddOns, safeInput);
  const subtotal = (emirateAdjustedQuote * ageMultiplier * appliedSlaMultiplier) + complexityPremium + addOnTotal;
  const annualTotal = subtotal * (1 + planSurcharge(safeInput.paymentPlan));
  addPaymentExplanation(safeInput.paymentPlan, pricingExplanation);

  return {
    baseQuote,
    zoneAdjustedQuote,
    emirateAdjustedQuote,
    complexityPremium,
    compliancePremium: 0,
    addOnTotal,
    discount: 0,
    annualTotal,
    quarterlyPayment: annualTotal / 4,
    monthlyPayment: annualTotal / 12,
    mobilizationFee: annualTotal * 0.15,
    recommendedTier: safeInput.slaTier,
    pricingExplanation,
    riskFlags,
  };
}
