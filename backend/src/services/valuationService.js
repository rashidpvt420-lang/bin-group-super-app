/**
 * Asset Liquidity & Valuation Intelligence (2026 Strategy)
 * Estimates the impact of maintenance on property value, depreciation avoided, and yield stability.
 * Transforms maintenance into a direct Investment Multiplier logic.
 */
class AssetValuationIntelligence {
    
    constructor() {
        this.valuationModels = {
            TOWER: { depreciationRate: 0.04, ppmImpact: 0.15, yieldStability: 0.12 },
            MALL: { depreciationRate: 0.06, ppmImpact: 0.22, yieldStability: 0.18 },
            OFFICE: { depreciationRate: 0.03, ppmImpact: 0.10, yieldStability: 0.08 }
        };
    }

    /**
     * Estimates the 'Asset Depreciation Avoided' via high-intensity maintenance
     */
    calculateDepreciationAvoided(propertyType, currentValuation, ppmScore) {
        const model = this.valuationModels[propertyType.toUpperCase()];
        if (!model) return { avoided: 0, premium: 0 };

        // High PPM (90%+) can reduce the annual depreciation coefficient by ~15-20%
        const ppmMultiplier = (ppmScore / 100);
        const avoided = (currentValuation * model.depreciationRate) * (ppmMultiplier * 0.18);
        const premium = currentValuation * (ppmMultiplier * 0.05); // 5% brand premium for 'BIN-MAINTAINED' asset

        return {
            depreciationAvoided: Math.round(avoided),
            assetPremium: Math.round(premium),
            yieldStabilityImpact: `+${(ppmMultiplier * model.yieldStability * 100).toFixed(1)}%`,
            totalValueProtection: Math.round(avoided + premium)
        };
    }

    /**
     * Post-Handover (DLP) Defects Tracking & Warranty Continuity Engine
     * For Developers: Tracks snagging logs and defect liability period status.
     */
    getDeveloperHandoverStatus(projectData, snaggingLogs) {
        const dlpDaysLeft = (new Date(projectData.dlpExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        
        return {
            projectId: projectData.id,
            dlpStatus: dlpDaysLeft > 0 ? 'ACTIVE_DEFECT_LIABILITY' : 'POST_DLP_WARRANTY_ZONE',
            openSnaggingItems: snaggingLogs.filter(s => s.status !== 'CLOSED').length,
            warrantyTransferValidity: 'BIN_VALIDATED_OEM_SERVICE',
            continuityIndex: 98 // Readiness for handover to OA (Owners Association)
        };
    }
}

module.exports = new AssetValuationIntelligence();
