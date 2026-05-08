import { db, collection, addDoc, serverTimestamp } from '../lib/firebase';
import { generateSmartQuote } from './uaePricingEngine_v2';
import type { SmartQuoteAdvisory } from './uaePricingEngine_v2';

export interface IntegratedIntelligenceResponse {
    property: any;
    valuation: {
        saleEstimate: { target: number };
        valuationMode: string;
    };
    package: {
        annualPrice: number;
        packageName: string;
        tier: string;
    };
    contractRecommendation: {
        recommendedTier: string;
        reasons: string[];
    };
    advisory: SmartQuoteAdvisory;
    savingsSimulation: {
        marketAverageAnnual: number;
        binGroupAnnual: number;
        savingsAmount: number;
        efficiencyGain: string;
    };
    benchmark: {
        alignmentStatus: string;
        marketBenchmarkMin: number;
        marketBenchmarkMax: number;
        benchmarkSource: string;
        benchmarkJustification: string;
    };
    portfolioIntelligence: {
        finalAnnualPrice: number;
    };
}

export const calculateUAEValuation = async (inputs: any): Promise<IntegratedIntelligenceResponse> => {
    const sq = generateSmartQuote({
        propertyType: inputs.propertyType || 'Villa',
        ownerType: inputs.useType === 'Government' ? 'Government' : 'Private',
        sqft: inputs.sqft || 1200,
        age: inputs.age || 5,
        floors: inputs.floors || 1,
        units: inputs.units || 1,
        hvacType: inputs.hvacType || 'DX',
        liftCount: inputs.lifts || 0,
        pool: !!inputs.pool,
        landscape: inputs.landscape || 'Low',
        assetGrade: inputs.assetGrade || 'Premium'
    });

    const marketAvg = Math.round(sq.totalAnnualPrice * 1.35);

    return {
        property: { 
            propertyType: inputs.propertyType, 
            builtUpAreaSqFt: inputs.sqft, 
            buildingGrade: inputs.assetGrade 
        },
        valuation: { 
            saleEstimate: { target: inputs.sqft * 1500 },
            valuationMode: 'INSTITUTIONAL_V2'
        },
        package: { 
            annualPrice: sq.totalAnnualPrice,
            packageName: `${sq.recommendedTier} FM Protocol`,
            tier: sq.recommendedTier.toLowerCase()
        },
        contractRecommendation: { 
            recommendedTier: sq.recommendedTier,
            reasons: sq.guidanceNotes
        },
        advisory: sq,
        savingsSimulation: {
            marketAverageAnnual: marketAvg,
            binGroupAnnual: sq.totalAnnualPrice,
            savingsAmount: marketAvg - sq.totalAnnualPrice,
            efficiencyGain: `+${sq.complexityScore}% Compliance Boost`
        },
        benchmark: {
            alignmentStatus: 'ALIGNED',
            marketBenchmarkMin: Math.round(sq.totalAnnualPrice * 0.9),
            marketBenchmarkMax: Math.round(sq.totalAnnualPrice * 1.4),
            benchmarkSource: 'BIN-GROUP Sovereign Intelligence',
            benchmarkJustification: `Based on systemic complexity index of ${sq.complexityScore}.`
        },
        portfolioIntelligence: {
            finalAnnualPrice: sq.totalAnnualPrice
        }
    };
};

export const calculatePortfolioValuation = async (properties: any[]): Promise<IntegratedIntelligenceResponse> => {
    const results = await Promise.all(properties.map(p => calculateUAEValuation(p)));
    const total = results.reduce((sum, r) => sum + r.package.annualPrice, 0);
    const final = results.length > 3 ? Math.round(total * 0.9) : total;
    
    const response = { ...results[0] };
    response.package.annualPrice = final;
    response.portfolioIntelligence.finalAnnualPrice = final;
    return response;
};

export const savePricingAudit = async (ownerId: string, propertyData: any, result: IntegratedIntelligenceResponse) => {
    try {
        await addDoc(collection(db, 'pricingAuditLogs'), {
            ownerId,
            propertyId: propertyData.id || 'lead_quote',
            result,
            createdAt: serverTimestamp()
        });
    } catch (e) {}
};
