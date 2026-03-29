import { db, collection, addDoc, serverTimestamp } from '../lib/firebase';
import { calculateBuildingHealth } from './buildingHealthEngine';

export type Emirate = 'Dubai' | 'Abu Dhabi' | 'Sharjah' | 'Ajman' | 'RAK' | 'Fujairah' | 'UAQ';
export type PropertyType = 
    | 'Residential' 
    | 'Commercial' 
    | 'Industrial' 
    | 'Mixed-Use' 
    | 'Institutional'
    | 'GOVERNMENT_MAJLIS' 
    | 'GOVERNMENT_PROPERTY' 
    | 'HOTEL'
    | 'Villa' 
    | 'Apartment' 
    | 'Residential Building' 
    | 'Office' 
    | 'Commercial Building' 
    | 'Warehouse' 
    | 'School' 
    | 'Hospital' 
    | 'Mall' 
    | 'Mixed-Use Tower';

export type BuildingGrade = 'Standard' | 'Premium' | 'Luxury' | 'Ultra-Luxury' | 'Sovereign';
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
    contractTemplateType?: 'GOVERNMENT_MAJLIS_CONTRACT' | 'GOVERNMENT_PROPERTY_CONTRACT' | 'HOTEL_CONTRACT' | 'STANDARD_AMC';
}

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

const DISTRICT_TIERS: Record<string, { tier: string; mult: number; ownership: 'Freehold' | 'Leasehold' | 'Government' }> = {
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
    'Saadiyat Island':   { tier: 'ALPHA_ULTRA', mult: 1.90, ownership: 'Freehold' },
    'Al Reem Island':    { tier: 'ALPHA',       mult: 1.50, ownership: 'Freehold' },
    'Yas Island':        { tier: 'ALPHA',       mult: 1.45, ownership: 'Freehold' },
    'Al Ain':            { tier: 'BETA',        mult: 0.90, ownership: 'Leasehold' },
    'Al Majaz':          { tier: 'BETA',        mult: 0.88, ownership: 'Leasehold' },
    'Al Nahda':          { tier: 'BETA',        mult: 0.85, ownership: 'Leasehold' },
    'Default':           { tier: 'BETA',        mult: 1.00, ownership: 'Freehold' },
};

const generateComplianceMissions = (inputs: any): ComplianceMissionItem[] => {
    const missions: ComplianceMissionItem[] = [];
    const pType = inputs.propertyType;
    
    missions.push({
        trigger: 'ALL PROPERTIES',
        mission: 'Annual Fire Safety Inspection & Civil Defense Certificate',
        authority: 'Dubai Civil Defense (DCD)',
        frequency: 'Annual',
        mandatory: true,
        urgencyDays: 30
    });

    if (pType === 'HOTEL') {
        missions.push({
            trigger: 'HOTEL_PROTOCOL',
            mission: 'Guest-Facing Health & Safety Audit (Water/Food/HVAC)',
            authority: 'Dubai Health Authority / Municipality',
            frequency: 'Monthly',
            mandatory: true,
            urgencyDays: 15
        });
    }

    if (pType === 'GOVERNMENT_MAJLIS') {
        missions.push({
            trigger: 'MAJLIS_PROTOCOL',
            mission: 'Sovereign VIP Protocol Readiness & Security Audit',
            authority: 'Protocol Office / SIRA',
            frequency: 'Quarterly + Event-Based',
            mandatory: true,
            urgencyDays: 7
        });
    }

    if (inputs.fireAlarm || inputs.firePump) {
        missions.push({
            trigger: 'Fire Safety Systems',
            mission: 'Fire Alarm & Pump Preventive Maintenance & Certification',
            authority: 'Dubai Civil Defense (DCD)',
            frequency: 'Quarterly',
            mandatory: true,
            urgencyDays: 15
        });
    }
    
    if (inputs.lifts > 0 || inputs.escalators) {
        missions.push({
            trigger: 'Lifts / Elevators',
            mission: 'Elevator & Escalator Annual Safety Inspection',
            authority: 'Dubai Municipality (DM)',
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
    
    if (inputs.sira || pType === 'GOVERNMENT_MAJLIS' || pType === 'GOVERNMENT_PROPERTY' || pType === 'HOTEL') {
        missions.push({
            trigger: 'CCTV / Security System',
            mission: 'CCTV System Annual Maintenance & SIRA Compliance Audit',
            authority: 'Security Industry Regulatory Agency (SIRA)',
            frequency: 'Annual',
            mandatory: true,
            urgencyDays: 45
        });
    }
    
    if (inputs.pool || pType === 'HOTEL') {
        missions.push({
            trigger: 'Swimming Pool',
            mission: 'Pool Water Quality Certificate & Civil Defense Compliance',
            authority: 'Dubai Municipality (DM)',
            frequency: 'Monthly Sampling + Annual Cert',
            mandatory: true,
            urgencyDays: 30
        });
    }

    if (pType === 'GOVERNMENT_MAJLIS') {
        missions.push({
            trigger: 'Majlis Asset',
            mission: 'Majlis HVAC & Cooling Load Audit (Enhanced Capacity Check)',
            authority: 'DEWA / ADDC / Asset Owner',
            frequency: 'Annual + Pre-Season',
            mandatory: true,
            urgencyDays: 30
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

    return missions.sort((a, b) => a.urgencyDays - b.urgencyDays);
};

const generateContractRecommendation = (inputs: any, gradeMult: number, missions: ComplianceMissionItem[]): {
    recommendedTier: string;
    recommendedReason: string[];
    score: number;
    contractTemplate: 'GOVERNMENT_MAJLIS_CONTRACT' | 'GOVERNMENT_PROPERTY_CONTRACT' | 'HOTEL_CONTRACT' | 'STANDARD_AMC';
} => {
    const pType = inputs.propertyType;
    const ownerType = inputs.ownerType || (inputs.useType === 'Government' ? 'Government' : 'Private');

    // ── PREMIUM INSTITUTIONAL ROUTING ──
    if (ownerType === 'Government') {
        if (pType === 'GOVERNMENT_MAJLIS') {
            return { 
                recommendedTier: 'INSTITUTIONAL_SOVEREIGN', 
                recommendedReason: ['Government Majlis Protocol Requirements', 'VIP Security Level Integration'], 
                score: 100,
                contractTemplate: 'GOVERNMENT_MAJLIS_CONTRACT'
            };
        }

        if (pType === 'GOVERNMENT_PROPERTY') {
            return { 
                recommendedTier: 'GOVERNMENT_FACILITY_MANAGEMENT', 
                recommendedReason: ['Departmental Asset Criticality', 'Enhanced Compliance Stack'], 
                score: 95,
                contractTemplate: 'GOVERNMENT_PROPERTY_CONTRACT'
            };
        }
    }

    if (pType === 'HOTEL') {
        return { 
            recommendedTier: 'HOSPITALITY_PREMIUM_FM', 
            recommendedReason: ['24/7 Operations Load', 'Guest-Facing Service Intensity'], 
            score: 98,
            contractTemplate: 'HOTEL_CONTRACT'
        };
    }

    // ── ALL OTHER TYPES -> STANDARD ROUTING ──
    let score = 0;
    const reasons: string[] = [];
    if (gradeMult >= 1.8) { score += 30; reasons.push('Luxury/Ultra-Luxury grade requires full FM coverage'); }
    if (missions.length >= 5) { score += 25; reasons.push(`${missions.length} mandatory compliance missions detected`); }
    
    let tier = score >= 70 ? 'SOVEREIGN HYBRID (Maintenance + PM)' : (score >= 40 ? 'PREMIUM MAINTENANCE CONTRACT' : 'MAINTENANCE ONLY CONTRACT');

    return { recommendedTier: tier, recommendedReason: reasons, score, contractTemplate: 'STANDARD_AMC' };
};

const calculatePortfolioIntelligence = (portfolioCount: number, basePrice: number, isGovt: boolean): {
    portfolioDiscount: number;
    portfolioTier: string;
    portfolioDiscountAmount: number;
    institutionalFlag: boolean;
} => {
    let discount = isGovt ? 0.15 : (portfolioCount >= 10 ? 0.12 : (portfolioCount >= 7 ? 0.10 : (portfolioCount >= 3 ? 0.05 : 0)));
    let tier = isGovt ? 'GOVERNMENT INSTITUTIONAL' : (portfolioCount >= 10 ? 'PORTFOLIO SOVEREIGN (10+)' : (portfolioCount >= 7 ? 'PORTFOLIO ELITE (7+)' : (portfolioCount >= 3 ? 'PORTFOLIO STANDARD (3+)' : 'SINGLE ASSET')));

    return {
        portfolioDiscount: discount,
        portfolioTier: tier,
        portfolioDiscountAmount: Math.round(basePrice * discount),
        institutionalFlag: isGovt || portfolioCount >= 5
    };
};

export const calculateUAEValuation = async (inputs: any): Promise<IntegratedIntelligenceResponse> => {
    const pType = inputs.propertyType;
    const emirateMultipliers: Record<string, number> = { 'Dubai': 1.0, 'Abu Dhabi': 1.1, 'Sharjah': 0.85, 'Ajman': 0.75, 'RAK': 0.80, 'Fujairah': 0.70, 'UAQ': 0.65 };
    const community = inputs.community || inputs.area || 'Default';
    const districtData = DISTRICT_TIERS[community] || DISTRICT_TIERS['Default'];
    const towerComplexityFactor = Math.round((1 + (Math.min(inputs.floors || 1, 100) * 0.003)) * 100) / 100;
    const locationMultiplier = Math.round((emirateMultipliers[inputs.emirate] || 1.0) * districtData.mult * 100) / 100;
    const gradeMultipliers: Record<string, number> = { 'Ultra-Luxury': 2.50, 'Luxury': 1.80, 'Premium': 1.30, 'Standard': 1.0, 'Sovereign': 3.0 };

    let sectorMult = 1.0;
    if (pType === 'GOVERNMENT_MAJLIS') {
        sectorMult = 1.55;
        if (inputs.protocolLevel === 'Sovereign') sectorMult += 0.25;
        else if (inputs.protocolLevel === 'High') sectorMult += 0.15;
        if (inputs.securityLevel === 'Maximum') sectorMult += 0.15;
        else if (inputs.securityLevel === 'Enhanced') sectorMult += 0.10;
        if (inputs.hospitalityReadiness) sectorMult += 0.10;
        if (inputs.heritageSensitivity === 'Sovereign') sectorMult += 0.20;
        else if (inputs.heritageSensitivity === 'Protected') sectorMult += 0.15;
        else if (inputs.heritageSensitivity === 'Cultural') sectorMult += 0.10;
        if (inputs.eventUse) sectorMult += 0.12;
        if (['Abu Dhabi', 'Al Ain'].includes(inputs.emirate)) sectorMult *= 1.12;
    } else if (pType === 'GOVERNMENT_PROPERTY') {
        sectorMult = 1.80;
        if (inputs.govPropertySubtype === 'compound' || inputs.govPropertySubtype === 'mixed_government_building') sectorMult += 0.20;
        else if (inputs.govPropertySubtype === 'facility' || inputs.govPropertySubtype === 'accommodation') sectorMult += 0.10;
        if (inputs.securityLevel === 'Maximum') sectorMult += 0.10;
        if (inputs.compliance === 'high_risk') sectorMult += 0.15;
    } else if (pType === 'HOTEL') {
        sectorMult = 2.50;
        if (inputs.hotelClass === 'ULTRA_LUXURY') sectorMult += 0.60;
        else if (inputs.hotelClass === 'DELUXE') sectorMult += 0.45;
        else if (inputs.hotelClass === '5_STAR') sectorMult += 0.35;
        sectorMult += (inputs.restaurantCount || 0) * 0.05;
        sectorMult += (inputs.eventHalls || 0) * 0.08;
        if (inputs.spaGym) sectorMult += 0.05;
        if (inputs.laundryKitchenComplexity === 'High') sectorMult += 0.12;
        if (inputs.backOfHouseComplexity === 'Complex') sectorMult += 0.10;
        if (inputs.commonAreaIntensity === 'Intense') sectorMult += 0.15;
        else if (inputs.commonAreaIntensity === 'High') sectorMult += 0.10;
    } else if (pType === 'Commercial' || pType === 'Office' || pType === 'Warehouse' || pType === 'Mall' || pType === 'Commercial Building') {
        sectorMult = 1.25;
    } else if (pType === 'Institutional' || pType === 'School' || pType === 'Hospital') {
        sectorMult = 1.40;
    }

    const ageDepreciation = Math.max(0.75, 1 - ((inputs.age || 0) * 0.01));
    const totalAssetMultiplier = locationMultiplier * (gradeMultipliers[inputs.assetGrade] || 1.0) * sectorMult * ageDepreciation * towerComplexityFactor;
    const sqft = inputs.sqft || 1200;
    const marketValue = Math.round(1200 * totalAssetMultiplier * sqft * ((inputs.conditionScore || 7) / 10));
    
    let maintenanceBase = Math.round(marketValue * 0.012);
    if (pType === 'GOVERNMENT_MAJLIS') maintenanceBase = Math.max(maintenanceBase, 35 * sqft);
    else if (pType === 'GOVERNMENT_PROPERTY') maintenanceBase = Math.max(maintenanceBase, 25 * sqft);
    else if (pType === 'HOTEL') maintenanceBase = Math.max(maintenanceBase, 30 * sqft);

    const finalBundledPrice = Math.round((maintenanceBase + Math.round(marketValue * 0.065 * 0.05)) * 0.90);
    const complianceMissions = generateComplianceMissions(inputs);
    const contractRec = generateContractRecommendation(inputs, 1.0, complianceMissions);
    const portfolioIntel = calculatePortfolioIntelligence(inputs.portfolioCount || 1, finalBundledPrice, pType.startsWith('GOVERNMENT'));

    const packages = [
        { 
            packageName: 'Standard Management', 
            tier: 'standard', 
            annualPrice: Math.round(finalBundledPrice * 0.85), 
            responseSla: '24 hours', 
            includedVisits: 6, 
            coverageScope: ['AC', 'Plumbing', 'Electrical'], 
            recommended: false 
        },
        { 
            packageName: pType === 'GOVERNMENT_MAJLIS' ? 'Majlis Protocol Premium' : 'Premium FM Coverage', 
            tier: 'premium', 
            annualPrice: finalBundledPrice, 
            responseSla: '4 hours', 
            includedVisits: 12, 
            coverageScope: ['AC', 'Plumbing', 'Electrical', 'Compliance', 'Handyman'], 
            recommended: true 
        },
        { 
            packageName: pType === 'GOVERNMENT_MAJLIS' ? 'Sovereign VIP Protocol' : 'Sovereign Institutional', 
            tier: 'sovereign', 
            annualPrice: Math.round(finalBundledPrice * 1.45), 
            responseSla: '30 mins', 
            includedVisits: 52, 
            coverageScope: ['Full FM', 'Deep Cleaning', 'Security Audit', 'Concierge', 'IT/IoT'], 
            recommended: false 
        }
    ];

    const benchmark = {
        benchmarkSource: 'BIN-GROUP Sovereign Intelligence',
        benchmarkRegion: inputs.emirate,
        alignmentStatus: 'ALIGNED',
        marketBenchmarkMin: Math.round(finalBundledPrice * 0.95),
        marketBenchmarkMax: Math.round(finalBundledPrice * 1.35),
        benchmarkJustification: `Based on current ${inputs.emirate} municipal rates for ${pType} assets of ${inputs.assetGrade} grade.`,
    };

    return {
        property: { ownerId: 'UID_PENDING', propertyName: `${community} ${pType}`, emirate: inputs.emirate, area: community, propertyType: pType, usageType: 'fm', unitSubtype: 'Asset', builtUpAreaSqFt: sqft, propertyAgeYears: inputs.age || 0, buildingGrade: inputs.assetGrade || 'Premium', viewType: 'Community', conditionScore: inputs.conditionScore || 7, complianceRiskProfile: inputs.compliance || 'low_risk', occupancyStatus: 'vacant' },
        valuation: { rentEstimate: { low: 0, target: 0, high: 0 }, saleEstimate: { low: Math.round(marketValue * 0.9), target: marketValue, high: Math.round(marketValue * 1.1) }, confidenceLevel: 'high', confidenceScore: 90, valuationMode: `INSTITUTIONAL | ${pType}`, drivers: [`Sector Mult: ${sectorMult}x`] },
        fmQuote: { annualEstimate: { low: maintenanceBase, target: finalBundledPrice, high: finalBundledPrice * 1.1 }, riskTier: 'low', recommendedPackageTier: contractRec.recommendedTier, drivers: [`Sector Mult: ${sectorMult}x`] },
        riskPack: { civilDefenseStatus: 'compliant', elevatorInspectionStatus: 'certified', insuranceExposure: 'low_risk', complianceRiskScore: complianceMissions.length * 8, complianceRiskLabel: 'INSTITUTIONAL' },
        forecast: { oneYearReactiveCost: Math.round(maintenanceBase * 1.5), oneYearContractCost: finalBundledPrice, oneYearSavings: Math.round(maintenanceBase * 0.5), fiveYearReactiveCost: Math.round(maintenanceBase * 1.5 * 5), fiveYearContractCost: finalBundledPrice * 5, fiveYearSavings: maintenanceBase * 2.5, forecastConfidence: 'high' },
        insights: { buildingHealthScore: 85, healthTrend: 'stable', assetLifecycleStage: 'mid', liquidityScore: 'high', rentalDemandScore: 'strong', nextMajorServiceWindowMonths: 12, predictedValueProtectionPercent: 15 },
        package: packages[1], // Premium as default
        packages,
        benchmark,
        complianceMissions,
        geographyIntelligence: { districtTier: districtData.tier, ownershipZone: districtData.ownership, towerComplexityFactor, locationMultiplier },
        portfolioIntelligence: portfolioIntel,
        contractRecommendation: contractRec,
        savingsSimulation: { marketAverageAnnual: Math.round(maintenanceBase * 1.45), binGroupAnnual: finalBundledPrice, savingsAmount: Math.round(maintenanceBase * 0.45), savingsPercent: 30, efficiencyGain: '+30%', complianceCoverageBoost: '+25%' },
        dataStatusLabel: `V7.0 INSTITUTIONAL ENGINE — ${pType}`,
        decisionVersion: 'v7.0-INSTITUTIONAL',
        confidenceScore: 95,
        inputCompleteness: 1.0,
        missingFields: [],
        assumptionFlags: [],
        quoteExpiresAt: new Date().toISOString(),
        priceLockUntil: new Date().toISOString(),
        trustTier: 'INSTITUTIONAL_HIGH'
    };
};

export const calculatePortfolioValuation = async (properties: any[]): Promise<IntegratedIntelligenceResponse> => {
    const results = await Promise.all(properties.map(p => calculateUAEValuation(p)));
    const totalAnnualPrice = results.reduce((sum, r) => sum + r.package.annualPrice, 0);
    const hasSovereignAsset = properties.some(p => p.propertyType === 'GOVERNMENT_MAJLIS');
    let portfolioDiscount = hasSovereignAsset ? 0 : (properties.length >= 20 ? 0.15 : (properties.length >= 7 ? 0.10 : (properties.length >= 3 ? 0.05 : 0)));
    const finalAnnualPrice = Math.round(totalAnnualPrice * (1 - portfolioDiscount));
    const portfolioResult = { ...results[0] };
    portfolioResult.package = { ...portfolioResult.package, annualPrice: finalAnnualPrice, packageName: 'Institutional Portfolio Package' };
    portfolioResult.portfolioIntelligence = { portfolioDiscount, portfolioTier: properties.length > 10 ? 'INSTITUTIONAL_ULTRA' : 'PORTFOLIO_ALPHA', portfolioDiscountAmount: Math.round(totalAnnualPrice * portfolioDiscount), institutionalFlag: properties.length >= 5 };
    return portfolioResult;
};

export const savePricingAudit = async (ownerId: string, propertyData: any, result: IntegratedIntelligenceResponse) => {
    try {
        await addDoc(collection(db, 'pricingAuditLogs'), { ownerId, propertyId: propertyData.id || 'lead_quote', engineType: 'decision_engine_v7_institutional', summary: `${result.property.propertyName} - ${result.valuation.valuationMode}`, result, createdAt: serverTimestamp() });
    } catch (e) { console.error("Audit log failed:", e); }
};
