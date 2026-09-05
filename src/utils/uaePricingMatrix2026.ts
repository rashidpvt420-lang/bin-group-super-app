export interface RangeValue {
  min: number;
  max: number;
  target?: number;
}

export interface AssetClassBenchmark {
  id: string;
  category: string;
  label: string;
  minimumAnnualContract: number;
  pmRate: string;
  ifm: string;
  pricingUnit: 'facility' | 'unit' | 'sqft' | 'bed' | string;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  maintenanceRange: RangeValue;
  managementRange: RangeValue;
  combinedRange: RangeValue;
}

export interface EmirateMultiplier {
  label: string;
  value: string;
  isPremium: boolean;
}

export const BIN_CONTRACT_TYPES = {
  FM_ONLY: 'Maintenance Only (IFM)',
  PM_ONLY: 'Property Management Only (Leasing/Financials)',
  BOTH: 'Total Care Hybrid (FM + PM)',
};

export interface MajlisPackage {
  id: string;
  label: string;
  basePrice: number;
  features: string[];
}

export const MAJLIS_MAINTENANCE_PACKAGES: MajlisPackage[] = [
  {
    id: 'majlis-basic', label: 'Majlis Basic Maintenance', basePrice: 12000,
    features: ['AC Maintenance', 'Electrical', 'Plumbing', 'Civil / Handyman'],
  },
  {
    id: 'majlis-premium', label: 'Majlis Premium Maintenance', basePrice: 25000,
    features: ['AC Maintenance', 'Electrical', 'Plumbing', 'Civil / Handyman', 'Cleaning Add-on', 'Pre-event Inspection'],
  },
  {
    id: 'majlis-elite', label: 'Majlis Elite / Standby Maintenance', basePrice: 45000,
    features: ['AC Maintenance', 'Electrical', 'Plumbing', 'Civil / Handyman', 'Cleaning Team', 'Event Standby Technician', 'Emergency Response (30 min)', 'Pre/Post-event Inspection', 'VIP Support'],
  },
];

export const SERVICE_ADDONS = [
  { id: 'tech_standby', label: 'Technician Standby', price: 1500, unit: 'per event' },
  { id: 'cleaning_team', label: 'Cleaning Team', price: 800, unit: 'per visit' },
  { id: 'security', label: 'Security', price: 2000, unit: 'per month' },
  { id: 'event_support', label: 'Event Support', price: 3000, unit: 'per event' },
  { id: 'deep_cleaning', label: 'Deep Cleaning', price: 1200, unit: 'per service' },
  { id: 'pest_control', label: 'Pest Control', price: 600, unit: 'per quarter' },
  { id: 'landscaping', label: 'Landscaping', price: 1500, unit: 'per month' },
  { id: 'cctv_security', label: 'CCTV/Security Systems', price: 5000, unit: 'one-time' },
  { id: 'fire_safety', label: 'Fire Safety', price: 2500, unit: 'annual' },
  { id: 'emergency_priority', label: 'Emergency Priority', price: 1000, unit: 'annual' },
  { id: 'fitout_quote', label: 'Fit-out Quotation', price: 0, unit: 'free' },
  { id: 'inspection_move', label: 'Move-in/Move-out Inspection', price: 500, unit: 'per unit' },
  { id: 'gym_equipment_pm', label: 'Fitness Equipment Preventive Maintenance', price: 0, unit: 'separate scope after asset register' },
  { id: 'gym_wet_area_care', label: 'Gym Wet / Recovery Area Specialist Care', price: 0, unit: 'separate scope after visit' },
  { id: 'gym_pool_operations', label: 'Gym Pool Operations / Specialist Scope', price: 0, unit: 'separate scope after visit' },
];

export interface PricingMatrix {
  version: string;
  lastUpdated: string;
  zones: Record<string, { label: string; description: string; multiplier: number }>;
  emirateMultipliers: EmirateMultiplier[];
  assetClasses: AssetClassBenchmark[];
}

/**
 * UAE pricing matrix used only for pre-visit estimates.
 * Complex sites remain subject to a BIN GROUP site survey and scope confirmation.
 * PM percentages are applied to verified annual rent/revenue by the quote engine and are never multiplied by area or unit counts.
 */
export const UAE_PRICING_MATRIX_2026: PricingMatrix = {
  version: '3.3.0',
  lastUpdated: '2026-09-05',
  zones: {
    A: { label: 'Premium', description: 'Luxury, waterfront, branded and higher-response assets', multiplier: 1.30 },
    B: { label: 'Standard', description: 'Standard urban operating conditions', multiplier: 1.00 },
    C: { label: 'Budget/Industrial', description: 'Industrial and lower-cost operating corridors', multiplier: 0.75 },
  },
  emirateMultipliers: [
    { label: 'Dubai', value: '1.15x', isPremium: true },
    { label: 'Abu Dhabi', value: '1.10x', isPremium: true },
    { label: 'Sharjah', value: '0.90x', isPremium: false },
    { label: 'RAK / Ajman / Fujairah / UAQ', value: '0.80x', isPremium: false },
  ],
  assetClasses: [
    {
      id: 'apt-std', category: 'Residential', label: 'Standard Apartment', minimumAnnualContract: 1500,
      pmRate: '5-8% annual rent', ifm: 'FM + PM', pricingUnit: 'unit', riskLevel: 'Low',
      maintenanceRange: { min: 1500, max: 4500, target: 2500 }, managementRange: { min: 5, max: 8, target: 6 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'apt-lux', category: 'Residential', label: 'Luxury Apartment', minimumAnnualContract: 4500,
      pmRate: '7-10% annual rent', ifm: 'FM + PM', pricingUnit: 'unit', riskLevel: 'Medium',
      maintenanceRange: { min: 4500, max: 12000, target: 6500 }, managementRange: { min: 7, max: 10, target: 8 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'villa-std', category: 'Residential', label: 'Standard Villa', minimumAnnualContract: 3500,
      pmRate: '5-8% annual rent', ifm: 'FM + PM', pricingUnit: 'unit', riskLevel: 'Medium',
      maintenanceRange: { min: 3500, max: 9000, target: 6000 }, managementRange: { min: 5, max: 8, target: 6 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'villa-lux', category: 'Residential', label: 'Luxury Estate Villa', minimumAnnualContract: 9000,
      pmRate: '7-10% annual rent', ifm: 'FM + PM', pricingUnit: 'unit', riskLevel: 'High',
      maintenanceRange: { min: 9000, max: 40000, target: 18000 }, managementRange: { min: 7, max: 10, target: 8 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'apt-sht', category: 'Residential', label: 'Short-Term Apartment', minimumAnnualContract: 2500,
      pmRate: '15-25% managed revenue', ifm: 'FM + short-term management', pricingUnit: 'unit', riskLevel: 'High',
      maintenanceRange: { min: 2500, max: 6500, target: 4000 }, managementRange: { min: 15, max: 25, target: 18 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'res-bldg', category: 'Residential', label: 'Residential Building', minimumAnnualContract: 25000,
      pmRate: '5-8% annual rent', ifm: 'FM + PM', pricingUnit: 'sqft', riskLevel: 'Medium',
      maintenanceRange: { min: 6, max: 12, target: 8 }, managementRange: { min: 5, max: 8, target: 6 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'off-sml', category: 'Commercial', label: 'Office', minimumAnnualContract: 5000,
      pmRate: '7-10% annual rent', ifm: 'FM + PM', pricingUnit: 'sqft', riskLevel: 'Low',
      maintenanceRange: { min: 8, max: 15, target: 10 }, managementRange: { min: 7, max: 10, target: 8 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    // BIN GROUP commercial configuration, not a statutory UAE tariff.
    // min / target / max map to STANDARD_DRY / ENHANCED / WET_RECOVERY gym complexity bands.
    {
      id: 'gym-fitness-centre', category: 'Commercial', label: 'Gym / Fitness Centre', minimumAnnualContract: 15000,
      pmRate: '7-10% annual rent / managed revenue when in scope', ifm: 'FM + PM / Sports & Wellness', pricingUnit: 'sqft', riskLevel: 'High',
      maintenanceRange: { min: 10, max: 18, target: 14 }, managementRange: { min: 7, max: 10, target: 8 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'com-twr', category: 'Commercial', label: 'Commercial Building / Tower', minimumAnnualContract: 50000,
      pmRate: '7-10% annual rent', ifm: 'FM + PM', pricingUnit: 'sqft', riskLevel: 'High',
      maintenanceRange: { min: 10, max: 18, target: 14 }, managementRange: { min: 7, max: 10, target: 8 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'retail-ctr', category: 'Retail', label: 'Retail Center', minimumAnnualContract: 30000,
      pmRate: '7-10% annual rent', ifm: 'FM + PM', pricingUnit: 'sqft', riskLevel: 'Medium',
      maintenanceRange: { min: 10, max: 18, target: 14 }, managementRange: { min: 7, max: 10, target: 8 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'rtl-mall', category: 'Retail', label: 'Retail Mall', minimumAnnualContract: 150000,
      pmRate: '6-10% annual rent', ifm: 'FM + PM', pricingUnit: 'sqft', riskLevel: 'Critical',
      maintenanceRange: { min: 15, max: 25, target: 20 }, managementRange: { min: 6, max: 10, target: 8 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'mid_scale_hotel', category: 'Hospitality', label: 'Hotel', minimumAnnualContract: 150000,
      pmRate: '7-10% managed revenue', ifm: 'FM + management', pricingUnit: 'sqft', riskLevel: 'High',
      maintenanceRange: { min: 12, max: 20, target: 16 }, managementRange: { min: 7, max: 10, target: 8 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'resort', category: 'Hospitality', label: 'Resort', minimumAnnualContract: 200000,
      pmRate: '8-12% managed revenue', ifm: 'FM + management', pricingUnit: 'sqft', riskLevel: 'Critical',
      maintenanceRange: { min: 14, max: 24, target: 18 }, managementRange: { min: 8, max: 12, target: 10 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'hosp', category: 'Healthcare', label: 'Hospital', minimumAnnualContract: 75000,
      pmRate: '5-8% managed revenue', ifm: 'FM + management', pricingUnit: 'sqft', riskLevel: 'Critical',
      maintenanceRange: { min: 18, max: 30, target: 24 }, managementRange: { min: 5, max: 8, target: 6 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'clinic', category: 'Healthcare', label: 'Clinic', minimumAnnualContract: 20000,
      pmRate: '5-8% managed revenue', ifm: 'FM + management', pricingUnit: 'sqft', riskLevel: 'High',
      maintenanceRange: { min: 10, max: 18, target: 14 }, managementRange: { min: 5, max: 8, target: 6 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'school', category: 'Education', label: 'School / Education Facility', minimumAnnualContract: 15000,
      pmRate: '5-8% managed revenue', ifm: 'FM + management', pricingUnit: 'sqft', riskLevel: 'Medium',
      maintenanceRange: { min: 6, max: 12, target: 9 }, managementRange: { min: 5, max: 8, target: 6 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'warehouse', category: 'Industrial', label: 'Warehouse', minimumAnnualContract: 15000,
      pmRate: '5-8% annual rent', ifm: 'FM + PM', pricingUnit: 'sqft', riskLevel: 'Medium',
      maintenanceRange: { min: 5, max: 9, target: 7 }, managementRange: { min: 5, max: 8, target: 6 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'industrial', category: 'Industrial', label: 'Industrial Property', minimumAnnualContract: 25000,
      pmRate: '5-8% annual rent', ifm: 'FM + PM', pricingUnit: 'sqft', riskLevel: 'High',
      maintenanceRange: { min: 6, max: 12, target: 9 }, managementRange: { min: 5, max: 8, target: 6 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'lab-camp', category: 'Accommodation', label: 'Labour Camp', minimumAnnualContract: 20000,
      pmRate: '5-8% annual rent', ifm: 'FM + PM', pricingUnit: 'bed', riskLevel: 'Medium',
      maintenanceRange: { min: 720, max: 1200, target: 960 }, managementRange: { min: 5, max: 8, target: 6 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'staff-accom', category: 'Accommodation', label: 'Staff Accommodation', minimumAnnualContract: 15000,
      pmRate: '5-8% annual rent', ifm: 'FM + PM', pricingUnit: 'bed', riskLevel: 'Medium',
      maintenanceRange: { min: 600, max: 1000, target: 800 }, managementRange: { min: 5, max: 8, target: 6 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'gov-facility', category: 'Government', label: 'Government Property / Facility', minimumAnnualContract: 50000,
      pmRate: '0%', ifm: 'FM', pricingUnit: 'sqft', riskLevel: 'High',
      maintenanceRange: { min: 10, max: 18, target: 14 }, managementRange: { min: 0, max: 0, target: 0 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'government_majlis', category: 'Government', label: 'Government Majlis', minimumAnnualContract: 25000,
      pmRate: 'N/A', ifm: '35,000 / yr target', pricingUnit: 'facility', riskLevel: 'High',
      maintenanceRange: { min: 25000, max: 60000, target: 35000 }, managementRange: { min: 0, max: 0, target: 0 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'private_majlis', category: 'Residential', label: 'Private Majlis', minimumAnnualContract: 12000,
      pmRate: 'N/A', ifm: '18,000 / yr target', pricingUnit: 'facility', riskLevel: 'Medium',
      maintenanceRange: { min: 12000, max: 35000, target: 18000 }, managementRange: { min: 0, max: 0, target: 0 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'mix-dev', category: 'Mixed Use', label: 'Mixed-Use Tower', minimumAnnualContract: 100000,
      pmRate: '5-8% annual rent/revenue', ifm: 'FM + PM', pricingUnit: 'sqft', riskLevel: 'High',
      maintenanceRange: { min: 12, max: 22, target: 16 }, managementRange: { min: 5, max: 8, target: 6 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'highrise', category: 'Tower', label: 'Skyscraper / High-Rise', minimumAnnualContract: 100000,
      pmRate: '5-8% annual rent/revenue', ifm: 'FM + PM', pricingUnit: 'sqft', riskLevel: 'Critical',
      maintenanceRange: { min: 12, max: 22, target: 17 }, managementRange: { min: 5, max: 8, target: 6 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'stadium', category: 'Event', label: 'Stadium', minimumAnnualContract: 150000,
      pmRate: 'N/A', ifm: 'FM / event operations', pricingUnit: 'sqft', riskLevel: 'Critical',
      maintenanceRange: { min: 10, max: 18, target: 14 }, managementRange: { min: 0, max: 0, target: 0 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'sports-complex', category: 'Event', label: 'Sports Complex', minimumAnnualContract: 75000,
      pmRate: 'N/A', ifm: 'FM / event operations', pricingUnit: 'sqft', riskLevel: 'High',
      maintenanceRange: { min: 8, max: 16, target: 12 }, managementRange: { min: 0, max: 0, target: 0 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'event-venue', category: 'Event', label: 'Event Venue', minimumAnnualContract: 60000,
      pmRate: 'N/A', ifm: 'FM / event operations', pricingUnit: 'sqft', riskLevel: 'High',
      maintenanceRange: { min: 8, max: 16, target: 12 }, managementRange: { min: 0, max: 0, target: 0 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'estate', category: 'Estate', label: 'Farm / Estate', minimumAnnualContract: 12000,
      pmRate: '5-8% annual rent/revenue', ifm: 'FM + PM', pricingUnit: 'facility', riskLevel: 'Medium',
      maintenanceRange: { min: 12000, max: 30000, target: 18000 }, managementRange: { min: 5, max: 8, target: 6 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
    {
      id: 'data-ctr', category: 'Specialized', label: 'Data Center', minimumAnnualContract: 250000,
      pmRate: '10-20% managed revenue', ifm: 'Critical FM', pricingUnit: 'sqft', riskLevel: 'Critical',
      maintenanceRange: { min: 50, max: 100, target: 60 }, managementRange: { min: 10, max: 20, target: 15 }, combinedRange: { min: 0, max: 0, target: 0 },
    },
  ],
};