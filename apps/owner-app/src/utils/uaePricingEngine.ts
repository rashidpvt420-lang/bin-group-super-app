import { db, collection, addDoc, serverTimestamp } from '../lib/firebase';
import { calculateBuildingHealth } from './buildingHealthEngine';

export type Emirate = 'Dubai' | 'Abu Dhabi' | 'Sharjah' | 'Ajman' | 'RAK' | 'Fujairah' | 'UAQ';
export type PropertyType = 'Residential' | 'Commercial' | 'Industrial' | 'Government';
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

// ── NEW: Compliance Mission Item ───────────────────────────────────────────────
export interface ComplianceMissionItem {
    trigger: string;
    mission: string;
    authority: string;
    frequency: string;
    mandatory: boolean;
    urgencyDays: number;
}

export interface IntegratedIntelligenceResponse {
    property: PropertyDoc;
    valuation: ValuationModule;
    fmQuote: FMQuoteModule;
    riskPack: RiskPackModule;
    forecast: MaintenanceForecastModule;
    insights: OwnerInsightsModule;
    package: QuotationPackageModule;
    // ── NEW MODULES ─────────────
    complianceMissions: ComplianceMissionItem[];
    geographyIntelligence: {
        districtTier: string;
        ownershipZone: 'Freehold' | 'Leasehold' | 'Government';
        towerComplexityFactor: number;
        locationMultiplier: number;
    };
    portfolioIntelligence: {
        portfolioDiscount: number;
        portfolioTier: string;
        portfolioDiscountAmount: number;
        institutionalFlag: boolean;
    };
    contractRecommendation: {
        recommendedTier: string;
        recommendedReason: string[];
        score: number;
    };
    savingsSimulation: {
        marketAverageAnnual: number;
        binGroupAnnual: number;
        savingsAmount: number;
        savingsPercent: number;
        efficiencyGain: string;
        complianceCoverageBoost: string;
    };
    // ── EXISTING ─────────────────
    dataStatusLabel: string;
    decisionVersion: string;
    confidenceScore: number;
    inputCompleteness: number;
    missingFields: string[];
    assumptionFlags: string[];
    quoteExpiresAt: string;
    priceLockUntil: string;
    trustTier: 'INSTITUTIONAL_HIGH' | 'VERIFIED_MEDIUM' | 'PRELIMINARY';
    packages?: any[];
    benchmark?: any;
}

// ── Geography Intelligence Layer ──────────────────────────────────────────────
const DISTRICT_TIERS: Record<string, { tier: string; mult: number; ownership: 'Freehold' | 'Leasehold' | 'Government' }> = {
    // Dubai Premium Districts
    'Palm Jumeirah':     { tier: 'ALPHA_ULTRA', mult: 2.10, ownership: 'Freehold' },
    'Downtown Dubai':    { tier: 'ALPHA_PRIME', mult: 1.60, ownership: 'Freehold' },
    'Dubai Marina':      { tier: 'ALPHA',       mult: 1.45, ownership: 'Freehold' },
    'Business Bay':      { tier: 'ALPHA',       mult: 1.25, ownership: 'Freehold' },
    'DIFC':              { tier: 'ALPHA_PRIME', mult: 1.55, ownership: 'Freehold' },
    'Jumeirah':          { tier: 'BETA_PLUS',   mult: 1.30, ownership: 'Freehold' },
    'Emirates Hills':    { tier: 'ALPHA_ULTRA', mult: 2.00, ownership: 'Freehold' },
    'Arabian Ranches':   { tier: 'BETA_PLUS',   mult: 1.20, ownership: 'Freehold' },
    'JBR':               { tier: 'ALPHA',       mult: 1.40, ownership: 'Freehold' },
    'JLT':               { tier: 'BETA_PLUS',   mult: 1.15, ownership: 'Freehold' },
    'Silicon Oasis':     { tier: 'BETA',        mult: 1.00, ownership: 'Freehold' },
    'International City':{ tier: 'GAMMA',       mult: 0.85, ownership: 'Leasehold' },
    'Discovery Gardens': { tier: 'GAMMA',       mult: 0.82, ownership: 'Leasehold' },
    'Al Quoz':           { tier: 'GAMMA',       mult: 0.75, ownership: 'Leasehold' },
    'Deira':             { tier: 'GAMMA',       mult: 0.78, ownership: 'Leasehold' },
    'Bur Dubai':         { tier: 'GAMMA',       mult: 0.80, ownership: 'Leasehold' },
    // Abu Dhabi
    'Saadiyat Island':   { tier: 'ALPHA_ULTRA', mult: 1.90, ownership: 'Freehold' },
    'Al Reem Island':    { tier: 'ALPHA',       mult: 1.50, ownership: 'Freehold' },
    'Yas Island':        { tier: 'ALPHA',       mult: 1.45, ownership: 'Freehold' },
    'Al Ain':            { tier: 'BETA',        mult: 0.90, ownership: 'Leasehold' },
    // Sharjah
    'Al Majaz':          { tier: 'BETA',        mult: 0.88, ownership: 'Leasehold' },
    'Al Nahda':          { tier: 'BETA',        mult: 0.85, ownership: 'Leasehold' },
    // Default
    'Default':           { tier: 'BETA',        mult: 1.00, ownership: 'Freehold' },
};

// ── Compliance Mission Generator ──────────────────────────────────────────────
const generateComplianceMissions = (inputs: any): ComplianceMissionItem[] => {
    const missions: ComplianceMissionItem[] = [];
    
    // Always mandatory
    missions.push({
        trigger: 'ALL PROPERTIES',
        mission: 'Annual Fire Safety Inspection & Civil Defense Certificate',
        authority: 'Dubai Civil Defense (DCD)',
        frequency: 'Annual',
        mandatory: true,
        urgencyDays: 30
    });

    if (inputs.fireAlarm) {
        missions.push({
            trigger: 'Fire Alarm System',
            mission: 'Fire Alarm System Preventive Maintenance & Certification',
            authority: 'Dubai Civil Defense (DCD)',
            frequency: 'Quarterly',
            mandatory: true,
            urgencyDays: 15
        });
    }
    
    if (inputs.verticalLevel > 2 || inputs.liftsCount > 0 || inputs.escalators) {
        missions.push({
            trigger: 'Lifts / Elevators',
            mission: 'Elevator & Escalator Annual Safety Inspection',
            authority: 'Dubai Municipality (DM) — Elevator Section',
            frequency: 'Annual + Monthly PM',
            mandatory: true,
            urgencyDays: 63
        });
    }
    
    if (inputs.tank) {
        missions.push({
            trigger: 'Water Storage Tank',
            mission: 'Water Tank Sterilization & DM Cleaning Certificate',
            authority: 'Dubai Municipality (DM)',
            frequency: 'Quarterly',
            mandatory: true,
            urgencyDays: 120
        });
    }
    
    if (inputs.centralLPG) {
        missions.push({
            trigger: 'Central LPG System',
            mission: 'LPG Network Annual Inspection & Authority Certification',
            authority: 'Dubai Supply & Business Dept. (DSBD)',
            frequency: 'Annual',
            mandatory: true,
            urgencyDays: 45
        });
    }
    
    if (inputs.bmu) {
        missions.push({
            trigger: 'BMU / Façade System',
            mission: 'Building Maintenance Unit (BMU) Annual Certification',
            authority: 'Dubai Municipality — Building Safety',
            frequency: 'Annual',
            mandatory: true,
            urgencyDays: 90
        });
    }
    
    if (inputs.sira) {
        missions.push({
            trigger: 'CCTV / Security System',
            mission: 'CCTV System Annual Maintenance & SIRA Compliance Audit',
            authority: 'Security Industry Regulatory Agency (SIRA)',
            frequency: 'Annual',
            mandatory: true,
            urgencyDays: 45
        });
    }
    
    if (inputs.pool) {
        missions.push({
            trigger: 'Swimming Pool',
            mission: 'Pool Water Quality Certificate & Civil Defense Compliance',
            authority: 'Dubai Municipality (DM)',
            frequency: 'Monthly Sampling + Annual Cert',
            mandatory: true,
            urgencyDays: 30
        });
    }
    
    if (inputs.firePump) {
        missions.push({
            trigger: 'Fire Pump System',
            mission: 'Fire Pump Inspection & Flow Test Certification',
            authority: 'Dubai Civil Defense (DCD)',
            frequency: 'Bi-Annual',
            mandatory: true,
            urgencyDays: 60
        });
    }
    
    if (inputs.districtCooling) {
        missions.push({
            trigger: 'District Cooling',
            mission: 'DC Heat Exchanger Flush & Interface Efficiency Audit',
            authority: 'District Cooling Provider (EMICOOL/EMPOWER)',
            frequency: 'Annual',
            mandatory: false,
            urgencyDays: 180
        });
    }

    if (inputs.assetType === 'Commercial' || inputs.propertyType === 'Commercial') {
        missions.push({
            trigger: 'Commercial Asset',
            mission: 'Health & Safety Audit (OSHAD / OSHA UAE Compliance)',
            authority: 'OSHAD / Dubai Municipality',
            frequency: 'Annual',
            mandatory: true,
            urgencyDays: 60
        });
    }

    if (inputs.assetType === 'Mixed-Use' || inputs.propertyType === 'Mixed-Use' || inputs.useType === 'Mixed') {
        missions.push({
            trigger: 'Mixed-Use Asset',
            mission: 'Hybrid Zoning Safety Audit & Dual-Use Compliance Certification',
            authority: 'Dubai Municipality / RERA / Civil Defense',
            frequency: 'Annual',
            mandatory: true,
            urgencyDays: 45
        });
        missions.push({
            trigger: 'Hybrid Allocation',
            mission: 'Utility Load Verification (Commercial vs Residential Balancing)',
            authority: 'DEWA / ADDC',
            frequency: 'Annual',
            mandatory: false,
            urgencyDays: 120
        });
    }

    // ── MAJLIS-SPECIFIC COMPLIANCE MISSIONS ───────────────────────────────────
    if (inputs.majlis || inputs.propertyType === 'Majlis') {
        missions.push({
            trigger: 'Majlis Asset',
            mission: 'Majlis HVAC & Cooling Load Audit (Enhanced Capacity Check)',
            authority: 'DEWA / ADDC / Asset Owner',
            frequency: 'Annual + Pre-Season',
            mandatory: true,
            urgencyDays: 30
        });
        if (inputs.majlisType === 'royal' || inputs.majlisType === 'government') {
            missions.push({
                trigger: 'Institutional Majlis',
                mission: 'Sovereign Protocol Readiness & VIP Safety Sign-off',
                authority: 'Asset Manager / Protocol Office / Presidential Court',
                frequency: 'Per Event + Annual',
                mandatory: true,
                urgencyDays: 7
            });
            missions.push({
                trigger: 'Government Majlis',
                mission: 'Estidama PBR (Pearl Building Rating) Compliance Audit',
                authority: 'Abu Dhabi Department of Municipalities and Transport',
                frequency: 'Annual',
                mandatory: true,
                urgencyDays: 90
            });
        }
        if (inputs.majlisType === 'estate') {
            missions.push({
                trigger: 'Estate Majlis',
                mission: 'Agricultural & Irrigation System Efficiency Audit',
                authority: 'Municipality / Asset Owner',
                frequency: 'Quarterly',
                mandatory: true,
                urgencyDays: 45
            });
        }
        if (inputs.heritageSensitivity === 'Protected' || inputs.heritageSensitivity === 'Royal') {
            missions.push({
                trigger: 'Heritage Sensitivity',
                mission: 'Cultural Heritage Fabric Conservation Assessment',
                authority: 'Dubai Culture / DCT Abu Dhabi',
                frequency: 'Annual',
                mandatory: true,
                urgencyDays: 120
            });
        }
        if (inputs.sira) {
            missions.push({
                trigger: 'Majlis CCTV',
                mission: 'Majlis SIRA-Grade CCTV Maintenance & Privacy Compliance Audit',
                authority: 'Security Industry Regulatory Agency (SIRA)',
                frequency: 'Annual',
                mandatory: true,
                urgencyDays: 45
            });
        }
        if (inputs.majlisGarden) {
            missions.push({
                trigger: 'Majlis Garden',
                mission: 'Landscape Irrigation System Audit & Water Conservation Check',
                authority: 'DEWA / Asset Manager',
                frequency: 'Bi-Annual',
                mandatory: false,
                urgencyDays: 90
            });
        }
    }

    return missions.sort((a, b) => a.urgencyDays - b.urgencyDays);
};

// ── Contract Recommendation Engine ───────────────────────────────────────────
const generateContractRecommendation = (inputs: any, gradeMult: number, missions: ComplianceMissionItem[]): {
    recommendedTier: string;
    recommendedReason: string[];
    score: number;
} => {
    let score = 0;
    const reasons: string[] = [];

    if (gradeMult >= 1.8) { score += 30; reasons.push('Luxury/Ultra-Luxury grade requires full FM coverage'); }
    if (missions.length >= 5) { score += 25; reasons.push(`${missions.length} mandatory compliance missions detected`); }
    if ((inputs.buildingAge || 0) > 10) { score += 20; reasons.push('Asset age > 10 years — reactive costs rising'); }
    if (inputs.districtCooling) { score += 10; reasons.push('District Cooling interface requires specialist management'); }
    if (inputs.pool || inputs.bmu) { score += 10; reasons.push('High-complexity systems (Pool/BMU) detected'); }
    if (inputs.strategy === 'rent') { score += 15; reasons.push('Rental yield strategy — Zero-call model maximizes tenant retention'); }
    if ((inputs.floors || inputs.verticalLevel || 1) > 20) { score += 10; reasons.push('High-rise vertical complexity detected'); }
    if (inputs.majlis || inputs.propertyType === 'Majlis') {
        score += 30;
        const mjType = inputs.majlisType || 'private';
        reasons.push(mjType === 'royal' ? 'Royal/Sovereign Majlis — full FM + hospitality readiness required'
            : mjType === 'estate' ? 'Estate Majlis — premium grounds & HVAC management required'
            : 'Majlis asset — enhanced cooling & deep-care package recommended');
    }

    let tier: string;
    if (score >= 70) {
        tier = 'SOVEREIGN HYBRID (Maintenance + PM)';
    } else if (score >= 40) {
        tier = 'PREMIUM MAINTENANCE CONTRACT';
    } else {
        tier = 'MAINTENANCE ONLY CONTRACT';
    }

    return { recommendedTier: tier, recommendedReason: reasons, score };
};

// ── Portfolio Discount Logic ──────────────────────────────────────────────────
const calculatePortfolioIntelligence = (portfolioCount: number, basePrice: number, isGovt: boolean): {
    portfolioDiscount: number;
    portfolioTier: string;
    portfolioDiscountAmount: number;
    institutionalFlag: boolean;
} => {
    let discount = 0;
    let tier = 'SINGLE ASSET';
    const institutionalFlag = isGovt || portfolioCount >= 5;

    if (isGovt) {
        discount = 0.15;
        tier = 'GOVERNMENT INSTITUTIONAL';
    } else if (portfolioCount >= 10) {
        discount = 0.12;
        tier = 'PORTFOLIO SOVEREIGN (10+)';
    } else if (portfolioCount >= 7) {
        discount = 0.10;
        tier = 'PORTFOLIO ELITE (7+)';
    } else if (portfolioCount >= 3) {
        discount = 0.05;
        tier = 'PORTFOLIO STANDARD (3+)';
    }

    return {
        portfolioDiscount: discount,
        portfolioTier: tier,
        portfolioDiscountAmount: Math.round(basePrice * discount),
        institutionalFlag
    };
};

export const calculateUAEValuation = async (inputs: any): Promise<IntegratedIntelligenceResponse> => {
    console.log("🚀 BIN-GROUP [DECISION ENGINE v6.0-INSTITUTIONAL]:", inputs);

    // ── 1. Asset Intelligence Layer ──────────────────────────────────────────
    const emirateMultipliers: Record<string, number> = {
        'Dubai': 1.0, 'Abu Dhabi': 1.1, 'Sharjah': 0.85, 'Ajman': 0.75, 
        'RAK': 0.80, 'Fujairah': 0.70, 'UAQ': 0.65
    };

    // ── 1a. Geography Intelligence — District Tier Lookup ─────────────────────
    const community = inputs.community || inputs.area || 'Default';
    const districtData = DISTRICT_TIERS[community] || DISTRICT_TIERS['Default'];
    const communityMult = districtData.mult;
    const districtTier = districtData.tier;
    const ownershipZone = districtData.ownership;

    // Tower Complexity Factor: based on floors and system count
    const systemCount = [inputs.fireAlarm, inputs.firePump, inputs.hvac, inputs.districtCooling, 
                         inputs.escalators, inputs.centralLPG, inputs.bmu, inputs.sira, inputs.gen, inputs.wasteMan]
        .filter(Boolean).length;
    const towerComplexityFactor = Math.round((1 + (Math.min(inputs.verticalLevel || inputs.floors || 1, 100) * 0.003) + (systemCount * 0.02)) * 100) / 100;
    const locationMultiplier = Math.round((emirateMultipliers[inputs.emirate] || 1.0) * communityMult * 100) / 100;

    const gradeMultipliers: Record<string, number> = {
        'Ultra-Luxury': 2.50, 'Luxury': 1.80, 'Premium': 1.30, 'Standard': 1.0,
        'Ultra': 2.50  // backwards compat
    };

    const exposureMultipliers: Record<string, number> = {
        'Street': 0.95, 'Community': 1.0, 'Pool': 1.10, 'Park': 1.15, 
        'Sea': 1.40, 'Skyline': 1.30, 'Golf': 1.35, 'Burj Khalifa': 1.55
    };

    const complianceAdjusters: Record<string, number> = {
        'low_risk': 1.02, 'medium_risk': 0.95, 'high_risk': 0.85
    };

    const emirateMult    = emirateMultipliers[inputs.emirate] || 1.0;
    const gradeMult      = gradeMultipliers[inputs.buildingGrade] || 1.0;
    const exposureMult   = exposureMultipliers[inputs.exposure] || 1.0;
    const verticalMult   = 1 + (Math.min(inputs.verticalLevel || inputs.floors || 1, 60) * 0.005);
    const complianceMult = complianceAdjusters[inputs.compliance] || 1.0;
    const ageDepreciation = Math.max(0.75, 1 - ((inputs.buildingAge || inputs.age || 0) * 0.01));
    const furnishingMult = inputs.furnished ? 1.15 : 1.0;

    // High Risk System Multiplier
    let riskSystemMult = 1.0;
    if (inputs.fireAlarm)   riskSystemMult += 0.05;
    if (inputs.firePump)    riskSystemMult += 0.05;
    if (inputs.escalators)  riskSystemMult += 0.10;
    if (inputs.centralLPG)  riskSystemMult += 0.05;
    if (inputs.wasteMan)    riskSystemMult += 0.03;
    if (inputs.gen)         riskSystemMult += 0.05;
    if (inputs.hvac)        riskSystemMult += 0.15;
    if (inputs.pool)        riskSystemMult += 0.05;
    if (inputs.sira)        riskSystemMult += 0.03;

    // ── Majlis Institutional Premium Uplift ───────────────────────────────────
    let majlisMult = 1.0;
    if (inputs.majlis || inputs.propertyType === 'Majlis' || inputs.subType === 'Majlis') {
        const majlisType = inputs.majlisType || 'private';
        const majlisBaseMultipliers: Record<string, number> = {
            'royal': 1.65,      // Sovereign Royal Majlis
            'government': 1.55, // Institutional Government Majlis
            'event': 1.45,      // Commercial Event Majlis
            'estate': 1.35,     // Private Estate / Farm Majlis
            'private': 1.15,    // Standard Villa Majlis
            'none': 1.0
        };
        
        majlisMult = majlisBaseMultipliers[majlisType] || 1.15;

        // Heritage Sensitivity Uplift
        if (inputs.heritageSensitivity === 'Royal') majlisMult += 0.20;
        else if (inputs.heritageSensitivity === 'Protected') majlisMult += 0.15;
        else if (inputs.heritageSensitivity === 'Cultural') majlisMult += 0.10;

        // Abu Dhabi / Al Ain geographic premium (Capital Hub Adjustment)
        if (['Abu Dhabi', 'Al Ain'].includes(inputs.emirate)) {
            majlisMult *= 1.12; 
        }
        
        // Sustainability & Infrastructure Scoring
        if (inputs.solarIntegration) majlisMult += 0.05;
        if (inputs.evReadiness || (inputs.parkingCapacity && inputs.parkingCapacity > 10)) majlisMult += 0.03;
        if (inputs.irrigationSystem) majlisMult += 0.02;
    }

    // Apply tower complexity to final multiplier
    const strategyMult = inputs.strategy === 'rent' ? 1.05 : inputs.strategy === 'fm' ? 0.95 : 1.0;
    const totalAssetMultiplier = emirateMult * communityMult * gradeMult * exposureMult * verticalMult 
        * complianceMult * ageDepreciation * furnishingMult * riskSystemMult * majlisMult * strategyMult * towerComplexityFactor;

    // ── 2. Strategy Layer ────────────────────────────────────────────────────
    const sqft = inputs.floorPlateSqFt || inputs.sqft || 1200;
    const condScore = inputs.conditionScore || 7;
    const basePricePerSqFt = 1200;
    const marketValue = Math.round(basePricePerSqFt * totalAssetMultiplier * sqft * (condScore / 10));
    
    const annualRent      = Math.round(marketValue * 0.065);
    const maintenanceBase = Math.round(marketValue * 0.012);
    const pmFee           = Math.round(annualRent * 0.05);

    // Apply Majlis AMC overrides if applicable (Price Floor Protection)
    let finalMaintenanceBase = maintenanceBase;
    if (inputs.majlis || inputs.propertyType === 'Majlis') {
        const majlisType = inputs.majlisType || 'private';
        const minAMCMap: Record<string, number> = {
            'private': 15,
            'estate': 22,
            'government': 28,
            'royal': 35,
            'event': 30
        };
        const minAMC = (minAMCMap[majlisType] || 15) * sqft;
        if (finalMaintenanceBase < minAMC) {
            finalMaintenanceBase = minAMC;
        }
    }

    const bundledPrice    = Math.round((finalMaintenanceBase + pmFee) * 0.90);

    // ── 3. Portfolio Intelligence ─────────────────────────────────────────────
    const portfolioCount = inputs.portfolioCount || 1;
    const isGovt = inputs.propertyType === 'Government';
    const portfolioIntelligence = calculatePortfolioIntelligence(portfolioCount, bundledPrice, isGovt);
    const finalBundledPrice = Math.round(bundledPrice * (1 - portfolioIntelligence.portfolioDiscount));

    // ── 4. Compliance Missions ────────────────────────────────────────────────
    const complianceMissions = generateComplianceMissions(inputs);

    // ── 5. Contract Recommendation ────────────────────────────────────────────
    const contractRecommendation = generateContractRecommendation(inputs, gradeMult, complianceMissions);

    // ── 6. Live Savings Simulation ────────────────────────────────────────────
    const marketAverageAnnual = Math.round(maintenanceBase * 1.45); // market avg is ~45% higher reactive
    const binGroupAnnual = finalBundledPrice;
    const savingsAmount = Math.max(0, marketAverageAnnual - binGroupAnnual);
    const savingsPercent = marketAverageAnnual > 0 ? Math.round((savingsAmount / marketAverageAnnual) * 100) : 0;
    const complianceMissionCount = complianceMissions.filter(m => m.mandatory).length;

    // ── 7. Confidence & Completeness ─────────────────────────────────────────
    let confidenceScore = 100;
    const missingFields: string[] = [];
    const assumptionFlags: string[] = [];
    if (!inputs.verticalLevel && !inputs.floors)  { confidenceScore -= 10; missingFields.push('verticalLevel'); assumptionFlags.push('defaultMidLevelApplied'); }
    if (!inputs.conditionScore && !inputs.condition) { confidenceScore -= 10; missingFields.push('conditionScore'); assumptionFlags.push('standardConditionCurveUsed'); }
    if (!inputs.exposure)   { confidenceScore -= 10; missingFields.push('exposure'); assumptionFlags.push('baselineExposureApplied'); }
    if (!inputs.buildingAge && !inputs.age) { confidenceScore -= 10; missingFields.push('buildingAge'); assumptionFlags.push('ageEstimatedFromCommunityAvg'); }
    if (districtTier === 'BETA' && community === 'Default') { confidenceScore -= 5; assumptionFlags.push('districtDefaultApplied'); }

    const inputCompleteness = Math.max(0, (15 - missingFields.length) / 15);

    const now = new Date();
    const quoteExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const priceLockUntil = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
    const trustTier = confidenceScore >= 90 ? 'INSTITUTIONAL_HIGH' : confidenceScore >= 75 ? 'VERIFIED_MEDIUM' : 'PRELIMINARY';

    const saleValue = marketValue;

    const healthReport = calculateBuildingHealth({
        age: inputs.buildingAge || inputs.age || 0,
        floors: inputs.verticalLevel || inputs.floors || 1,
        sector: (inputs.assetType === 'Office' || inputs.propertyType === 'Commercial') ? 'Commercial' : 'Residential',
        hvacCount: Math.ceil(sqft / 1000) * 2
    });

    // ── 8. Package Matrix ─────────────────────────────────────────────────────
    const packages = [
        {
            packageName: 'Maintenance Only',
            tier: 'maintenance',
            annualPrice: maintenanceBase,
            monthlyPrice: Math.round(maintenanceBase / 12),
            responseSla: '8 hours',
            includedVisits: 6,
            recommended: contractRecommendation.recommendedTier.includes('MAINTENANCE ONLY'),
            features: [
                'Preventive Maintenance (6 visits/year)',
                'Emergency Response (8hr SLA)',
                'Civil Defense Compliance',
                'Monthly Health Reports',
            ]
        },
        {
            packageName: 'Premium Gold',
            tier: 'premium',
            annualPrice: finalBundledPrice,
            monthlyPrice: Math.round(finalBundledPrice / 12),
            responseSla: '4 hours',
            includedVisits: 12,
            recommended: contractRecommendation.recommendedTier.includes('PREMIUM'),
            features: [
                'Full Preventive Maintenance (12 visits/year)',
                '4-Hour Emergency Response SLA',
                'All Mandatory Compliance Missions Covered',
                'Digital Asset Health Dashboard',
                `${complianceMissionCount} Regulatory Certifications Managed`,
                portfolioIntelligence.portfolioDiscount > 0 
                    ? `Portfolio Discount: ${(portfolioIntelligence.portfolioDiscount * 100).toFixed(0)}% Applied`
                    : 'Zero-Call Resident Experience',
            ]
        },
        {
            packageName: 'Hybrid Bundle',
            tier: 'sovereign',
            annualPrice: Math.round(finalBundledPrice + pmFee),
            monthlyPrice: Math.round((finalBundledPrice + pmFee) / 12),
            responseSla: '2 hours',
            includedVisits: 24,
            recommended: contractRecommendation.recommendedTier.includes('HYBRID'),
            features: [
                'Full FM + Property Management (24 visits)',
                '2-Hour SLA — Sovereign Response Protocol',
                'Tenant Lifecycle Management',
                'DLD, RERA, ADM Regulatory Interface',
                'Lease Management & Yield Optimization',
                `Portfolio Intelligence — ${portfolioIntelligence.portfolioTier}`,
                'Quarterly P&L Reports'
            ]
        }
    ];

    // ── 9. Benchmark Data ─────────────────────────────────────────────────────
    const benchmark = {
        benchmarkSource: `DLD / RERA ${inputs.emirate || 'Dubai'} Market Index`,
        benchmarkRegion: districtTier,
        alignmentStatus: savingsPercent > 10 ? 'BELOW_MARKET' : savingsPercent < -5 ? 'PREMIUM' : 'ALIGNED',
        marketBenchmarkMin: Math.round(marketAverageAnnual * 0.85),
        marketBenchmarkMax: Math.round(marketAverageAnnual * 1.15),
        benchmarkJustification: `Based on ${districtTier} district comps for ${inputs.buildingGrade || 'Premium'} grade assets in ${community}.`
    };

    return {
        property: {
            ownerId: 'UID_PENDING',
            propertyName: `${community} ${inputs.assetType || inputs.subType || 'Asset'}`,
            emirate: inputs.emirate,
            area: community,
            propertyType: inputs.assetType || inputs.propertyType || 'Residential',
            usageType: inputs.strategy === 'rent' ? 'rental' : 'owner_occupied',
            unitSubtype: inputs.configuration || inputs.subType || 'Apartment',
            builtUpAreaSqFt: sqft,
            propertyAgeYears: inputs.buildingAge || inputs.age || 0,
            buildingGrade: inputs.buildingGrade || 'Premium',
            viewType: inputs.exposure || 'Community',
            conditionScore: condScore,
            complianceRiskProfile: inputs.compliance || 'low_risk',
            occupancyStatus: 'vacant'
        },
        valuation: {
            rentEstimate: { low: Math.round(annualRent * 0.9), target: annualRent, high: Math.round(annualRent * 1.1) },
            saleEstimate: { low: Math.round(saleValue * 0.9), target: saleValue, high: Math.round(saleValue * 1.1) },
            confidenceLevel: confidenceScore >= 85 ? 'high' : confidenceScore >= 70 ? 'medium' : 'low',
            confidenceScore,
            valuationMode: `STRATEGY MODE: ${(inputs.strategy || 'rent').toUpperCase()} | ${districtTier}`,
            drivers: [
                `${inputs.buildingGrade} Grade (${gradeMult}x)`,
                `${community} — ${districtTier} District (${communityMult}x)`,
                `${ownershipZone} Zone`,
                `Tower Complexity Factor: ${towerComplexityFactor}x`,
                inputs.furnished ? 'Fully Furnished Premium' : 'Unfurnished Base'
            ]
        },
        fmQuote: {
            annualEstimate: { low: maintenanceBase, target: finalBundledPrice, high: maintenanceBase + pmFee },
            riskTier: inputs.compliance === 'low_risk' ? 'low' : 'medium',
            recommendedPackageTier: contractRecommendation.recommendedTier,
            drivers: [
                `FM Ratio: 1.2% of market value`,
                `Portfolio Tier: ${portfolioIntelligence.portfolioTier}`,
                `Compliance Missions: ${complianceMissions.length}`,
                `Age Depreciation: ${ageDepreciation.toFixed(2)}x`
            ]
        },
        riskPack: {
            civilDefenseStatus: 'compliant',
            elevatorInspectionStatus: (inputs.verticalLevel || inputs.floors || 1) > 2 ? 'certified' : 'n/a',
            insuranceExposure: inputs.compliance || 'low_risk',
            complianceRiskScore: complianceMissions.filter(m => m.mandatory).length * 8,
            complianceRiskLabel: complianceMissions.length > 5 ? 'HIGH_COMPLEXITY' : complianceMissions.length > 2 ? 'MEDIUM' : 'LOW'
        },
        forecast: {
            oneYearReactiveCost: Math.round(maintenanceBase * 1.5),
            oneYearContractCost: finalBundledPrice,
            oneYearSavings: Math.round(maintenanceBase * 0.5),
            fiveYearReactiveCost: Math.round(maintenanceBase * 1.5 * 5),
            fiveYearContractCost: Math.round(finalBundledPrice * 5),
            fiveYearSavings: Math.round(maintenanceBase * 0.5 * 5),
            forecastConfidence: 'high'
        },
        insights: {
            buildingHealthScore: healthReport.overallScore,
            healthTrend: 'stable',
            assetLifecycleStage: (inputs.buildingAge || inputs.age || 0) < 5 ? 'early' : (inputs.buildingAge || inputs.age || 0) < 15 ? 'mid' : 'mature',
            liquidityScore: communityMult >= 1.4 ? 'high' : 'medium',
            rentalDemandScore: communityMult >= 1.2 ? 'exceptional' : 'strong',
            nextMajorServiceWindowMonths: 12,
            predictedValueProtectionPercent: Math.round(gradeMult * 10)
        },
        package: {
            packageName: packages[2].recommended ? 'Hybrid Bundle' : 'Premium Gold',
            tier: packages[2].recommended ? 'sovereign' : 'premium',
            annualPrice: finalBundledPrice,
            responseSla: packages[2].recommended ? '2 hours' : '4 hours',
            includedVisits: packages[2].recommended ? 24 : 12,
            coverageScope: ['AC Maintenance', 'Electrical', 'Plumbing', 'Property Management', 'Compliance Missions'],
            recommended: true
        },
        // ── NEW MODULES ─────────────────────────────────────────────────────────
        complianceMissions,
        geographyIntelligence: {
            districtTier,
            ownershipZone,
            towerComplexityFactor,
            locationMultiplier
        },
        portfolioIntelligence,
        contractRecommendation,
        savingsSimulation: {
            marketAverageAnnual,
            binGroupAnnual,
            savingsAmount,
            savingsPercent,
            efficiencyGain: `+${savingsPercent}%`,
            complianceCoverageBoost: `+${complianceMissionCount * 7}%`
        },
        // ── EXISTING ────────────────────────────────────────────────────────────
        packages,
        benchmark,
        dataStatusLabel: `V6.0 INSTITUTIONAL ENGINE — ${districtTier} | Missions: ${complianceMissions.length} | Confidence: ${confidenceScore}%`,
        decisionVersion: 'v6.0-INSTITUTIONAL',
        confidenceScore,
        inputCompleteness,
        missingFields,
        assumptionFlags,
        quoteExpiresAt,
        priceLockUntil,
        trustTier
    };
};

export const calculatePortfolioValuation = async (properties: any[]): Promise<IntegratedIntelligenceResponse> => {
    console.log("🚀 BIN-GROUP [PORTFOLIO ENGINE v6.0]: Analyzing", properties.length, "assets");
    
    const results = await Promise.all(properties.map(p => calculateUAEValuation(p)));
    
    // Aggregation Logic
    const totalAnnualPrice = results.reduce((sum, r) => sum + r.package.annualPrice, 0);
    const totalUnits = properties.reduce((sum, p) => sum + (p.units || 1), 0);
    const totalSqFt = properties.reduce((sum, p) => sum + (p.sqft || 0), 0);
    const missionCount = results.reduce((sum, r) => sum + r.complianceMissions.length, 0);
    
    // Portfolio Discount (5% for 3+, 10% for 7+, 15% for 20+)
    // 🚨 SOVEREIGN RULE: Royal/Government Majlis assets require dedicated protocol teams; zero portfolio discount permitted.
    const hasSovereignAsset = properties.some(p => p.majlisType === 'royal' || p.majlisType === 'government');
    
    let portfolioDiscount = 0;
    if (!hasSovereignAsset) {
        if (properties.length >= 20) portfolioDiscount = 0.15;
        else if (properties.length >= 7) portfolioDiscount = 0.10;
        else if (properties.length >= 3) portfolioDiscount = 0.05;
    }

    const finalAnnualPrice = Math.round(totalAnnualPrice * (1 - portfolioDiscount));
    
    // Use the first result as a template but override pricing and summary
    const portfolioResult = { ...results[0] };
    
    portfolioResult.package = {
        ...portfolioResult.package,
        annualPrice: finalAnnualPrice,
        packageName: properties.length > 5 ? 'Institutional Portfolio Package' : 'Sovereign Portfolio Bundle'
    };

    // Recalculate packages for the whole portfolio
    portfolioResult.packages = results[0]?.packages?.map((pkg: any, i: number) => {
        const baseTotal = results.reduce((sum, r) => sum + (r.packages?.[i]?.annualPrice || 0), 0);
        const discounted = Math.round(baseTotal * (1 - portfolioDiscount));
        return {
            ...pkg,
            annualPrice: discounted,
            monthlyPrice: Math.round(discounted / 12)
        };
    });

    portfolioResult.portfolioIntelligence = {
        portfolioDiscount,
        portfolioTier: properties.length > 10 ? 'INSTITUTIONAL_ULTRA' : 'PORTFOLIO_ALPHA',
        portfolioDiscountAmount: Math.round(totalAnnualPrice * portfolioDiscount),
        institutionalFlag: properties.length >= 5
    };

    portfolioResult.contractRecommendation = {
        recommendedTier: properties.length > 10 ? 'INSTITUTIONAL HYBRID (Full PM)' : 'PREMIUM PORTFOLIO MAINTENANCE',
        recommendedReason: [
            `Consolidated management of ${properties.length} assets`,
            `${missionCount} regulatory missions detected in portfolio`,
            `Estimated ${Math.round(portfolioDiscount * 100)}% portfolio efficiency gain`
        ],
        score: Math.min(100, 70 + (properties.length * 2))
    };

    return portfolioResult;
};

export const savePricingAudit = async (ownerId: string, propertyData: any, result: IntegratedIntelligenceResponse) => {
    try {
        await addDoc(collection(db, 'pricingAuditLogs'), {
            ownerId,
            propertyId: propertyData.id || 'lead_quote',
            engineType: 'decision_engine_v6_institutional',
            districtTier: result.geographyIntelligence?.districtTier,
            portfolioTier: result.portfolioIntelligence?.portfolioTier,
            complianceMissionCount: result.complianceMissions?.length,
            summary: `${result.property.propertyName} - ${result.valuation.valuationMode}`,
            result,
            createdAt: serverTimestamp()
        });
    } catch (e) {
        console.error("Audit log failed:", e);
    }
};
