export type PropertyClassification = 'RESIDENTIAL' | 'COMMERCIAL' | 'INDUSTRIAL' | 'GOVERNMENT_MAJLIS' | 'GOVERNMENT_PROPERTY' | 'HOTEL' | 'MIXED_USE' | 'INSTITUTIONAL';
export declare const classifyProperty: (inputs: any) => PropertyClassification;
