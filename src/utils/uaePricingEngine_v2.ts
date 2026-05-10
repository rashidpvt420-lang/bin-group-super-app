import { BIN_CONTRACT_TYPES, MAJLIS_MAINTENANCE_PACKAGES, SERVICE_ADDONS } from './uaePricingMatrix2026';

export const UAE_VAT_RATE = 0.05;

/**
 * BIN-GENESIS SMART QUOTATION ENGINE v2.2
 * Institutional Asset Valuation with UAE VAT visibility.
 */
export interface SmartQuoteAdvisory {
  recommendedTier: 'STANDARD' | 'PREMIUM' | 'SOVEREIGN';
  complexityScore: number;
  baseAnnualPrice: number;
  riskAdjustment: number;
  subtotalAnnualPrice: number;
  vatRate: number;
  vatAmount: number;
  totalAnnualPrice: number;
  mobilizationFee: number;
  guidanceNotes: string[];
  allowedContractTypes: string[];
  selectedPackage?: any;
  addonTotal?: number;
}

export interface QuoteInputs {
  propertyType: string;
  ownerType?: 'Government' | 'Private';
  sqft: number;
  age: number;
  floors: number;
  units: number;
  hvacType: 'District' | 'DX';
  liftCount: number;
  pool: boolean;
  landscape: 'None' | 'Low' | 'High';
  assetGrade: 'Standard' | 'Premium' | 'Luxury' | 'Ultra-Luxury' | 'Sovereign';
  riskIndicator?: number;
  contractType?: 'FM_ONLY' | 'PM_ONLY' | 'BOTH';
  majlisPackageId?: string;
  selectedAddons?: string[];
  slaTier?: 'SLA_BASIC' | 'SLA_STANDARD' | 'SLA_GOLD' | 'SLA_PLATINUM';
}

export const generateSmartQuote = (inputs: QuoteInputs): SmartQuoteAdvisory => {
  let complexity = 30;
  const notes: string[] = [];
  const isMajlis = inputs.propertyType.toLowerCase().includes('majlis');

  let allowedTypes = Object.keys(BIN_CONTRACT_TYPES);
  if (isMajlis) {
    allowedTypes = ['FM_ONLY'];
    notes.push('Majlis/Government Majlis restricted to Maintenance Only by default.');
  }

  if (inputs.floors > 30) { complexity += 20; notes.push('High-rise structural loading protocol required.'); }
  if (inputs.units > 100) { complexity += 15; notes.push('Mass-occupancy operational friction adjustment.'); }
  if (inputs.hvacType === 'DX') { complexity += 10; notes.push('DX decentralized cooling maintenance load.'); }
  if (inputs.liftCount > (inputs.floors / 8)) complexity += 5;
  if (inputs.age > 15) { complexity += 20; notes.push('Legacy asset decay mitigation layer active.'); }
  else if (inputs.age > 8) complexity += 10;
  if (inputs.pool) complexity += 5;
  if (inputs.landscape === 'High') { complexity += 10; notes.push('Extended landscape/irrigation protocol required.'); }

  let basePrice = 0;
  let selectedPkg = null;

  if (isMajlis && inputs.majlisPackageId) {
    selectedPkg = MAJLIS_MAINTENANCE_PACKAGES.find((p) => p.id === inputs.majlisPackageId);
    basePrice = selectedPkg ? selectedPkg.basePrice : 15000;
    notes.push(`Selected Majlis Package: ${selectedPkg?.label || 'Custom'}`);
  } else {
    let ratePerSqft = 1.8;
    if (inputs.propertyType.includes('GOVERNMENT')) ratePerSqft = 3.5;
    if (inputs.propertyType === 'HOTEL') ratePerSqft = 4.2;
    if (inputs.assetGrade === 'Ultra-Luxury' || inputs.assetGrade === 'Sovereign') ratePerSqft *= 2.2;
    basePrice = inputs.sqft * ratePerSqft;
  }

  let addonTotal = 0;
  if (inputs.selectedAddons?.length) {
    inputs.selectedAddons.forEach((addonId) => {
      const addon = SERVICE_ADDONS.find((a) => a.id === addonId);
      if (addon) addonTotal += addon.price;
    });
    notes.push(`${inputs.selectedAddons.length} service add-ons integrated.`);
  }

  let slaMultiplier = 1.0;
  if (inputs.slaTier === 'SLA_GOLD') slaMultiplier = 1.25;
  if (inputs.slaTier === 'SLA_PLATINUM') slaMultiplier = 1.5;
  if (inputs.slaTier === 'SLA_BASIC') slaMultiplier = 0.9;

  const complexityMultiplier = 1 + (complexity / 100);
  const subtotalAnnualPrice = Math.round((basePrice * complexityMultiplier * slaMultiplier) + addonTotal);
  const vatAmount = Math.round(subtotalAnnualPrice * UAE_VAT_RATE);
  const totalAnnualPrice = subtotalAnnualPrice + vatAmount;

  let tier: SmartQuoteAdvisory['recommendedTier'] = 'STANDARD';
  if (complexity > 70 || inputs.assetGrade === 'Ultra-Luxury') tier = 'SOVEREIGN';
  else if (complexity > 45 || inputs.assetGrade === 'Luxury') tier = 'PREMIUM';

  notes.push(`Tier Recommendation: ${tier} based on systemic complexity index of ${complexity}.`);
  notes.push('UAE VAT calculated at 5% and shown separately from service subtotal.');

  return {
    recommendedTier: tier,
    complexityScore: complexity,
    baseAnnualPrice: Math.round(basePrice),
    riskAdjustment: Math.round(subtotalAnnualPrice - basePrice - addonTotal),
    subtotalAnnualPrice,
    vatRate: UAE_VAT_RATE,
    vatAmount,
    totalAnnualPrice,
    mobilizationFee: Math.round(totalAnnualPrice * 0.15),
    guidanceNotes: notes,
    allowedContractTypes: allowedTypes,
    selectedPackage: selectedPkg,
    addonTotal,
  };
};

export const calculateUAEValuation = async (inputs: any): Promise<any> => {
  const quote = generateSmartQuote({
    propertyType: inputs.propertyType,
    ownerType: inputs.useType === 'Government' ? 'Government' : 'Private',
    sqft: inputs.sqft || 1200,
    age: inputs.age || 5,
    floors: inputs.floors || 1,
    units: inputs.units || 1,
    hvacType: inputs.hvacType || 'DX',
    liftCount: inputs.liftCount || 0,
    pool: !!inputs.pool,
    landscape: inputs.landscape || 'Low',
    assetGrade: inputs.assetGrade || 'Premium',
    slaTier: inputs.slaTier || 'SLA_STANDARD',
    selectedAddons: inputs.selectedAddons || [],
  });

  return {
    property: {
      propertyType: inputs.propertyType,
      builtUpAreaSqFt: inputs.sqft,
      buildingGrade: inputs.assetGrade,
    },
    valuation: {
      saleEstimate: { target: inputs.sqft * 1200 },
    },
    package: {
      annualPrice: quote.totalAnnualPrice,
      subtotalAnnualPrice: quote.subtotalAnnualPrice,
      vatRate: quote.vatRate,
      vatAmount: quote.vatAmount,
      contractTemplateType: inputs.propertyType.includes('GOVERNMENT') ? 'GOVERNMENT_CONTRACT' : 'STANDARD_AMC',
    },
    contractRecommendation: {
      recommendedTier: quote.recommendedTier,
      contractTemplate: inputs.propertyType.includes('GOVERNMENT') ? 'GOVERNMENT_CONTRACT' : 'STANDARD_AMC',
      allowedTypes: quote.allowedContractTypes,
    },
    advisory: quote,
  };
};
