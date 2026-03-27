// packages/shared/src/utils/propertyClassifier.ts

export type PropertyClassification = 
    | 'Apartment' 
    | 'Villa' 
    | 'Office' 
    | 'Retail' 
    | 'Warehouse' 
    | 'Tower' 
    | 'School' 
    | 'Hotel' 
    | 'Hospital'
    | 'Government' 
    | 'Majlis' 
    | 'Compound';

export interface ClassificationInputs {
    floors?: number;
    units?: number;
    classrooms?: number;
    beds?: number;
    starRating?: number;
    authorityName?: string;
    areaSqFt?: number;
    propertyUsage?: 'residential' | 'commercial' | 'industrial' | 'institutional';
    villasInCluster?: number;
    majlisFlag?: boolean;
    liftsCount?: number;
}

/**
 * MASTER COMMANDER DIRECTIVE V1.10: Auto-detection layer for UAE property archetypes.
 */
export const classifyProperty = (data: ClassificationInputs): PropertyClassification => {
    // 1. Institutional Overrides
    if ((data.classrooms || 0) >= 10) return 'School';
    if ((data.beds || 0) >= 50) return 'Hospital';
    if (data.starRating && data.starRating > 0) return 'Hotel';
    if (data.authorityName && data.authorityName.length > 0) return 'Government';
    
    // 2. Structural Signatures
    if ((data.floors || 0) >= 15) return 'Tower';
    if ((data.villasInCluster || 0) > 1) return 'Compound';
    if (data.majlisFlag) return 'Majlis';

    // 3. Usage Baselines
    if (data.propertyUsage === 'industrial') return 'Warehouse';
    if (data.propertyUsage === 'commercial') {
        if ((data.areaSqFt || 0) > 5000) return 'Office';
        return 'Retail';
    }

    // 4. Residential Fallbacks
    if ((data.villasInCluster || 0) === 1) return 'Villa';
    return 'Apartment';
};
