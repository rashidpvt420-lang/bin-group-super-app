export type PropertyType = 'Residential' | 'Commercial' | 'Industrial' | 'Mixed-Use' | 'Institutional' | 'GOVERNMENT_MAJLIS' | 'GOVERNMENT_PROPERTY' | 'HOTEL' | 'Villa' | 'Apartment' | 'Residential Building' | 'Office' | 'Commercial Building' | 'Warehouse' | 'School' | 'Hospital' | 'Mall' | 'Mixed-Use Tower';
export interface IntegratedIntelligenceResponse {
    property: {
        propertyType: string;
        builtUpAreaSqFt: number;
        buildingGrade: string;
    };
    valuation: {
        saleEstimate: {
            target: number;
        };
    };
    package: {
        annualPrice: number;
        contractTemplateType?: string;
    };
    contractRecommendation: {
        recommendedTier: string;
        contractTemplate: string;
    };
}
export declare const calculateUAEValuation: (inputs: any) => Promise<IntegratedIntelligenceResponse>;
