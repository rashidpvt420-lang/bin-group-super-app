import { classifyProperty, PropertyClassification } from './propertyClassifier';

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

export interface IntegratedIntelligenceResponse {
    property: {
        propertyType: string;
        builtUpAreaSqFt: number;
        buildingGrade: string;
    };
    valuation: {
        saleEstimate: { target: number };
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

export const calculateUAEValuation = async (inputs: any): Promise<IntegratedIntelligenceResponse> => {
    const pType = inputs.propertyType;
    const ownerType = inputs.ownerType || (inputs.useType === 'Government' ? 'Government' : 'Private');
    const sqft = inputs.sqft || 1200;
    const gradeMultipliers: Record<string, number> = { 'Ultra-Luxury': 2.50, 'Luxury': 1.80, 'Premium': 1.30, 'Standard': 1.0, 'Sovereign': 3.0 };
    
    let sectorMult = 1.0;
    if (pType === 'GOVERNMENT_MAJLIS') sectorMult = 1.85;
    else if (pType === 'GOVERNMENT_PROPERTY') sectorMult = 1.80;
    else if (pType === 'HOTEL') sectorMult = 2.50;
    else if (['Commercial', 'Office', 'Warehouse', 'Mall'].includes(pType)) sectorMult = 1.25;
    else if (['Institutional', 'School', 'Hospital'].includes(pType)) sectorMult = 1.40;

    const totalAssetMultiplier = (gradeMultipliers[inputs.assetGrade] || 1.0) * sectorMult;
    const marketValue = Math.round(1200 * totalAssetMultiplier * sqft);
    
    let maintenanceBase = Math.round(marketValue * 0.012);
    if (pType === 'GOVERNMENT_MAJLIS') maintenanceBase = Math.max(maintenanceBase, 35 * sqft);
    else if (pType === 'GOVERNMENT_PROPERTY') maintenanceBase = Math.max(maintenanceBase, 25 * sqft);
    else if (pType === 'HOTEL') maintenanceBase = Math.max(maintenanceBase, 30 * sqft);

    const finalAnnualPrice = Math.round(maintenanceBase * 1.1);

    let contractTemplate = 'STANDARD_AMC';
    if (ownerType === 'Government' && pType === 'GOVERNMENT_MAJLIS') {
        contractTemplate = 'GOVERNMENT_MAJLIS_CONTRACT';
    } else if (ownerType === 'Government' && pType === 'GOVERNMENT_PROPERTY') {
        contractTemplate = 'GOVERNMENT_PROPERTY_CONTRACT';
    } else if (pType === 'HOTEL') {
        contractTemplate = 'HOTEL_CONTRACT';
    }

    return {
        property: { propertyType: pType, builtUpAreaSqFt: sqft, buildingGrade: inputs.assetGrade || 'Premium' },
        valuation: { saleEstimate: { target: marketValue } },
        package: { annualPrice: finalAnnualPrice, contractTemplateType: contractTemplate },
        contractRecommendation: { recommendedTier: 'INSTITUTIONAL', contractTemplate }
    };
};
