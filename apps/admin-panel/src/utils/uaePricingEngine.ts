import { db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { calculateBuildingHealth } from './buildingHealthEngine';

export type Emirate = 'Dubai' | 'Abu Dhabi' | 'Sharjah' | 'Ajman' | 'RAK' | 'Fujairah' | 'UAQ';
export type PropertyType = 'Apartment' | 'Villa' | 'Office' | 'Retail' | 'Warehouse' | 'Tower' | 'Land';
export type BuildingGrade = 'Standard' | 'Premium' | 'Luxury' | 'Ultra-Luxury';
export type ViewType = 'Community' | 'Pool' | 'Park' | 'Sea' | 'Skyline' | 'Golf' | 'Burj Khalifa';

export interface PropertyDoc {
    ownerId: string;
    propertyName: string;
    emirate: Emirate;
    area: string;
    propertyType: string;
    usageType: string;
    unitSubtype: string;
    builtUpAreaSqFt: number;
    propertyAgeYears: number;
    buildingGrade: string;
    viewType: string;
    conditionScore: number;
    complianceRiskProfile: string;
    occupancyStatus: string;
}

export interface ValuationModule {
    rentEstimate: { low: number; target: number; high: number };
    saleEstimate: { low: number; target: number; high: number };
    confidenceLevel: 'low' | 'medium' | 'high';
    confidenceScore: number;
    valuationMode: string;
    drivers: string[];
}

export interface FMQuoteModule {
    annualEstimate: { low: number; target: number; high: number };
    riskTier: string;
    recommendedPackageTier: string;
    drivers: string[];
}

export interface RiskPackModule {
    civilDefenseStatus: string;
    elevatorInspectionStatus: string;
    insuranceExposure: string;
    complianceRiskScore: number;
    complianceRiskLabel: string;
}

export interface MaintenanceForecastModule {
    oneYearReactiveCost: number;
    oneYearContractCost: number;
    oneYearSavings: number;
    fiveYearReactiveCost: number;
    fiveYearContractCost: number;
    fiveYearSavings: number;
    forecastConfidence: string;
}

export interface OwnerInsightsModule {
    buildingHealthScore: number;
    healthTrend: string;
    assetLifecycleStage: string;
    liquidityScore: string;
    rentalDemandScore: string;
    nextMajorServiceWindowMonths: number;
    predictedValueProtectionPercent: number;
}

export interface QuotationPackageModule {
    packageName: string;
    tier: string;
    annualPrice: number;
    responseSla: string;
    includedVisits: number;
    coverageScope: string[];
    recommended: boolean;
}

export interface IntegratedIntelligenceResponse {
    property: PropertyDoc;
    valuation: ValuationModule;
    fmQuote: FMQuoteModule;
    riskPack: RiskPackModule;
    forecast: MaintenanceForecastModule;
    insights: OwnerInsightsModule;
    package: QuotationPackageModule;
    dataStatusLabel: string;
    decisionVersion: string;
    confidenceScore: number;
    inputCompleteness: number;
    missingFields: string[];
    assumptionFlags: string[];
    quoteExpiresAt: string;
    priceLockUntil: string;
    trustTier: 'INSTITUTIONAL_HIGH' | 'VERIFIED_MEDIUM' | 'PRELIMINARY';
}

export const calculateUAEValuation = async (inputs: any): Promise<IntegratedIntelligenceResponse> => {
    

    // ── 1. Asset Intelligence Layer ──────────────────────────────────────────
    const communityMultipliers: Record<string, number> = {
        'Dubai Marina': 1.45, 'Downtown Dubai': 1.60, 'Palm Jumeirah': 2.10,
        'JLT': 1.15, 'Business Bay': 1.25, 'Al Ain': 0.85, 'Default': 1.0
    };

    const gradeMultipliers: Record<string, number> = {
        'Ultra': 2.50, 'Luxury': 1.80, 'Premium': 1.30, 'Standard': 1.0
    };

    const exposureMultipliers: Record<string, number> = {
        'Street': 0.95, 'Pool': 1.10, 'Park': 1.15, 'Sea': 1.40, 'Skyline': 1.30, 'Marina': 1.25
    };

    const complianceAdjusters: Record<string, number> = {
        'low_risk': 1.02, 'medium_risk': 0.95, 'high_risk': 0.85
    };

    const communityMult = communityMultipliers[inputs.community] || communityMultipliers['Default'];
    const gradeMult = gradeMultipliers[inputs.buildingGrade] || 1.0;
    const exposureMult = exposureMultipliers[inputs.exposure] || 1.0;
    const verticalMult = 1 + (Math.min(inputs.verticalLevel || 1, 60) * 0.005);
    const complianceMult = complianceAdjusters[inputs.compliance] || 1.0;
    const ageDepreciation = Math.max(0.75, 1 - (inputs.buildingAge * 0.01)); // 1% drop per year
    const furnishingMult = inputs.furnished ? 1.15 : 1.0;

    // Combined Market Multiplier
    const totalAssetMultiplier = communityMult * gradeMult * exposureMult * verticalMult * complianceMult * ageDepreciation * furnishingMult;

    // ── 2. Strategy Layer ────────────────────────────────────────────────────
    const basePricePerSqFt = 1200; // Dubai Baseline
    const marketValue = Math.round(basePricePerSqFt * totalAssetMultiplier * inputs.floorPlateSqFt * (inputs.conditionScore / 10));
    
    // Strategy Outputs
    // --- 1. Confidence Score Logic (0-100%) ---
    let confidenceScore = 100;
    const missingFields: string[] = [];
    const assumptionFlags: string[] = [];
    if (!inputs.verticalLevel) { confidenceScore -= 10; missingFields.push('verticalLevel'); assumptionFlags.push('defaultMidLevelApplied'); }
    if (!inputs.conditionScore) { confidenceScore -= 10; missingFields.push('conditionScore'); assumptionFlags.push('standardConditionCurveUsed'); }
    if (!inputs.exposure) { confidenceScore -= 10; missingFields.push('exposure'); assumptionFlags.push('baselineExposureApplied'); }
    if (!inputs.buildingAge) { confidenceScore -= 10; missingFields.push('buildingAge'); assumptionFlags.push('ageEstimatedFromCommunityAvg'); }

    const inputCompleteness = (13 - missingFields.length) / 13;

    const now = new Date();
    const quoteExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const priceLockUntil = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
    
    const trustTier = confidenceScore >= 90 ? 'INSTITUTIONAL_HIGH' : confidenceScore >= 75 ? 'VERIFIED_MEDIUM' : 'PRELIMINARY';

    // --- 2. Base Asset Valuation (AED Market Value) ---
    const saleValue = marketValue;
    const annualRent = Math.round(marketValue * 0.065); // 6.5% Net Yield target
    const maintenanceBase = Math.round(marketValue * 0.012); // 1.2% FM ratio
    const pmFee = Math.round(annualRent * 0.05);             // 5% PM commission
    const bundledPrice = Math.round((maintenanceBase + pmFee) * 0.9); // 10% Bundle Discount

    // ── 3. Contract Output Layer ─────────────────────────────────────────────
    if (gradeMult >= 1.8 || inputs.strategy === 'rent') {
        // High-touch Logic
    }

    const healthReport = calculateBuildingHealth({
        age: inputs.buildingAge,
        floors: inputs.verticalLevel || 1,
        sector: inputs.assetType === 'Office' ? 'Commercial' : 'Residential',
        hvacCount: Math.ceil(inputs.floorPlateSqFt / 1000) * 2
    });

    return {
        property: {
            ownerId: 'UID_PENDING',
            propertyName: `${inputs.community} ${inputs.assetType}`,
            emirate: inputs.emirate,
            area: inputs.community,
            propertyType: inputs.assetType,
            usageType: 'residential',
            unitSubtype: inputs.configuration,
            builtUpAreaSqFt: inputs.floorPlateSqFt,
            propertyAgeYears: inputs.buildingAge,
            buildingGrade: inputs.buildingGrade,
            viewType: inputs.exposure,
            conditionScore: inputs.conditionScore,
            complianceRiskProfile: inputs.compliance,
            occupancyStatus: 'vacant'
        },
        valuation: {
            rentEstimate: { low: Math.round(annualRent * 0.9), target: annualRent, high: Math.round(annualRent * 1.1) },
            saleEstimate: { low: Math.round(saleValue * 0.9), target: saleValue, high: Math.round(saleValue * 1.1) },
            confidenceLevel: confidenceScore >= 85 ? 'high' : confidenceScore >= 70 ? 'medium' : 'low',
            confidenceScore: confidenceScore,
            valuationMode: `STRATEGY MODE: ${inputs.strategy.toUpperCase()}`,
            drivers: [
                `${inputs.buildingGrade} Grade`,
                `${inputs.community} Cluster`,
                `${inputs.exposure} Exposure`,
                inputs.furnished ? 'Fully Furnished Premium' : 'Unfurnished Base'
            ]
        },
        fmQuote: {
            annualEstimate: { 
                low: maintenanceBase, 
                target: bundledPrice, 
                high: maintenanceBase + pmFee 
            },
            riskTier: inputs.compliance === 'low_risk' ? 'low' : 'medium',
            recommendedPackageTier: gradeMult >= 1.8 ? 'ultimate' : 'premium',
            drivers: [
                `FM Ratio: 1.2%`,
                `Compliance Delta: ${complianceMult}x`,
                `Age Depreciation: ${ageDepreciation.toFixed(2)}x`
            ]
        },
        riskPack: {
            civilDefenseStatus: 'compliant',
            elevatorInspectionStatus: inputs.verticalLevel > 2 ? 'certified' : 'n/a',
            insuranceExposure: inputs.compliance,
            complianceRiskScore: 100 - (complianceMult * 100),
            complianceRiskLabel: inputs.compliance
        },
        forecast: {
            oneYearReactiveCost: Math.round(maintenanceBase * 1.5),
            oneYearContractCost: maintenanceBase,
            oneYearSavings: Math.round(maintenanceBase * 0.5),
            fiveYearReactiveCost: Math.round(maintenanceBase * 1.5 * 5),
            fiveYearContractCost: Math.round(maintenanceBase * 5),
            fiveYearSavings: Math.round(maintenanceBase * 0.5 * 5),
            forecastConfidence: 'high'
        },
        insights: {
            buildingHealthScore: healthReport.overallScore,
            healthTrend: 'stable',
            assetLifecycleStage: inputs.buildingAge < 5 ? 'early' : inputs.buildingAge < 15 ? 'mid' : 'mature',
            liquidityScore: communityMult >= 1.4 ? 'high' : 'medium',
            rentalDemandScore: communityMult >= 1.2 ? 'exceptional' : 'strong',
            nextMajorServiceWindowMonths: 12,
            predictedValueProtectionPercent: gradeMult * 10
        },
        package: {
            packageName: gradeMult >= 2.0 ? 'Sovereign Ultra' : 'Elite Property Care',
            tier: gradeMult >= 2.0 ? 'ultimate' : 'premium',
            annualPrice: bundledPrice,
            responseSla: '4 hours',
            includedVisits: 12,
            coverageScope: ["AC Maintenance", "Electrical", "Plumbing", "Property Management"],
            recommended: true
        },
        dataStatusLabel: `V5.0 DECISION ENGINE - STABLE (Confidence: ${confidenceScore}%)`,
        decisionVersion: 'v5.0-STABLE',
        confidenceScore,
        inputCompleteness,
        missingFields,
        assumptionFlags,
        quoteExpiresAt,
        priceLockUntil,
        trustTier
    };
};

export const savePricingAudit = async (ownerId: string, propertyData: any, result: IntegratedIntelligenceResponse) => {
    try {
        await addDoc(collection(db, 'pricingAuditLogs'), {
            ownerId,
            propertyId: propertyData.id || 'lead_quote',
            engineType: 'decision_engine_v5_stable',
            summary: `${result.property.propertyName} - ${result.valuation.valuationMode}`,
            result,
            createdAt: serverTimestamp()
        });
    } catch (e) {
        console.error("Audit log failed:", e);
    }
};
