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
  wuduAreas?: number;
  assetLabel?: string;
}

export interface QuoteLineItem {
  label: string;
  amount: number;
}

export interface AppliedAddOn {
  id: string;
  label: string;
  annualValue: number;
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
  mandatoryAddOns: string[];
  appliedAddOns: AppliedAddOn[];
  includedServices: string[];
  excludedServices: string[];
  contractClauses: string[];
  assetSpecificScope: string[];
  approvalRules: string[];
  serviceSchedule: string[];
  pricingBreakdown: QuoteLineItem[];
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
  standard_apartment: 'apt-std', apartment: 'apt-std', residential: 'apt-std',
  luxury_apartment: 'apt-lux', standard_villa: 'villa-std', villa: 'villa-std', luxury_estate_villa: 'villa-lux',
  residential_building: 'apt-std', 'residential building': 'apt-std', commercial_building: 'com-twr', 'commercial building': 'com-twr', commercial_tower: 'com-twr',
  small_office: 'off-sml', office: 'off-sml', retail_mall: 'rtl-mall', mall: 'rtl-mall', retail_center: 'rtl-mall', 'retail center': 'rtl-mall',
  labor_camp: 'lab-camp', labour_camp: 'lab-camp', 'labour camp': 'lab-camp', staff_accommodation: 'staff_acc', 'staff accommodation': 'staff_acc',
  hospital: 'hosp', clinic: 'hosp', large_hospital: 'hosp', primary_clinic: 'hosp', data_center: 'data-ctr',
  mixed_use: 'mix-dev', mixed_use_development: 'mix-dev', mixed_use_tower: 'mix-dev', 'mixed-use tower': 'mix-dev', skyscraper: 'skyscraper',
  hotel: 'mid_scale_hotel', resort: 'mid_scale_hotel', mid_scale_hotel: 'mid_scale_hotel',
  school: 'school', university: 'university', campus: 'university', warehouse: 'warehouse', industrial: 'industrial_site', industrial_site: 'industrial_site', 'industrial property': 'industrial_site',
  government_property: 'government_property', 'government property': 'government_property', government_majlis: 'government_majlis', private_majlis: 'private_majlis', majlis: 'government_majlis',
  mosque: 'mosque_fm', masjid: 'mosque_fm', mosque_fm: 'mosque_fm', religious_facility: 'mosque_fm', 'mosque / masjid': 'mosque_fm',
  stadium: 'stadium', sports_complex: 'sports_complex', 'sports complex': 'sports_complex', event_venue: 'event_venue', 'event venue': 'event_venue', farm_estate: 'farm_estate', 'farm / estate': 'farm_estate', farm: 'farm_estate', estate: 'farm_estate'
};

type InternalAssetClass = {
  id: string;
  category: string;
  label: string;
  minimumAnnualContract: number;
  pricingUnit: string;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  maintenanceRange: { min: number; max: number; target?: number };
  managementRange: { min: number; max: number; target?: number };
  combinedRange: { min: number; max: number; target?: number };
};

const INTERNAL_ASSET_CLASSES: InternalAssetClass[] = [
  { id: 'school', category: 'Education', label: 'School', minimumAnnualContract: 45000, pricingUnit: 'sqft', riskLevel: 'High', maintenanceRange: { min: 10, max: 22, target: 15 }, managementRange: { min: 4, max: 7, target: 5 }, combinedRange: { min: 18, max: 32, target: 24 } },
  { id: 'university', category: 'Education', label: 'University / Campus', minimumAnnualContract: 90000, pricingUnit: 'sqft', riskLevel: 'High', maintenanceRange: { min: 14, max: 28, target: 20 }, managementRange: { min: 4, max: 7, target: 5 }, combinedRange: { min: 24, max: 42, target: 32 } },
  { id: 'warehouse', category: 'Industrial', label: 'Warehouse', minimumAnnualContract: 25000, pricingUnit: 'sqft', riskLevel: 'Medium', maintenanceRange: { min: 4, max: 10, target: 7 }, managementRange: { min: 3, max: 5, target: 4 }, combinedRange: { min: 8, max: 16, target: 12 } },
  { id: 'industrial_site', category: 'Industrial', label: 'Industrial Site', minimumAnnualContract: 50000, pricingUnit: 'sqft', riskLevel: 'High', maintenanceRange: { min: 7, max: 18, target: 12 }, managementRange: { min: 3, max: 6, target: 4 }, combinedRange: { min: 13, max: 28, target: 20 } },
  { id: 'staff_acc', category: 'Accommodation', label: 'Staff Accommodation', minimumAnnualContract: 30000, pricingUnit: 'bed', riskLevel: 'Medium', maintenanceRange: { min: 55, max: 95, target: 75 }, managementRange: { min: 5, max: 9, target: 6 }, combinedRange: { min: 95, max: 145, target: 115 } },
  { id: 'government_property', category: 'Government', label: 'Government Property', minimumAnnualContract: 65000, pricingUnit: 'sqft', riskLevel: 'High', maintenanceRange: { min: 13, max: 28, target: 18 }, managementRange: { min: 4, max: 6, target: 5 }, combinedRange: { min: 22, max: 40, target: 30 } },
  { id: 'skyscraper', category: 'Tower', label: 'Skyscraper', minimumAnnualContract: 150000, pricingUnit: 'sqft', riskLevel: 'Critical', maintenanceRange: { min: 16, max: 34, target: 24 }, managementRange: { min: 4, max: 6, target: 5 }, combinedRange: { min: 30, max: 55, target: 42 } },
  { id: 'stadium', category: 'Event', label: 'Stadium', minimumAnnualContract: 175000, pricingUnit: 'sqft', riskLevel: 'Critical', maintenanceRange: { min: 12, max: 30, target: 20 }, managementRange: { min: 5, max: 8, target: 6 }, combinedRange: { min: 24, max: 48, target: 35 } },
  { id: 'sports_complex', category: 'Event', label: 'Sports Complex', minimumAnnualContract: 85000, pricingUnit: 'sqft', riskLevel: 'High', maintenanceRange: { min: 10, max: 24, target: 16 }, managementRange: { min: 5, max: 8, target: 6 }, combinedRange: { min: 20, max: 38, target: 28 } },
  { id: 'event_venue', category: 'Event', label: 'Event Venue', minimumAnnualContract: 60000, pricingUnit: 'sqft', riskLevel: 'High', maintenanceRange: { min: 10, max: 22, target: 15 }, managementRange: { min: 5, max: 8, target: 6 }, combinedRange: { min: 18, max: 35, target: 25 } },
  { id: 'farm_estate', category: 'Estate', label: 'Farm / Estate', minimumAnnualContract: 35000, pricingUnit: 'sqft', riskLevel: 'Medium', maintenanceRange: { min: 3, max: 9, target: 6 }, managementRange: { min: 4, max: 7, target: 5 }, combinedRange: { min: 8, max: 18, target: 12 } },
];

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
  return ASSET_CLASS_ALIASES[raw] || ASSET_CLASS_ALIASES[raw.toLowerCase()] || raw;
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
    assetLabel: raw.assetLabel,
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
    wuduAreas: positiveNumber(raw.wuduAreas),
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
  const isAccommodation = ['lab-camp', 'staff_acc'].includes(normalizedAsset);
  const isEvent = ['stadium', 'sports_complex', 'event_venue'].includes(normalizedAsset);

  if (isMosque) ['water_tank', 'hvac_pm', 'cleaning', 'sira_renewal', 'emergency_priority'].forEach((id) => ids.add(id));
  if (['school', 'university', 'hosp', 'government_property'].includes(normalizedAsset)) ['hvac_pm', 'water_tank', 'sira_renewal'].forEach((id) => ids.add(id));
  if (['mid_scale_hotel', 'rtl-mall'].includes(normalizedAsset)) ['hvac_pm', 'water_tank', 'pest_control', 'sira_renewal'].forEach((id) => ids.add(id));
  if (['warehouse', 'industrial_site'].includes(normalizedAsset)) ['mep_support', 'generator'].forEach((id) => ids.add(id));
  if (isAccommodation) ['water_tank', 'pest_control', 'waste_management'].forEach((id) => ids.add(id));
  if (isEvent) ['technician_standby', 'cleaning', 'sira_renewal'].forEach((id) => ids.add(id));
  if (normalizedAsset === 'farm_estate') ['landscaping', 'mep_support'].forEach((id) => ids.add(id));
  if (safeInput.hasWaterTank) ids.add('water_tank');
  if (!isMajlis && ((safeInput.floors || 0) > 1 || (safeInput.lifts || 0) > 0)) ids.add('elevator_amc');
  if (safeInput.hasSiraCctv) ids.add('sira_renewal');
  if (safeInput.hasBmu) ids.add('facade_access');
  if (safeInput.propertyAge > 15) ids.add('pca_audit');
  if (safeInput.hasPool) ids.add('pool_care');
  if (safeInput.hasCentralHVAC || (safeInput.hvacCount || 0) > 0) ids.add('hvac_pm');
  return Array.from(ids);
}

export function calculateAddOnAnnualValue(addOns: string[] | undefined, property: { units?: number; floors?: number; offices?: number; shops?: number }): number {
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

function buildAppliedAddOns(addOns: string[], property: { units?: number; floors?: number; offices?: number; shops?: number }): AppliedAddOn[] {
  return Array.from(new Set(addOns)).map((id) => {
    const canonicalId = id === 'façade_access' ? 'facade_access' : id;
    const item = ADD_ON_PRICING[canonicalId];
    if (!item) return null;
    let annualValue = item.base;
    if (item.perUnit) annualValue += item.perUnit * Math.max(property.units || 0, property.offices || 0, property.shops || 0, 1);
    if (item.perFloor) annualValue += item.perFloor * Math.max(property.floors || 0, 1);
    return { id: canonicalId, label: item.label, annualValue: Math.round(annualValue) };
  }).filter(Boolean) as AppliedAddOn[];
}

function resolveAssetScope(assetId: string, input: QuoteInput) {
  const contractServices = input.contractType === 'PM_ONLY'
    ? ['Tenant / occupant coordination', 'Owner reporting and document follow-up', 'Complaint management and admin visibility']
    : input.contractType === 'BOTH'
      ? ['Preventive maintenance calendar', 'Reactive maintenance workflow', 'Technician dispatch and SLA tracking', 'Owner reporting and tenant / reporter coordination', 'Before/after completion proof']
      : ['Preventive maintenance calendar', 'Reactive maintenance workflow', 'Technician dispatch and SLA tracking', 'Before/after completion proof'];

  const baseExcluded = input.contractType === 'PM_ONLY'
    ? ['Physical repairs and technical labour unless separately approved', 'Parts, materials and contractor invoices', 'Emergency maintenance outside written approval']
    : ['Repairs above AED 1,000 without owner approval', 'Major replacement works and capex upgrades', 'Authority fees, fines and third-party invoices unless quoted', 'Civil renovation, fit-out and design works unless separately contracted'];

  const commonClauses = [
    'Owner approval is required before executing work above AED 1,000.',
    'Photo/video evidence and completion notes are required before closure.',
    'VAT, authority fees, third-party charges and out-of-scope materials are excluded unless listed in the approved quotation.',
  ];

  const scopeByAsset: Record<string, string[]> = {
    mosque_fm: ['Prayer-time-safe scheduling', '5x daily Wudu area cleaning cycle', 'Ramadan surge readiness plan', 'Awqaf/IACAD/ADMCC reporting support', 'CCTV 30-day storage and donation-box coverage review'],
    mid_scale_hotel: ['Guest-room MEP support', 'Back-of-house, kitchen/laundry coordination', 'Pool/spa/gym systems where selected', 'Guest-impact response protocol', 'Monthly guest-area readiness report'],
    school: ['Classroom, clinic, canteen and common-area support', 'Child-safety maintenance scheduling', 'Holiday shutdown PPM planning', 'Playground and water-tank inspection where selected', 'Authority-ready maintenance records'],
    university: ['Campus block maintenance coordination', 'Laboratory/common-area readiness where selected', 'High-footfall restroom and MEP support', 'Shutdown-period PPM planning', 'Campus reporting pack'],
    warehouse: ['Loading bay and shutter-door maintenance visibility', 'Fire pump / alarm readiness where selected', 'Forklift-route safety observations', 'Industrial MEP response', 'Monthly operational risk report'],
    industrial_site: ['Industrial MEP and backup-power readiness', 'Fire and safety system inspection trail', 'Critical downtime escalation', 'Loading/service-yard observations', 'Compliance-ready maintenance records'],
    staff_acc: ['Room/bed maintenance workflow', 'Shared kitchen, toilet and laundry support', 'Water tank, pest and waste hygiene schedule', 'High-occupancy complaint routing', 'Monthly accommodation condition report'],
    'lab-camp': ['Bed/block maintenance workflow', 'Shared toilet, kitchen and laundry support', 'Water tank, pest and waste hygiene schedule', 'High-occupancy complaint routing', 'Monthly camp condition report'],
    government_property: ['Sovereign access protocol', 'Visitor/public area readiness', 'Authority-facing report pack', 'Enhanced evidence and approval trail', 'Priority escalation path'],
    government_majlis: ['Majlis guest-readiness checks', 'VIP/event standby option', 'AC continuity and MEP rapid response', 'Landscape/exterior wash where selected', 'Protocol-sensitive scheduling'],
    private_majlis: ['Majlis guest-readiness checks', 'Pre-event inspection option', 'AC continuity and MEP rapid response', 'Landscape/exterior wash where selected', 'Protocol-sensitive scheduling'],
    skyscraper: ['High-rise MEP and lift coordination', 'BMU/facade access tracking where selected', 'Life-safety system readiness', 'Vertical asset SLA escalation', 'Monthly tower health report'],
    stadium: ['Event-mode standby readiness', 'Crowd-facing restroom and MEP support', 'Pre/post-event inspection workflow', 'Public safety evidence trail', 'Event incident reporting'],
    sports_complex: ['Court/field common-area readiness', 'Pool/gym systems where selected', 'Event and tournament response planning', 'Public restroom MEP support', 'Monthly facility condition report'],
    event_venue: ['Pre/post-event inspection workflow', 'Technician standby option', 'Crowd-facing cleaning and MEP support', 'Event incident reporting', 'Owner approval trail for event variations'],
    farm_estate: ['Irrigation and pump readiness where selected', 'Landscape and external lighting support', 'Estate utility inspection route', 'Staff/service area maintenance workflow', 'Monthly estate condition report'],
  };

  const assetSpecificScope = scopeByAsset[assetId] || ['Asset-specific PPM scope based on selected systems', 'Owner-visible service history and evidence trail', 'Monthly operational condition summary'];
  return {
    includedServices: [...contractServices, ...assetSpecificScope],
    excludedServices: baseExcluded,
    contractClauses: [...commonClauses, ...assetSpecificScope.map((item) => `Selected asset scope: ${item}.`)],
    assetSpecificScope,
    approvalRules: ['AED 1,000 owner approval threshold', 'Emergency containment can proceed only to protect life, property or utility continuity', 'All variations require written approval before billing'],
    serviceSchedule: input.slaTier === 'elite'
      ? ['Monthly PPM / readiness inspection', 'Priority emergency escalation', 'Monthly owner report']
      : input.slaTier === 'premium'
        ? ['Quarterly PPM inspection', 'Priority response queue', 'Quarterly owner report']
        : ['2x annual PPM inspection', 'Standard response queue', 'Service completion report'],
  };
}

function enrichOutput(base: Omit<QuoteOutput, 'includedServices' | 'excludedServices' | 'contractClauses' | 'assetSpecificScope' | 'approvalRules' | 'serviceSchedule' | 'mandatoryAddOns' | 'appliedAddOns' | 'pricingBreakdown'> & { mandatoryAddOns: string[]; pricingBreakdown: QuoteLineItem[] }, input: QuoteInput): QuoteOutput {
  const scope = resolveAssetScope(normalizeAssetClassId(input.assetClassId), input);
  const appliedAddOns = buildAppliedAddOns(base.mandatoryAddOns, input);
  return {
    ...base,
    annualTotal: Math.round(base.annualTotal * 100) / 100,
    quarterlyPayment: Math.round(base.quarterlyPayment * 100) / 100,
    monthlyPayment: Math.round(base.monthlyPayment * 100) / 100,
    mobilizationFee: Math.round(base.mobilizationFee * 100) / 100,
    appliedAddOns,
    ...scope,
  };
}

function calculateMosqueQuote(input: QuoteInput): QuoteOutput {
  const safeInput = sanitizeQuoteInput(input);
  const pricingExplanation: string[] = [];
  const riskFlags: string[] = [];
  const sqft = Math.max(safeInput.sqft || 0, 1000);
  const age = safeInput.propertyAge || 0;
  const worshipperCapacity = Math.max(safeInput.units || 300, 1);
  const wuduAreas = Math.max(safeInput.wuduAreas || 1, 1);
  const mepRate = safeInput.contractType === 'FM_ONLY' ? 20 : safeInput.contractType === 'BOTH' ? 38 : 30;
  const ageCoefficient = age <= 3 ? 1 : age <= 9 ? 1.18 : age <= 15 ? 1.35 : 1.55;
  const capacityMultiplier = worshipperCapacity <= 300 ? 1 : worshipperCapacity <= 1000 ? 1.15 : worshipperCapacity <= 3000 ? 1.35 : 1.6;
  const baseQuote = sqft * mepRate * ageCoefficient;
  const softServices = sqft * 8 * capacityMultiplier;
  const wuduCleaning = wuduAreas * 5 * 35 * 365;
  const ramadanSurge = 15500 + (safeInput.hasCentralHVAC ? 2500 : 0);
  const compliancePremium = Math.max(baseQuote * 0.04, 2500);
  const complexityPremium = (baseQuote + softServices) * 0.1;
  const mandatoryAddOns = Array.from(new Set([...(safeInput.addOns || []), ...resolveMandatoryAddOns(safeInput)]));
  const addOnTotal = calculateAddOnAnnualValue(mandatoryAddOns, safeInput);
  const subtotal = baseQuote + softServices + wuduCleaning + ramadanSurge + compliancePremium + complexityPremium + addOnTotal;
  const annualTotal = subtotal * slaMultiplier(safeInput.slaTier) * (1 + planSurcharge(safeInput.paymentPlan));

  pricingExplanation.push(`${mepRate} AED/sqft mosque MEP rate applied to ${sqft} sqft.`);
  pricingExplanation.push(`${ageCoefficient}x mosque age/risk coefficient applied.`);
  pricingExplanation.push(`Wudu cleaning priced by ${wuduAreas} Wudu area(s) x 5 daily cycles, not by worshipper headcount.`);
  pricingExplanation.push('Prayer-time-safe mosque operating model included.');
  addPaymentExplanation(safeInput.paymentPlan, pricingExplanation);
  if (age > 10) riskFlags.push('Aging mosque MEP risk premium required');
  if (!safeInput.hasSiraCctv) riskFlags.push('Mosque security/compliance review required');

  return enrichOutput({
    baseQuote, zoneAdjustedQuote: baseQuote, emirateAdjustedQuote: baseQuote, complexityPremium, compliancePremium, addOnTotal, discount: 0,
    annualTotal, quarterlyPayment: annualTotal / 4, monthlyPayment: annualTotal / 12, mobilizationFee: annualTotal * 0.15,
    recommendedTier: safeInput.slaTier, pricingExplanation, riskFlags, mandatoryAddOns,
    pricingBreakdown: [
      { label: 'Mosque MEP base', amount: baseQuote },
      { label: 'Soft services / prayer-area support', amount: softServices },
      { label: 'Wudu cleaning cycles', amount: wuduCleaning },
      { label: 'Ramadan surge readiness', amount: ramadanSurge },
      { label: 'Compliance premium', amount: compliancePremium },
      { label: 'Complexity premium', amount: complexityPremium },
      { label: 'Mandatory systems/add-ons', amount: addOnTotal },
    ],
  }, safeInput);
}

function findAssetClass(assetId: string): InternalAssetClass {
  const fromMatrix = UAE_PRICING_MATRIX_2026.assetClasses.find((asset) => asset.id === assetId) as InternalAssetClass | undefined;
  const internal = INTERNAL_ASSET_CLASSES.find((asset) => asset.id === assetId);
  return fromMatrix || internal || INTERNAL_ASSET_CLASSES.find((asset) => asset.id === 'government_property')!;
}

export function calculateUaeQuote2026(input: Partial<QuoteInput> | null | undefined): QuoteOutput {
  const safeInput = sanitizeQuoteInput(input);
  const normalizedAssetClassId = normalizeAssetClassId(safeInput.assetClassId);
  if (normalizedAssetClassId === 'mosque_fm') return calculateMosqueQuote(safeInput);

  const assetClass = findAssetClass(normalizedAssetClassId);
  const pricingExplanation: string[] = [];
  const riskFlags: string[] = [];
  if (normalizedAssetClassId !== safeInput.assetClassId) pricingExplanation.push(`Asset class '${safeInput.assetClassId || 'blank'}' normalized to '${normalizedAssetClassId}'.`);
  if (!UAE_PRICING_MATRIX_2026.assetClasses.find((asset) => asset.id === normalizedAssetClassId) && !INTERNAL_ASSET_CLASSES.find((asset) => asset.id === normalizedAssetClassId)) riskFlags.push('Asset Class Review Required');

  let baseRate = 0;
  if (safeInput.contractType === 'FM_ONLY') baseRate = assetClass.maintenanceRange.min;
  else if (safeInput.contractType === 'PM_ONLY') baseRate = ((safeInput.annualRent || 100000) * assetClass.managementRange.min) / 100;
  else baseRate = assetClass.combinedRange.min;

  let baseQuote = baseRate;
  if (safeInput.contractType === 'PM_ONLY') {
    pricingExplanation.push(`Property management rate applied to annual rent / admin benchmark.`);
  } else if (assetClass.pricingUnit === 'sqft' && safeInput.sqft) {
    baseQuote = baseRate * safeInput.sqft;
    pricingExplanation.push(`Base rate of ${baseRate} AED/sqft applied to ${safeInput.sqft} sqft.`);
  } else if (assetClass.pricingUnit === 'unit' && safeInput.units) {
    baseQuote = baseRate * safeInput.units;
    pricingExplanation.push(`Base rate of ${baseRate} AED/unit applied to ${safeInput.units} units.`);
  } else if (assetClass.pricingUnit === 'bed' && (safeInput.beds || safeInput.units)) {
    const beds = safeInput.beds || safeInput.units || 1;
    baseQuote = baseRate * beds;
    pricingExplanation.push(`Base rate of ${baseRate} AED/bed applied to ${beds} beds.`);
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
  if (['hosp', 'data-ctr', 'school', 'university', 'stadium', 'skyscraper', 'government_property'].includes(normalizedAssetClassId)) {
    complexityPremiumPercent += 15;
    riskFlags.push('Critical / institutional systems coverage required');
  }
  const complexityPremium = emirateAdjustedQuote * (complexityPremiumPercent / 100);
  if (complexityPremiumPercent !== 0) pricingExplanation.push('Institutional technical complexity and compliance premium included.');
  const appliedSlaMultiplier = slaMultiplier(safeInput.slaTier);
  if (appliedSlaMultiplier > 1) pricingExplanation.push(`${safeInput.slaTier.toUpperCase()} Performance Service Level Agreement applied.`);
  const mandatoryAddOns = Array.from(new Set([...(safeInput.addOns || []), ...resolveMandatoryAddOns(safeInput)]));
  const addOnTotal = calculateAddOnAnnualValue(mandatoryAddOns, safeInput);
  const subtotal = (emirateAdjustedQuote * ageMultiplier * appliedSlaMultiplier) + complexityPremium + addOnTotal;
  const annualTotal = subtotal * (1 + planSurcharge(safeInput.paymentPlan));
  addPaymentExplanation(safeInput.paymentPlan, pricingExplanation);

  return enrichOutput({
    baseQuote, zoneAdjustedQuote, emirateAdjustedQuote, complexityPremium, compliancePremium: 0, addOnTotal, discount: 0,
    annualTotal, quarterlyPayment: annualTotal / 4, monthlyPayment: annualTotal / 12, mobilizationFee: annualTotal * 0.15,
    recommendedTier: safeInput.slaTier, pricingExplanation, riskFlags, mandatoryAddOns,
    pricingBreakdown: [
      { label: `${assetClass.label} base`, amount: baseQuote },
      { label: 'Zone adjustment', amount: zoneAdjustedQuote - baseQuote },
      { label: 'Emirate adjustment', amount: emirateAdjustedQuote - zoneAdjustedQuote },
      { label: 'Complexity premium', amount: complexityPremium },
      { label: 'Mandatory systems/add-ons', amount: addOnTotal },
    ],
  }, safeInput);
}
