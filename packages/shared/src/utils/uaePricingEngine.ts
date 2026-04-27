import { classifyProperty, PropertyClassification } from './propertyClassifier';

/**
 * ─── BIN-GENESIS™ SMART QUOTATION ENGINE v2.0 ─────────────────────────────────────
 * Institutional Asset Valuation & Complexity-Adjusted Service Modeling.
 */

export interface SmartQuoteAdvisory {
    recommendedTier: 'STANDARD' | 'PREMIUM' | 'SOVEREIGN';
    complexityScore: number; // 0-100
    baseAnnualPrice: number;
    riskAdjustment: number;
    totalAnnualPrice: number;
    mobilizationFee: number; // 15% upfront
    guidanceNotes: string[];
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
    riskIndicator?: number; // Previous BPI or incident history if known
}

export const generateSmartQuote = (inputs: QuoteInputs): SmartQuoteAdvisory => {
    let complexity = 30; // Base institutional floor
    const notes: string[] = [];

    // 1. Structural Complexity
    if (inputs.floors > 30) { complexity += 20; notes.push("High-rise structural loading protocol required."); }
    if (inputs.units > 100) { complexity += 15; notes.push("Mass-occupancy operational friction adjustment."); }
    
    // 2. Mechanical Complexity
    if (inputs.hvacType === 'DX') { complexity += 10; notes.push("DX decentralized cooling maintenance load."); }
    if (inputs.liftCount > (inputs.floors / 8)) { complexity += 5; } // Many lifts
    
    // 3. Asset Age Decay
    if (inputs.age > 15) { complexity += 20; notes.push("Legacy asset decay mitigation layer active."); }
    else if (inputs.age > 8) { complexity += 10; }

    // 4. Luxury/Sovereign Overlays
    if (inputs.pool) { complexity += 5; }
    if (inputs.landscape === 'High') { complexity += 10; notes.push("Extended landscape/irrigation protocol required."); }

    // Base Pricing Algorithm (AED per SQFT)
    let ratePerSqft = 1.8; // Base standard
    if (inputs.propertyType.includes('GOVERNMENT')) ratePerSqft = 3.5;
    if (inputs.propertyType === 'HOTEL') ratePerSqft = 4.2;
    if (inputs.assetGrade === 'Ultra-Luxury' || inputs.assetGrade === 'Sovereign') ratePerSqft *= 2.2;

    const basePrice = inputs.sqft * ratePerSqft;
    const complexityMultiplier = 1 + (complexity / 100);
    const totalAnnual = Math.round(basePrice * complexityMultiplier);

    // Recommended Tier
    let tier: SmartQuoteAdvisory['recommendedTier'] = 'STANDARD';
    if (complexity > 70 || inputs.assetGrade === 'Ultra-Luxury') tier = 'SOVEREIGN';
    else if (complexity > 45 || inputs.assetGrade === 'Luxury') tier = 'PREMIUM';

    notes.push(`Tier Recommendation: ${tier} based on systemic complexity index of ${complexity}.`);

    return {
        recommendedTier: tier,
        complexityScore: complexity,
        baseAnnualPrice: Math.round(basePrice),
        riskAdjustment: Math.round(totalAnnual - basePrice),
        totalAnnualPrice: totalAnnual,
        mobilizationFee: Math.round(totalAnnual * 0.15),
        guidanceNotes: notes
    };
};

/**
 * LEGACY COMPATIBILITY WRAPPER
 */
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
        assetGrade: inputs.assetGrade || 'Premium'
    });

    return {
        property: { 
            propertyType: inputs.propertyType, 
            builtUpAreaSqFt: inputs.sqft, 
            buildingGrade: inputs.assetGrade 
        },
        valuation: { 
            saleEstimate: { target: inputs.sqft * 1200 } // Rough fallback
        },
        package: { 
            annualPrice: quote.totalAnnualPrice,
            contractTemplateType: inputs.propertyType.includes('GOVERNMENT') ? 'GOVERNMENT_CONTRACT' : 'STANDARD_AMC'
        },
        contractRecommendation: { 
            recommendedTier: quote.recommendedTier,
            contractTemplate: inputs.propertyType.includes('GOVERNMENT') ? 'GOVERNMENT_CONTRACT' : 'STANDARD_AMC'
        },
        advisory: quote // Attach full v2 report
    };
};
