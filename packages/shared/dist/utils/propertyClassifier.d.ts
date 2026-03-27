export type PropertyClassification = 'Apartment' | 'Villa' | 'Office' | 'Retail' | 'Warehouse' | 'Tower' | 'School' | 'Hotel' | 'Hospital' | 'Government' | 'Majlis' | 'Compound';
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
export declare const classifyProperty: (data: ClassificationInputs) => PropertyClassification;
