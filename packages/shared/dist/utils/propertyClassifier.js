"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyProperty = void 0;
const classifyProperty = (inputs) => {
    const pType = (inputs.propertyType || '').toUpperCase();
    if (pType === 'GOVERNMENT_MAJLIS')
        return 'GOVERNMENT_MAJLIS';
    if (pType === 'GOVERNMENT_PROPERTY')
        return 'GOVERNMENT_PROPERTY';
    if (pType === 'HOTEL')
        return 'HOTEL';
    if (['VILLA', 'APARTMENT', 'RESIDENTIAL BUILDING', 'RESIDENTIAL'].includes(pType))
        return 'RESIDENTIAL';
    if (['OFFICE', 'COMMERCIAL BUILDING', 'WAREHOUSE', 'MALL', 'COMMERCIAL'].includes(pType))
        return 'COMMERCIAL';
    if (['INDUSTRIAL'].includes(pType))
        return 'INDUSTRIAL';
    if (['MIXED-USE TOWER', 'MIXED-USE'].includes(pType))
        return 'MIXED_USE';
    if (['SCHOOL', 'HOSPITAL', 'INSTITUTIONAL'].includes(pType))
        return 'INSTITUTIONAL';
    return 'RESIDENTIAL';
};
exports.classifyProperty = classifyProperty;
