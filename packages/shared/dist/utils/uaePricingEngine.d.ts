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
    rentEstimate: {
        low: number;
        target: number;
        high: number;
    };
    saleEstimate: {
        low: number;
        target: number;
        high: number;
    };
    confidenceLevel: 'low' | 'medium' | 'high';
    confidenceScore: number;
    valuationMode: string;
    drivers: string[];
}
export interface FMQuoteModule {
    annualEstimate: {
        low: number;
        target: number;
        high: number;
    };
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
    arrivalDispatchLatency: number;
    dispatchZone: string;
    liftLoadIndex: number;
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
    esgRating: 'A+' | 'A' | 'B' | 'C';
    energyIndex: number;
    waterIndex: number;
    maintenanceFrequency: number;
    certCoverage: number;
    capexReserveRequirement: number;
    reserveConfidenceIndex: 'HIGH' | 'MEDIUM' | 'LOW';
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
/**
 * Generates an Asset Integrity Score (0-100) based on operational health.
 * Formula weights: Age (30%), MTTR (40%), Service Cycles (30%)
 */
export declare const calculateAssetIntegrityScore: (ageYears: number, avgMttr: number, mttrTarget?: number) => number;
/**
 * Forecasts maintenance spend for the next 24 months.
 * Factors in sector-specific aging curves and institutional loading.
 */
export declare const forecastMaintenanceCost: (sqft: number, age: number, sector: string) => number;
export declare const calculateCertificationRisk: (daysToExpiry: number, type: "FIRE" | "LIFT" | "WATER") => number;
export interface IntegratedIntelligenceResponse {
    property: PropertyDoc;
    valuation: ValuationModule;
    fmQuote: FMQuoteModule;
    addOns: AddOnModule[];
    riskPack: RiskPackModule;
    forecast: MaintenanceForecastModule;
    insights: OwnerInsightsModule;
    package: QuotationPackageModule;
    packages: QuotationPackageModule[];
    benchmark: BenchmarkModule;
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
export declare const calculateUAEValuation: (inputs: any) => Promise<IntegratedIntelligenceResponse>;
export declare const savePricingAudit: (ownerId: string, propertyData: any, result: IntegratedIntelligenceResponse) => Promise<void>;
