export interface DesignScope {
    dimensions: number;
    isMetric: boolean;
    zoneType: string;
    propertyType: string;
    finishTier: 'Standard' | 'Premium' | 'Luxury';
    furnitureBudget: number;
    hasMEP: boolean;
    hasStructural: boolean;
    accessLevel: 'Easy' | 'Standard' | 'Difficult';
    emirate: string;
    isNightWork: boolean;
    isMallEnvironment: boolean;
    addons: string[];
}

export interface DesignQuote {
    conceptDesignResult: string;
    baseScopeCost: number;
    materialsEstimate: number;
    laborEstimate: number;
    approvalsAllowance: number;
    logisticsAllowance: number;
    wasteHandlingAllowance: number;
    addonSubtotal: number;
    furnitureProcurementFee: number;
    contingency: number;
    binMargin: number;
    upliftSubtotal: number;
    finalTotal: number;
    bindingClause: string;
    approvalRequirement: string;
}

export const DESIGN_ZONES = [
    'bedroom', 'master bedroom', 'guest room', 'living room', 'family hall',
    'majlis', 'dining', 'kitchen', 'pantry', 'bathroom', 'office room',
    'reception', 'lobby', 'corridor', 'garden', 'pergola / gazebo',
    'parking', 'facade', 'terrace / balcony', 'retail frontage',
    'mall unit', 'event seating area'
];

export const DESIGN_SCOPE_OPTIONS = [
    { id: 'concept_layout', label: 'AI concept layout', price: 0 },
    { id: 'moodboard', label: 'Moodboard and finish direction', price: 0 },
    { id: 'furniture_plan', label: 'Furniture layout recommendation', price: 0 },
    { id: 'lighting_concept', label: 'Lighting concept only', price: 0 },
    { id: 'execution_quote', label: 'Request execution quotation', price: 0 }
];

export function calculateDesignStudioQuote(scope: DesignScope): DesignQuote {
    let baseRate = 0;
    const area = Math.max(scope.dimensions || 1, 1);
    const propType = scope.propertyType.toUpperCase();

    if (['KITCHEN', 'PANTRY'].includes(scope.zoneType.toUpperCase())) {
        if (scope.finishTier === 'Standard') baseRate = 45000 / area;
        else if (scope.finishTier === 'Premium') baseRate = 85000 / area;
        else baseRate = 220000 / area;
    } else if (scope.zoneType.toUpperCase() === 'BATHROOM') {
        if (scope.finishTier === 'Standard') baseRate = 25000 / area;
        else if (scope.finishTier === 'Premium') baseRate = 55000 / area;
        else baseRate = 120000 / area;
    } else if (propType.includes('MALL') || propType.includes('RETAIL') || propType.includes('FOOD')) {
        if (scope.finishTier === 'Standard') baseRate = 450;
        else if (scope.finishTier === 'Premium') baseRate = 750;
        else baseRate = 1200;
    } else if (propType.includes('GARDEN') || propType.includes('LANDSCAPE')) {
        if (scope.finishTier === 'Standard') baseRate = 180;
        else if (scope.finishTier === 'Premium') baseRate = 300;
        else baseRate = 450;
    } else {
        if (scope.finishTier === 'Standard') baseRate = 320;
        else if (scope.finishTier === 'Premium') baseRate = 550;
        else baseRate = 1050;
    }

    const rawBaseCost = baseRate * area;
    let upliftPct = 0;
    if (scope.accessLevel === 'Difficult') upliftPct += 0.25;
    if (scope.isNightWork) upliftPct += 0.25;
    if (scope.isMallEnvironment) upliftPct += 0.20;
    if (!['Dubai', 'Abu Dhabi'].includes(scope.emirate)) upliftPct += 0.20;
    if (scope.hasMEP) upliftPct += 0.20;
    if (scope.hasStructural) upliftPct += 0.35;
    if (propType.includes('TOWER')) upliftPct += 0.15;

    const upliftSubtotal = rawBaseCost * upliftPct;
    const addonSubtotal = 0;
    const approvalsAllowance = 8000;
    const logisticsAllowance = scope.emirate === 'Dubai' || scope.emirate === 'Abu Dhabi' ? 3500 : 7000;
    const wasteHandlingAllowance = 4500;
    const furnitureProcurementFee = scope.furnitureBudget * 0.35;
    const subtotalBeforeMargin = rawBaseCost + upliftSubtotal + addonSubtotal + approvalsAllowance + logisticsAllowance + wasteHandlingAllowance + furnitureProcurementFee;
    const contingency = subtotalBeforeMargin * 0.20;
    const binMargin = subtotalBeforeMargin * 0.45;
    const finalTotal = subtotalBeforeMargin + contingency + binMargin;

    return {
        conceptDesignResult: `Institutional Conceptual Design generated for ${scope.zoneType} in ${scope.propertyType}. [Tier: ${scope.finishTier}]`,
        baseScopeCost: Math.round(rawBaseCost),
        materialsEstimate: Math.round(subtotalBeforeMargin * 0.45),
        laborEstimate: Math.round(subtotalBeforeMargin * 0.35),
        approvalsAllowance,
        logisticsAllowance,
        wasteHandlingAllowance,
        addonSubtotal,
        furnitureProcurementFee: Math.round(furnitureProcurementFee),
        upliftSubtotal: Math.round(upliftSubtotal),
        contingency: Math.round(contingency),
        binMargin: Math.round(binMargin),
        finalTotal: Math.round(finalTotal),
        bindingClause: 'CONCEPT ONLY: AI Design Studio produces design concepts and a preliminary execution estimate. Owner approval, site verification, authority requirements, and signed contract are required before execution.',
        approvalRequirement: 'Owner NOC mandatory for Tenant requests.'
    };
}
