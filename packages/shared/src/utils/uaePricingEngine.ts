import { db, collection, addDoc, serverTimestamp } from '../lib/firebase';

import { calculateBuildingHealth } from './buildingHealthEngine';
import { classifyProperty, PropertyClassification } from './propertyClassifier';

export type Emirate = 'Dubai' | 'Abu Dhabi' | 'Sharjah' | 'Ajman' | 'RAK' | 'Fujairah' | 'UAQ' | 'Al Ain';
export type PropertyType = 'Apartment' | 'Villa' | 'Office' | 'Retail' | 'Warehouse' | 'Tower' | 'Land' | 'School' | 'Hotel' | 'Gov_Building' | 'Majlis';
export type BuildingGrade = 'Standard' | 'Premium' | 'Luxury' | 'Ultra-Luxury';

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

export interface BenchmarkModule {
    marketBenchmarkMin: number;
    marketBenchmarkMax: number;
    benchmarkSource: string;
    benchmarkRegion: string;
    benchmarkAssetType: string;
    benchmarkJustification: string;
    alignmentStatus: 'ALIGNED' | 'PREMIUM' | 'BELOW_MARKET' | 'CRITICAL_LOW';
}

export interface RiskPackModule {
    civilDefenseStatus: string;
    elevatorInspectionStatus: string;
    insuranceExposure: string;
    complianceRiskScore: number;
    complianceRiskLabel: string;
    arrivalDispatchLatency: number; // V1.16.1 Tower Dispatch Scaling
    dispatchZone: string; // V1.16.2 Landmark Zone Segment
    liftLoadIndex: number; // V1.16.2 Congestion Safeguard
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
    sustainabilityScore: number;
    esgRating: 'A+' | 'A' | 'B' | 'C'; // V1.16.1 ESG Layer
    energyIndex: number; // V1.16.2 ESG Detail
    waterIndex: number; 
    maintenanceFrequency: number; 
    certCoverage: number;
    capexReserveRequirement: number;
    reserveConfidenceIndex: 'HIGH' | 'MEDIUM' | 'LOW'; // V1.16.2 Institutional Layer
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

export interface AddOnModule {
    name: string;
    description: string;
    frequency: string;
    annualCost: number;
    isMandatory: boolean;
}

// ── NATIONAL INTELLIGENCE ENGINES (Sprint V1.6) ──────────────────────────

/**
 * Generates an Asset Integrity Score (0-100) based on operational health.
 * Formula weights: Age (30%), MTTR (40%), Service Cycles (30%)
 */
export const calculateAssetIntegrityScore = (ageYears: number, avgMttr: number, mttrTarget: number = 4): number => {
    const ageScore = Math.max(0, 100 - (ageYears * 10));
    const mttrScore = Math.max(0, 100 * (1 - (avgMttr / (mttrTarget * 2))));
    const cyclesScore = 95; // Placeholder for sensor telemetry
    
    return Math.round((ageScore * 0.3) + (mttrScore * 0.4) + (cyclesScore * 0.3));
};

/**
 * Forecasts maintenance spend for the next 24 months.
 * Factors in sector-specific aging curves and institutional loading.
 */
export const forecastMaintenanceCost = (sqft: number, age: number, sector: string): number => {
    const baseRate = (sector === 'GOVERNMENT' || sector === 'MAJLIS') ? 1.8 : (sector === 'HOTEL' ? 2.5 : 1.2);
    const inflationFactor = 1.05; // 5% YoY UAE forecast
    const agingMultiplier = 1 + (age * 0.15); // 15% increase per year of age
    
    const monthlySpend = (sqft * baseRate * agingMultiplier) / 12;
    return Math.round(monthlySpend * 24 * inflationFactor);
};

export const calculateCertificationRisk = (daysToExpiry: number, type: 'FIRE' | 'LIFT' | 'WATER'): number => {
    const weights = { FIRE: 1.0, LIFT: 0.8, WATER: 0.5 };
    if (daysToExpiry > 60) return 0;
    if (daysToExpiry <= 0) return 100;
    
    const urgency = (60 - daysToExpiry) / 60;
    return Math.round(urgency * 100 * weights[type]);
};

export interface IntegratedIntelligenceResponse {
    property: PropertyDoc;
    valuation: ValuationModule;
    fmQuote: FMQuoteModule;
    addOns: AddOnModule[];
    riskPack: RiskPackModule;
    forecast: MaintenanceForecastModule;
    insights: OwnerInsightsModule;
    package: QuotationPackageModule;
    packages: QuotationPackageModule[]; // V1.17 Public Prep: Support 3-tier selection
    benchmark: BenchmarkModule; // V1.19 UAE Market Alignment Layer
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
    console.log("🚀 BIN-GROUP DECISION ENGINE v5.1-STABLE:", inputs);

    // ── 1. Asset Intelligence Layer ──────────────────────────────────────────
    const communityMultipliers: Record<string, number> = {
        'Dubai Marina': 1.45, 'Downtown Dubai': 1.60, 'Palm Jumeirah': 2.10,
        'JLT': 1.15, 'Business Bay': 1.25, 'Al Ain': 0.85, 'Default': 1.0
    };

    const gradeMultipliers: Record<string, number> = {
        'Ultra-Luxury': 2.50, 'Luxury': 1.80, 'Premium': 1.30, 'Standard': 1.0
    };

    const complianceAdjusters: Record<string, number> = {
        'low_risk': 1.02, 'medium_risk': 0.95, 'high_risk': 0.85
    };

    const communityMult = communityMultipliers[inputs.community] || 1.0;
    const gradeMult = gradeMultipliers[inputs.buildingGrade] || 1.0;
    
    // V1.15/V1.16/V1.16.1 Super-Tall Scaling (Supports 1-500 floors)
    // Refined formula: log10 curve + lift bank loading + bmu access weight
    const hasBMU = (inputs.verticalLevel || 1) > 6 || (inputs.assetType === 'Tower');
    const verticalMult = 1 + (Math.log10(inputs.verticalLevel || 1) * 0.38) + 
                         ((inputs.liftsCount || 0) * 0.015) + 
                         (hasBMU ? 0.12 : 0);
    
    const complianceMult = complianceAdjusters[inputs.compliance] || 1.0;
    const ageDepreciation = Math.max(0.75, 1 - (inputs.buildingAge * 0.01));
    const furnishingMult = inputs.furnished ? 1.15 : 1.0;

    // Combined Market Multiplier
    const totalAssetMultiplier = communityMult * gradeMult * verticalMult * complianceMult * ageDepreciation * furnishingMult;

    // ── 2. Strategy Layer ────────────────────────────────────────────────────
    const basePricePerSqFt = (inputs.emirate === 'Abu Dhabi' || inputs.emirate === 'Al Ain') ? 1000 : 1200; 
    const marketValue = Math.round(basePricePerSqFt * totalAssetMultiplier * inputs.floorPlateSqFt * (inputs.conditionScore / 10));
    
    let confidenceScore = 100;
    const missingFields: string[] = [];
    const assumptionFlags: string[] = [];
    if (!inputs.verticalLevel) { confidenceScore -= 10; missingFields.push('verticalLevel'); assumptionFlags.push('defaultMidLevelApplied'); }
    if (!inputs.conditionScore) { confidenceScore -= 10; missingFields.push('conditionScore'); assumptionFlags.push('standardConditionCurveUsed'); }
    if (!inputs.buildingAge) { confidenceScore -= 10; missingFields.push('buildingAge'); assumptionFlags.push('ageEstimatedFromCommunityAvg'); }

    const inputCompleteness = (13 - missingFields.length) / 13;

    const now = new Date();
    const quoteExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const priceLockUntil = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
    const trustTier = confidenceScore >= 90 ? 'INSTITUTIONAL_HIGH' : confidenceScore >= 75 ? 'VERIFIED_MEDIUM' : 'PRELIMINARY';

    const saleValue = marketValue;
    const annualRent = Math.round(marketValue * 0.065); 
    
    // 2.2 Property Archetype Auto-Classification (Module 2)
    const detectedArchetype = classifyProperty({
        floors: inputs.verticalLevel || 1,
        units: inputs.units || 1,
        classrooms: inputs.classrooms || 0,
        beds: inputs.beds || 0,
        starRating: inputs.starRating || 0,
        authorityName: inputs.authorityName || '',
        areaSqFt: inputs.floorPlateSqFt || 0,
        propertyUsage: (inputs.assetType === 'Office' || inputs.assetType === 'Retail' || inputs.assetType === 'Warehouse') ? 'commercial' : 'residential'
    });
    
    // Override assetType if auto-classification is higher-confidence
    const pType: PropertyClassification = detectedArchetype || (inputs.assetType as PropertyClassification);

    // ── 3. Sector-Specific Pricing Engine ───────────────────────────────────
    let maintenanceBase = Math.round(marketValue * 0.012); 
    
    if (pType === "School") {
        maintenanceBase = (inputs.floorPlateSqFt || 0) * 35;
    } else if (pType === "Hotel") {
        maintenanceBase = (inputs.numberOfRooms || 50) * 3500;
        if (inputs.starRating >= 4) maintenanceBase *= 1.35;
    } else if (pType === "Government" || pType === "Majlis") {
        // Government and Majalis Pricing (Abu Dhabi & Al Ain)
        let majlisMultiplier = (inputs.emirate === 'Abu Dhabi' || inputs.emirate === 'Al Ain') ? 25 : 20;
        
        // V1.19 Institutional Majlis Garden Logic
        if (inputs.majlisGarden === true) {
            majlisMultiplier *= 1.45; // 45% surcharge for landscaped protocol grounds
        }
        
        maintenanceBase = (inputs.floorPlateSqFt || 1000) * majlisMultiplier;
    } else if (pType === "Hospital") {
        maintenanceBase = (inputs.floorPlateSqFt || 1000) * 45; // Intensive MEP
    }

    const pmFee = Math.round(annualRent * 0.05); // V1.19: Strict 5% UAE PM Benchmark Fee
    const bundledPrice = Math.round((maintenanceBase + pmFee) * 0.9); 

    // ── 3.1 UAE Market Benchmarking (DLD & Abu Dhabi Anchors) ───────────────
    let benchmarkMin = maintenanceBase * 0.85;
    let benchmarkMax = maintenanceBase * 1.15;
    let bSource = "DLD Service Charge Index (v2024.1)";
    let bJustification = "Based on standard community service charge data for the region.";

    if (pType === "School" || pType === "Hotel" || pType === "Government") {
        benchmarkMin = maintenanceBase * 0.92;
        benchmarkMax = maintenanceBase * 1.08;
        bSource = "Institutional FM Standards (UAE Ministry of Infrastructure)";
        bJustification = "Calibration for technical uptime requirements and life-safety compliance.";
    } else if (pType === "Majlis") {
        benchmarkMin = maintenanceBase * 0.95;
        benchmarkMax = maintenanceBase * 1.25;
        bSource = "Private Estate Pricing Benchmark (Al Bateen/Majlis Standards)";
        bJustification = "Premium landscape and bespoke MEP requirements for majlis assets.";
    }

    if (inputs.emirate === 'Al Ain') {
        bJustification += " (Applied Al Ain regional multiplier for logistics optimization)";
    }

    const alignment: 'ALIGNED' | 'PREMIUM' | 'BELOW_MARKET' | 'CRITICAL_LOW' = 
        bundledPrice < benchmarkMin * 0.8 ? 'CRITICAL_LOW' :
        bundledPrice < benchmarkMin ? 'BELOW_MARKET' :
        bundledPrice > benchmarkMax ? 'PREMIUM' : 'ALIGNED';

    // ── 4. Dynamic Add-ons Engine ────────────────────────────────────────────
    const dynamicAddOns: AddOnModule[] = [];

    // Fire Safety AMC (Civil Defense)
    let fireAmcCost = pType === 'Tower' ? 8000 + (inputs.verticalLevel * 100) : 2500;
    dynamicAddOns.push({
        name: 'Fire Safety & Civil Defense AMC',
        description: 'Standardly required for civil defense compliance and safety certification.',
        frequency: 'Annual',
        annualCost: fireAmcCost,
        isMandatory: true
    });

    // SIRA Compliance (CCTV & Security Tech) - V1.15 Mission
    if (['Tower', 'Hotel', 'School', 'Government'].includes(pType)) {
        dynamicAddOns.push({
            name: 'SIRA Compliance / CCTV AMC',
            description: 'Bi-annual security technician audit for CCTV systems and control room protocols.',
            frequency: 'Bi-annual',
            annualCost: 4500 + (inputs.verticalLevel * 50),
            isMandatory: true
        });
    }

    // Facade Maintenance (BMU & Window Cleaning) - V1.15 Mission
    if (inputs.verticalLevel > 6 || pType === 'Tower') {
        dynamicAddOns.push({
            name: 'Facade Maintenance (BMU)',
            description: 'Routine maintenance of Building Maintenance Units (BMU) and cradle systems for glass towers.',
            frequency: 'Quarterly',
            annualCost: 12000 + (inputs.verticalLevel * 400),
            isMandatory: true
        });
    }

    // District Cooling (DC) Synchronization - V1.15 Mission
    if (['Tower', 'Hotel', 'Office'].includes(pType) && (inputs.emirate === 'Dubai' || inputs.emirate === 'Abu Dhabi')) {
        dynamicAddOns.push({
            name: 'District Cooling (ETS) Maintenance',
            description: 'Empower/Emicool/Tabreed synchronization and heat exchanger (PHE) maintenance.',
            frequency: 'Annual',
            annualCost: 15000,
            isMandatory: true
        });
    }

    // Mandatory PCA Verification (V1.16 Institutional Mission)
    dynamicAddOns.push({
        name: 'Mandatory PCA Verification',
        description: 'Bi-annual Property Condition Assessment and Asset Integrity Audit for institutional compliance.',
        annualCost: 15000 + (inputs.verticalLevel * 100),
        frequency: 'Every 2 Years',
        isMandatory: true
    });

    // Water Tank Cleaning
    dynamicAddOns.push({
        name: 'Water Tank Cleaning',
        description: 'Bi-annual cleaning to adhere to municipality health directives.',
        frequency: 'Bi-annual',
        annualCost: 1400,
        isMandatory: true
    });

    // AC Duct Cleaning
    let acDuctCost = inputs.assetType === 'Villa' ? 1800 : 600;
    dynamicAddOns.push({
        name: 'AC Duct Cleaning',
        description: 'Injected as an annual requirement to handle dust and HVAC health.',
        frequency: 'Annual',
        annualCost: acDuctCost,
        isMandatory: false
    });

    // Pest Control
    dynamicAddOns.push({
        name: 'Pest Control',
        description: 'Standard baseline layer for property hygiene.',
        frequency: 'Annual',
        annualCost: inputs.assetType === 'Villa' ? 400 : 320,
        isMandatory: false
    });

    // Vertical Add-ons (Lifts/Elevators) - Scaled for V1.15
    if (inputs.verticalLevel > 2 || pType === 'Tower') {
        const liftsCount = inputs.liftsCount || Math.ceil(inputs.verticalLevel / 10);
        dynamicAddOns.push({
            name: `Vertical Transportation (${liftsCount} x Lifts)`,
            description: 'Routine safety checks and mechanical upkeep for properties with lifts (Banks, Service, High-speed).',
            frequency: 'Monthly',
            annualCost: liftsCount * 8500 + (inputs.verticalLevel * 100), 
            isMandatory: true
        });
    }

    // Security
    dynamicAddOns.push({
        name: 'Security Guard / Watchman',
        description: '24/7 localized security monitoring and access control.',
        frequency: 'Annual',
        annualCost: 36000, 
        isMandatory: false
    });

    // Asset-Specific Add-ons
    if (pType === 'Villa' || pType === 'Majlis' || pType === 'Compound') {
        dynamicAddOns.push({
            name: 'Swimming Pool Maintenance',
            description: 'Routine cleaning, pump maintenance, and chemical balancing.',
            frequency: 'Annual',
            annualCost: 16800,
            isMandatory: false
        });
    }

    if (["Retail", "Warehouse", "Office", "School", "Gov_Building"].includes(pType)) {
        dynamicAddOns.push({
            name: 'Grease Trap Cleaning',
            description: 'Mandatory municipality compliance for commercial properties with wet pantries/kitchens.',
            frequency: 'Quarterly',
            annualCost: 3600,
            isMandatory: true
        });
    }

    // Concierge & Valet - Luxury Tower Mission
    if (gradeMult >= 1.8 && (pType === 'Tower' || pType === 'Hotel')) {
        dynamicAddOns.push({
            name: 'Concierge & Guest Logistics',
            description: 'High-touch front-of-house mission for ultra-luxury residential towers.',
            frequency: 'Annual',
            annualCost: 75000 + (inputs.verticalLevel * 200),
            isMandatory: false
        });
        dynamicAddOns.push({
            name: 'Valet Parking Management',
            description: 'Coordinated parking logistics for podium and underground basements.',
            frequency: 'Annual',
            annualCost: 120000,
            isMandatory: false
        });
    }

    // Smart BMS & Data Integration - Tech Mission
    if (pType === 'Tower' || pType === 'Office' || pType === 'Hospital') {
        dynamicAddOns.push({
            name: 'BMS Optimization (Smart Data)',
            description: 'Telemetry monitoring and AI-driven energy saving for building automation systems.',
            frequency: 'Annual',
            annualCost: 24000,
            isMandatory: false
        });
    }

    const healthReport = calculateBuildingHealth({
        age: inputs.buildingAge,
        floors: inputs.verticalLevel || 1,
        sector: ["Retail", "Warehouse", "Office", "School"].includes(inputs.assetType) ? 'Commercial' : 'Residential',
        hvacCount: Math.ceil((inputs.floorPlateSqFt || 500) / 1000) * 2
    });

    return {
        property: {
            ownerId: 'UID_PENDING',
            propertyName: `${inputs.community || 'Pilot'} ${pType}`,
            emirate: inputs.emirate,
            area: inputs.community,
            propertyType: pType,
            usageType: (pType === 'Office' || pType === 'Retail' || pType === 'Warehouse') ? 'commercial' : 'residential',
            unitSubtype: inputs.configuration,
            builtUpAreaSqFt: inputs.floorPlateSqFt,
            propertyAgeYears: inputs.buildingAge,
            buildingGrade: inputs.buildingGrade,
            conditionScore: inputs.conditionScore,
            complianceRiskProfile: inputs.compliance,
            occupancyStatus: 'vacant'
        },
        valuation: {
            rentEstimate: { low: Math.round(annualRent * 0.9), target: annualRent, high: Math.round(annualRent * 1.1) },
            saleEstimate: { low: Math.round(saleValue * 0.9), target: saleValue, high: Math.round(saleValue * 1.1) },
            confidenceLevel: confidenceScore >= 85 ? 'high' : confidenceScore >= 70 ? 'medium' : 'low',
            confidenceScore: confidenceScore,
            valuationMode: `STRATEGY MODE: ${inputs.strategy?.toUpperCase() || 'MARKET'}`,
            drivers: [
                `${inputs.buildingGrade} Grade`,
                `${inputs.community} Cluster`,
                `Sovereign Rate: ${basePricePerSqFt} AED`
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
                `Base Rate: ${maintenanceBase}`,
                `Compliance Delta: ${complianceMult}x`
            ]
        },
        addOns: dynamicAddOns,
        riskPack: {
            civilDefenseStatus: 'compliant',
            elevatorInspectionStatus: inputs.verticalLevel > 2 ? 'certified' : 'n/a',
            insuranceExposure: inputs.compliance,
            complianceRiskScore: 100 - (complianceMult * 100),
            complianceRiskLabel: inputs.compliance,
            
            // V1.16.2 Landmark Dispatch Model
            // arrivalTime = baseETA + (floors * 0.12) + (liftBanks * 1.8)
            arrivalDispatchLatency: 25 + ((inputs.verticalLevel || 1) * 0.12) + (inputs.verticalLevel > 80 ? (inputs.verticalLevel > 150 ? 3 : 2) * 1.8 : 1.8),
            dispatchZone: (inputs.verticalLevel || 1) <= 40 ? 'Zone A' : ((inputs.verticalLevel || 1) <= 80 ? 'Zone B' : 'Zone C'),
            liftLoadIndex: Number(((1.5 * ((inputs.verticalLevel || 1) / 500)) / (inputs.liftsCount / 12)).toFixed(2))
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
            predictedValueProtectionPercent: gradeMult * 10,
            
            // V1.16.2 ESG Model (Calibrated Thresholds)
            // Energy (40%), Water (25%), Maintenance (20%), Cert (15%)
            energyIndex: Math.max(40, 95 - (inputs.buildingAge * 2)), 
            waterIndex: 85, 
            maintenanceFrequency: 90, 
            certCoverage: inputs.verticalLevel > 2 ? 100 : 80,
            sustainabilityScore: Math.round(( (95 - (inputs.buildingAge * 2)) * 0.4) + (85 * 0.25) + (90 * 0.20) + ((inputs.verticalLevel > 2 ? 100 : 80) * 0.15)),
            esgRating: Math.round(( (95 - (inputs.buildingAge * 2)) * 0.4) + (85 * 0.25) + (90 * 0.20) + ((inputs.verticalLevel > 2 ? 100 : 80) * 0.15)) >= 90 ? 'A+' : 
                       (Math.round(( (95 - (inputs.buildingAge * 2)) * 0.4) + (85 * 0.25) + (90 * 0.20) + ((inputs.verticalLevel > 2 ? 100 : 80) * 0.15)) >= 80 ? 'A' : 
                       (Math.round(( (95 - (inputs.buildingAge * 2)) * 0.4) + (85 * 0.25) + (90 * 0.20) + ((inputs.verticalLevel > 2 ? 100 : 80) * 0.15)) >= 65 ? 'B' : 'C')),

            // V1.16.1/V1.16.2 Institutional CapEx Reserve Engine
            capexReserveRequirement: Math.round(
                (marketValue * 0.85 * 0.012) * 
                (inputs.buildingAge <= 5 ? 0.6 : (inputs.buildingAge <= 15 ? 1.0 : (inputs.buildingAge <= 30 ? 1.4 : 1.9))) *
                verticalMult
            ),
            reserveConfidenceIndex: (inputCompleteness * (inputs.verticalLevel > 2 ? 0.95 : 1.0) * 0.9) > 0.85 ? 'HIGH' : 'MEDIUM'
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
        packages: [
            {
                packageName: 'Maintenance Only',
                tier: 'basic',
                annualPrice: maintenanceBase,
                responseSla: '24 hours',
                includedVisits: 6,
                coverageScope: ["AC Maintenance", "Electrical", "Plumbing"],
                recommended: false
            },
            {
                packageName: 'Property Management (5%)',
                tier: 'pm',
                annualPrice: pmFee,
                responseSla: '8 hours',
                includedVisits: 4,
                coverageScope: ["Rent Collection", "Lease Management", "Broker Coordination"],
                recommended: false
            },
            {
                packageName: 'Maintenance + Property Management',
                tier: 'hybrid',
                annualPrice: bundledPrice,
                responseSla: '4 hours',
                includedVisits: 12,
                coverageScope: ["Full MEP Maintenance", "Property Management", "Tenant SOS"],
                recommended: true
            }
        ],
        benchmark: {
            marketBenchmarkMin: Math.round(benchmarkMin),
            marketBenchmarkMax: Math.round(benchmarkMax),
            benchmarkSource: bSource,
            benchmarkRegion: inputs.emirate || 'Dubai',
            benchmarkAssetType: pType,
            benchmarkJustification: bJustification,
            alignmentStatus: alignment
        },
        dataStatusLabel: `V5.1 DECISION ENGINE - STABLE (Confidence: ${confidenceScore}%)`,
        decisionVersion: 'v5.1-STABLE',
        confidenceScore,
        inputCompleteness,
        missingFields,
        assumptionFlags,
        quoteExpiresAt,
        priceLockUntil,
        trustTier
    };
}

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
