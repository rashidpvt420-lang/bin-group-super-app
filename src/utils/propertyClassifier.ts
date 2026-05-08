export type PropertyClassification = 
    | 'RESIDENTIAL' 
    | 'COMMERCIAL' 
    | 'INDUSTRIAL' 
    | 'GOVERNMENT_MAJLIS' 
    | 'GOVERNMENT_PROPERTY' 
    | 'HOTEL' 
    | 'MIXED_USE' 
    | 'INSTITUTIONAL';

export const classifyProperty = (inputs: any): PropertyClassification => {
    const pType = (inputs.propertyType || '').toUpperCase();
    
    if (pType === 'GOVERNMENT_MAJLIS') return 'GOVERNMENT_MAJLIS';
    if (pType === 'GOVERNMENT_PROPERTY') return 'GOVERNMENT_PROPERTY';
    if (pType === 'HOTEL') return 'HOTEL';
    
    if (['VILLA', 'APARTMENT', 'RESIDENTIAL BUILDING', 'RESIDENTIAL'].includes(pType)) return 'RESIDENTIAL';
    if (['OFFICE', 'COMMERCIAL BUILDING', 'WAREHOUSE', 'MALL', 'COMMERCIAL'].includes(pType)) return 'COMMERCIAL';
    if (['INDUSTRIAL'].includes(pType)) return 'INDUSTRIAL';
    if (['MIXED-USE TOWER', 'MIXED-USE'].includes(pType)) return 'MIXED_USE';
    if (['SCHOOL', 'HOSPITAL', 'INSTITUTIONAL'].includes(pType)) return 'INSTITUTIONAL';
    
    return 'RESIDENTIAL';
};
