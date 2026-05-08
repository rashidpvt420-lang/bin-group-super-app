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

export function calculateUaeQuote2026(input: QuoteInput): QuoteOutput {
  const assetClass = UAE_PRICING_MATRIX_2026.assetClasses.find(a => a.id === input.assetClassId);
  if (!assetClass) throw new Error("Invalid Asset Class ID");

  const pricingExplanation: string[] = [];
  const riskFlags: string[] = [];

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

  if (['large_hospital', 'primary_clinic', 'data_center'].includes(input.assetClassId)) {
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
  const addOnTotal = (input.addOns?.length || 0) * 1500; // Simplified for now, can be asset specific

  // 8. Calculations
  let subtotal = (emirateAdjustedQuote * ageMultiplier * slaMultiplier) + complexityPremium + addOnTotal;

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
