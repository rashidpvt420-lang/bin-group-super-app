import { UAE_PRICING_MATRIX_2026 } from './uaePricingMatrix2026';

export interface QuoteInput {
  assetClassId: string;
  emirate: string; // dubai, abuDhabi, sharjah, etc.
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
  // Additional scaling parameters
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
  fire_safety: { label: 'Fire Safety System Maintenance', base: 2500, perFloor: 150 },
  water_tank: { label: 'Water Tank Cleaning', base: 1200 },
  elevator_amc: { label: 'Elevator Maintenance', base: 3200, perUnit: 650 },
  pool_care: { label: 'Swimming Pool Maintenance', base: 6000 },
  facade_access: { label: 'Facade/BMU Access', base: 4500, perFloor: 75 },
  'façade_access': { label: 'Facade/BMU Access', base: 4500, perFloor: 75 },
  dist_cooling: { label: 'District Cooling Optimization', base: 3500 },
  sira_renewal: { label: 'CCTV/SIRA Maintenance', base: 1800, perUnit: 35 },
  grease_trap: { label: 'Grease Trap Service', base: 900 },
  pca_audit: { label: 'PCA Asset Audit', base: 5000 },
  majlis_deep_care: { label: 'Majlis Deep Care', base: 8400 },
  majlis_landscaping: { label: 'Landscaping', base: 6000 },
  majlis_exterior_wash: { label: 'Exterior Wash', base: 2800 },
  majlis_standby: { label: 'Event Standby', base: 2500 },
  security: { label: 'Security', base: 12000, perUnit: 450 },
  cleaning: { label: 'Cleaning', base: 9000, perUnit: 300 },
  manpower: { label: 'Manpower', base: 15000, perUnit: 250 },
  concierge: { label: 'Concierge', base: 18000, perUnit: 350 },
  landscaping: { label: 'Landscaping', base: 4000 },
  pest_control: { label: 'Pest Control', base: 1500, perUnit: 50 },
  generator: { label: 'Generator Maintenance', base: 3500 },
  cctv: { label: 'CCTV', base: 1800, perUnit: 35 },
  office_units: { label: 'Office Units Support', base: 2500, perUnit: 225 },
  retail_shops: { label: 'Retail Shops Support', base: 3000, perUnit: 275 },
  parking_management: { label: 'Parking Management', base: 6000, perUnit: 35 },
  waste_management: { label: 'Waste Management', base: 3500, perUnit: 75 },
  mep_support: { label: 'MEP Support', base: 8500, perFloor: 300 },
  hvac_pm: { label: 'HVAC Preventive Maintenance', base: 4500, perUnit: 120 },
  move_in_out_inspection: { label: 'Move-in/Move-out Inspection', base: 800 },
  fit_out_quotation: { label: 'Fit-out Quotation', base: 0 },
  emergency_priority: { label: 'Emergency Priority SOS', base: 1200 }
};

export function resolveMandatoryAddOns(input: QuoteInput): string[] {
  const ids = new Set<string>();
  ids.add('fire_safety');
  
  const isMosque = input.assetClassId === 'mosque_fm' || input.assetClassId === 'mosque';
  if (isMosque) {
    ids.add('water_tank');
    ids.add('hvac_pm');
    ids.add('cleaning');
    ids.add('sira_renewal');
    ids.add('emergency_priority');
  }
  if (input.hasWaterTank) ids.add('water_tank');
  if ((input.floors || 0) > 2 || (input.lifts || 0) > 0) ids.add('elevator_amc');
  if (input.hasSiraCctv) ids.add('sira_renewal');
  if (input.hasBmu) ids.add('facade_access');
  if (input.propertyAge > 15) ids.add('pca_audit');
  if (input.hasPool) ids.add('pool_care');
  if (input.hasCentralHVAC || (input.hvacCount || 0) > 0) ids.add('hvac_pm');
  
  return Array.from(ids);
}

export function calculateAddOnAnnualValue(
  addOns: string[] | undefined,
  property: { units?: number; floors?: number; offices?: number; shops?: number }
): number {
  if (!addOns || addOns.length === 0) return 0;
  const ids = new Set(addOns);
  let total = 0;
  ids.forEach((id) => {
    const canonicalId = id === 'façade_access' ? 'facade_access' : id;
    const item = ADD_ON_PRICING[canonicalId];
    if (!item) return;
    total += item.base;
    if (item.perUnit) {
      total += item.perUnit * Math.max(property.units || 0, property.offices || 0, property.shops || 0, 1);
    }
    if (item.perFloor) {
      total += item.perFloor * Math.max(property.floors || 0, 1);
    }
  });
  return Math.round(total);
}

const ASSET_CLASS_ALIASES: Record<string, string> = {
  standard_apartment: 'apt-std',
  luxury_apartment: 'apt-lux',
  standard_villa: 'villa-std',
  luxury_estate_villa: 'villa-lux',
  commercial_tower: 'com-twr',
  small_office: 'off-sml',
  retail_mall: 'rtl-mall',
  mall: 'rtl-mall',
  labor_camp: 'lab-camp',
  labour_camp: 'lab-camp',
  hospital: 'hosp',
  clinic: 'hosp',
  large_hospital: 'hosp',
  primary_clinic: 'hosp',
  data_center: 'data-ctr',
  mixed_use: 'mix-dev',
  mixed_use_development: 'mix-dev',
  mixed_use_tower: 'mix-dev',
  hotel: 'mid_scale_hotel',
  mid_scale_hotel: 'mid_scale_hotel',
  government_majlis: 'government_majlis',
  private_majlis: 'private_majlis',
  majlis: 'government_majlis',
  mosque: 'mosque_fm',
  masjid: 'mosque_fm',
  mosque_fm: 'mosque_fm',
  religious_facility: 'mosque_fm',
  'mosque / masjid': 'mosque_fm'
};

function normalizeAssetClassId(assetClassId?: string): string {
  const raw = String(assetClassId || '').trim();
  if (!raw) return 'apt-std';
  return ASSET_CLASS_ALIASES[raw] || ASSET_CLASS_ALIASES[raw.toLowerCase()] || raw;
}

function calculateMosqueQuote(input: QuoteInput): QuoteOutput {
  const pricingExplanation: string[] = [];
  const riskFlags: string[] = [];
  const sqft = Math.max(input.sqft || 0, 1000);
  const age = input.propertyAge || 0;
  const worshipperProxy = Math.max(input.units || 1, 1);

  const mepRate = input.contractType === 'FM_ONLY' ? 20 : input.contractType === 'BOTH' ? 38 : 30;
  const ageCoefficient = age <= 3 ? 1 : age <= 9 ? 1.18 : age <= 15 ? 1.35 : 1.55;
  const capacityMultiplier = worshipperProxy <= 300 ? 1 : worshipperProxy <= 1000 ? 1.15 : worshipperProxy <= 3000 ? 1.35 : 1.6;

  const baseQuote = sqft * mepRate * ageCoefficient;
  const softServices = sqft * 8 * capacityMultiplier;
  const wuduCleaning = Math.max(input.units || 1, 1) * 5 * 35 * 365;
  const ramadanSurge = 15500 + (input.hasCentralHVAC ? 2500 : 0);
  const compliancePremium = Math.max(baseQuote * 0.04, 2500);
  const complexityPremium = (baseQuote + softServices) * 0.1;

  const mergedAddOns = Array.from(new Set([...(input.addOns || []), ...resolveMandatoryAddOns(input)]));
  const addOnTotal = calculateAddOnAnnualValue(mergedAddOns, input);

  let slaMultiplier = 1.0;
  if (input.slaTier === 'premium') slaMultiplier = 1.15;
  else if (input.slaTier === 'elite') slaMultiplier = 1.3;

  let paymentSurcharge = 0;
  if (input.paymentPlan === 'quarterly') paymentSurcharge = 0.03;
  else if (input.paymentPlan === 'monthly') paymentSurcharge = 0.06;

  const subtotal = (baseQuote + softServices + wuduCleaning + ramadanSurge + compliancePremium + complexityPremium + addOnTotal) * slaMultiplier;
  const annualTotal = subtotal * (1 + paymentSurcharge);

  pricingExplanation.push(`${mepRate} AED/sqft mosque MEP rate applied to ${sqft} sqft.`);
  pricingExplanation.push(`${ageCoefficient}x mosque age/risk coefficient applied.`);
  pricingExplanation.push('Five daily Wudu cleaning cycles included.');
  pricingExplanation.push('Ramadan surge cleaning and HVAC readiness included.');
  pricingExplanation.push('Prayer-time-safe scheduling and monthly compliance reporting included.');

  if (age > 10) riskFlags.push('Aging mosque MEP risk premium required');
  if (!input.hasSiraCctv) riskFlags.push('Mosque security/compliance review required');
  if (input.slaTier === 'elite') riskFlags.push('Elite mosque response model selected');

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
    recommendedTier: input.slaTier,
    pricingExplanation,
    riskFlags
  };
}

export function calculateUaeQuote2026(input: QuoteInput): QuoteOutput {
  const normalizedAssetClassId = normalizeAssetClassId(input.assetClassId);

  if (normalizedAssetClassId === 'mosque_fm') {
    return calculateMosqueQuote(input);
  }

  let assetClass = UAE_PRICING_MATRIX_2026.assetClasses.find(a => a.id === normalizedAssetClassId);

  const pricingExplanation: string[] = [];
  const riskFlags: string[] = [];

  if (!assetClass) {
    assetClass = UAE_PRICING_MATRIX_2026.assetClasses.find(a => a.id === 'apt-std') || UAE_PRICING_MATRIX_2026.assetClasses[0];
    pricingExplanation.push(`Unknown asset class '${input.assetClassId}' was normalized to '${assetClass.id}'. Admin review required.`);
    riskFlags.push('Asset Class Review Required');
  } else if (normalizedAssetClassId !== input.assetClassId) {
    pricingExplanation.push(`Asset class '${input.assetClassId}' normalized to '${normalizedAssetClassId}'.`);
  }

  // 1. Base Quote Calculation
  let baseRate = 0;
  if (input.contractType === 'FM_ONLY') baseRate = assetClass.maintenanceRange.min;
  else if (input.contractType === 'PM_ONLY') {
      const rent = input.annualRent || 100000;
      baseRate = (rent * assetClass.managementRange.min) / 100;
  }
  else baseRate = assetClass.combinedRange.min;

  // Apply Units/Sqft/Beds scaling if applicable
  let baseQuote = baseRate;
  if (assetClass.pricingUnit === 'sqft' && input.sqft) {
      baseQuote = baseRate * input.sqft;
      pricingExplanation.push(`Base rate of ${baseRate} AED/sqft applied to ${input.sqft} sqft.`);
  } else if (assetClass.pricingUnit === 'unit' && input.units) {
      baseQuote = baseRate * input.units;
      pricingExplanation.push(`Base rate of ${baseRate} AED/unit applied to ${input.units} units.`);
  } else if (assetClass.pricingUnit === 'bed' && input.beds) {
      baseQuote = baseRate * input.beds;
      pricingExplanation.push(`Base rate of ${baseRate} AED/bed applied to ${input.beds} beds.`);
  }

  // Ensure Minimum Contract Value
  if (baseQuote < assetClass.minimumAnnualContract) {
      baseQuote = assetClass.minimumAnnualContract;
      pricingExplanation.push(`Minimum annual contract threshold of ${assetClass.minimumAnnualContract} AED applied.`);
  }

  // 2. Zone Adjustment
  const zoneMultiplier = (UAE_PRICING_MATRIX_2026.zones as any)[input.zone].multiplier;
  const zoneAdjustedQuote = baseQuote * zoneMultiplier;
  if (zoneMultiplier !== 1) {
      pricingExplanation.push(`Strategic location premium applied for Zone ${input.zone} positioning.`);
  }

  // 3. Emirate Adjustment
  const emirateEntry = UAE_PRICING_MATRIX_2026.emirateMultipliers.find(e => e.label.toLowerCase().includes(input.emirate.toLowerCase()));
  const emirateMultiplier = emirateEntry ? parseFloat(emirateEntry.value) : 1.0;
  const emirateAdjustedQuote = zoneAdjustedQuote * emirateMultiplier;
  if (emirateMultiplier !== 1) {
      pricingExplanation.push(`Regional operational cost adjustment for ${input.emirate} (${emirateMultiplier}x) applied.`);
  }

  // 4. Age Factor
  let ageMultiplier = 1.0;
  if (input.propertyAge > 20) ageMultiplier = 1.25;
  else if (input.propertyAge > 10) ageMultiplier = 1.15;
  else if (input.propertyAge > 5) ageMultiplier = 1.08;

  if (ageMultiplier > 1) {
      pricingExplanation.push(`Structural maintenance adjustment applied for ${input.propertyAge}-year asset age.`);
  }

  // 5. Complexity & Compliance Premiums
  let complexityPremiumPercent = 0;
  if ((input.floors || 0) >= 40) complexityPremiumPercent += 15;
  else if ((input.floors || 0) >= 15) complexityPremiumPercent += 8;

  if ((input.lifts || 0) > 10) complexityPremiumPercent += 10;
  else if ((input.lifts || 0) > 4) complexityPremiumPercent += 5;

  if (input.hasCentralHVAC) complexityPremiumPercent += 5;
  if (input.hasDistrictCooling) complexityPremiumPercent -= 5;
  if (input.hasGenerator) complexityPremiumPercent += 4;
  if (input.hasBmu) complexityPremiumPercent += 6;
  if (input.hasCivilDefenseSystem) complexityPremiumPercent += 5;

  if (['hosp', 'data-ctr'].includes(normalizedAssetClassId)) {
      complexityPremiumPercent += 20;
      riskFlags.push("Critical Systems Coverage Required");
  }

  const complexityPremium = emirateAdjustedQuote * (complexityPremiumPercent / 100);
  if (complexityPremiumPercent !== 0) {
      pricingExplanation.push(`Institutional technical complexity and compliance premium included.`);
  }

  // 6. SLA Tier
  let slaMultiplier = 1.0;
  if (input.slaTier === 'premium') slaMultiplier = 1.15;
  else if (input.slaTier === 'elite') slaMultiplier = 1.30;
  
  if (slaMultiplier > 1) {
      pricingExplanation.push(`${input.slaTier.toUpperCase()} Performance Service Level Agreement applied.`);
  }

  // 7. Add-ons
  const mergedAddOns = Array.from(new Set([...(input.addOns || []), ...resolveMandatoryAddOns(input)]));
  const addOnTotal = calculateAddOnAnnualValue(mergedAddOns, input);

  // 8. Calculations
  const subtotal = (emirateAdjustedQuote * ageMultiplier * slaMultiplier) + complexityPremium + addOnTotal;

  // 9. Payment Plan Surcharge
  let paymentSurcharge = 0;
  if (input.paymentPlan === 'quarterly') paymentSurcharge = 0.03;
  else if (input.paymentPlan === 'monthly') paymentSurcharge = 0.06;

  const annualTotal = subtotal * (1 + paymentSurcharge);
  if (paymentSurcharge > 0) {
      pricingExplanation.push(`${input.paymentPlan.toUpperCase()} installment facility fee applied.`);
  }

  return {
    baseQuote,
    zoneAdjustedQuote,
    emirateAdjustedQuote,
    complexityPremium,
    compliancePremium: 0, // Integrated in complexity for now
    addOnTotal,
    discount: 0,
    annualTotal,
    quarterlyPayment: annualTotal / 4,
    monthlyPayment: annualTotal / 12,
    mobilizationFee: annualTotal * 0.15,
    recommendedTier: input.slaTier,
    pricingExplanation,
    riskFlags
  };
}
