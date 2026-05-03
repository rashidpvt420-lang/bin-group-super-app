// packages/shared/src/utils/DesignStudioPricingEngine.ts

export interface DesignScope {
    dimensions: number; // sq ft or sq m
    isMetric: boolean;
    zoneType: string;
    propertyType: string; // 'Mall' | 'Tower' | 'Villa' | 'Office' | 'Retail' | 'Majlis' | 'Government' | 'Garden' | 'Parking' | 'Common Area' | 'Facade' | 'Repaint'
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

export const ADDON_SERVICES = [
    { id: 'tech_standby', label: 'Technical standby for majlis / event venue', price: 2500 },
    { id: 'tank_cleaning', label: 'Tank cleaning', price: 1500 },
    { id: 'painting_room', label: 'Painting room', price: 1200 },
    { id: 'painting_villa', label: 'Painting villa', price: 15000 },
    { id: 'full_building_painting', label: 'Full building painting', price: 120000 },
    { id: 'mall_repaint', label: 'Mall repaint / night-shift painting', price: 18000 },
    { id: 'joinery_package', label: 'Joinery package', price: 25000 },
    { id: 'smart_lighting', label: 'Smart lighting', price: 8500 },
    { id: 'av_media', label: 'AV / majlis media setup', price: 22000 },
    { id: 'pantry_upgrade', label: 'Pantry / service area upgrade', price: 18000 },
    { id: 'garden_redesign', label: 'Garden redesign', price: 15000 },
    { id: 'irrigation', label: 'Irrigation', price: 6500 },
    { id: 'outdoor_lighting', label: 'Outdoor lighting', price: 5500 },
    { id: 'signage', label: 'Signage / retail frontage', price: 12500 },
    { id: 'flooring', label: 'Flooring replacement', price: 15000 },
    { id: 'wall_feature', label: 'Wall feature / cladding', price: 9500 },
    { id: 'false_ceiling', label: 'False ceiling / gypsum works', price: 8500 },
    { id: 'acoustic', label: 'Acoustic treatment', price: 14000 },
    { id: 'smart_home', label: 'Smart home package', price: 28000 },
    { id: 'waterproofing', label: 'Waterproofing allowance', price: 7500 },
    { id: 'authority_noc', label: 'Authority / NOC handling', price: 8000 }
];

export function calculateDesignStudioQuote(scope: DesignScope): DesignQuote {
    let baseRate = 0;
    const area = scope.dimensions;
    const propType = scope.propertyType.toUpperCase();

    // 1. INSTITUTIONAL EXECUTION BANDS (Safe Floors)
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
        // Standard Interiors / Majlis / Office
        if (scope.finishTier === 'Standard') baseRate = 320;
        else if (scope.finishTier === 'Premium') baseRate = 550;
        else baseRate = 1050;
    }

    const rawBaseCost = baseRate * area;

    // 2. UPLIFTS (Percentage based on difficulty)
    let upliftPct = 0;
    if (scope.accessLevel === 'Difficult') upliftPct += 0.25;
    if (scope.isNightWork) upliftPct += 0.25;
    if (scope.isMallEnvironment) upliftPct += 0.20;
    if (!['Dubai', 'Abu Dhabi'].includes(scope.emirate)) upliftPct += 0.20;
    if (scope.hasMEP) upliftPct += 0.20;
    if (scope.hasStructural) upliftPct += 0.35;
    if (propType.includes('TOWER')) upliftPct += 0.15; // Vertical logistics

    const upliftSubtotal = rawBaseCost * upliftPct;

    // 3. ADDONS
    let addonSubtotal = 0;
    scope.addons.forEach(id => {
        const addon = ADDON_SERVICES.find(a => a.id === id);
        if (addon) addonSubtotal += addon.price;
    });

    // 4. FIXED INSTITUTIONAL ALLOWANCES
    const approvalsAllowance = 8000;
    const logisticsAllowance = scope.emirate === 'Dubai' || scope.emirate === 'Abu Dhabi' ? 3500 : 7000;
    const wasteHandlingAllowance = 4500;
    const furnitureProcurementFee = scope.furnitureBudget * 0.35;

    // 5. MARGIN PROTECTION
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
        bindingClause: "SCOPE-LOCKED BINDING EXECUTION QUOTE: This quote is binding only to the submitted scope, declared dimensions, selected finishes, selected add-ons, declared MEP/access conditions, selected procurement package, and location profile stored in the BIN Group system. Any hidden condition, undeclared variation, authority-driven change, access restriction, scope change, or mismatch between declared and actual site condition triggers a variation order.",
        approvalRequirement: "Owner NOC mandatory for Tenant requests."
    };
}
