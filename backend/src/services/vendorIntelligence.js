/**
 * Vendor Performance Scoring & Renewal Intelligence (2026 Strategy)
 * Measures SLA adherence, callback frequency, and cost variance for institutional procurement.
 * High-performance vendors are rewarded; low-performers are automatically suggested for replacement.
 */
class VendorIntelligenceEngine {
    
    constructor() {
        this.vendorScores = {};
        this.benchmarks = {
            SLA_REACTION_HRS: 1.5,
            CALLBACK_PCT: 0.05,
            COST_VARIANCE: 0.1, // 10%
            CLIENT_FEEDBACK_MIN: 4.2 // (out of 5)
        };
    }

    /**
     * Calculates the 'Vendor Performance Score' (0-100)
     */
    calculatePerformanceScore(vendorId, stats) {
        const scores = {
            SLA: Math.max(0, 100 - (stats.avgReaction / this.benchmarks.SLA_REACTION_HRS * 20)),
            QUALITY: Math.max(0, 100 - (stats.callbackPct / this.benchmarks.CALLBACK_PCT * 30)),
            COST: Math.max(0, 100 - (stats.costVariance / this.benchmarks.COST_VARIANCE * 20)),
            FEEDBACK: (stats.avgRating / 5) * 30
        };

        const finalScore = scores.SLA + scores.QUALITY + scores.COST + scores.FEEDBACK;
        const normalized = Math.min(100, Math.round(finalScore));

        return {
            vendorId,
            score: normalized,
            riskClass: normalized < 60 ? 'HIGH' : (normalized < 85 ? 'MEDIUM' : 'LOW'),
            recommendation: normalized < 60 ? 'REPLACE_VENDOR_IMMEDIATE' : (normalized < 85 ? 'MONITOR_SLA_QUARTERLY' : 'STRATEGIC_VENDOR_RETAIN')
        };
    }

    /**
     * Contract Renewal Intelligence
     * Predicts the renewal probability based on SLA trends, profitability, and asset stability.
     */
    calculateRenewalProbability(contractId, performanceData, currentYield) {
        const slaTrend = performanceData.slaTrend; // 'UP', 'FLAT', 'DOWN'
        const stability = performanceData.assetStability; // Score 0-100

        let probability = 85; // Base probability for BIN-GROUP
        if (slaTrend === 'DOWN') probability -= 20;
        if (stability < 60) probability -= 15;
        if (currentYield < 5) probability += 10; // High margin for the platform

        return {
            contractId,
            renewalProbability: Math.min(100, Math.max(0, probability)),
            suggestedRenewalPrice: currentYield < 5 ? 'STABILIZE_PRICE' : 'UPSELL_TIER_HYBRID_OS',
            contractStability: stability >= 90 ? 'LIFECYCLE_PROTECTED' : 'AT_RISK_FOR_RENEWAL'
        };
    }

    /**
     * Auto Vendor Replacement Logic
     */
    suggestAlternativeVendor(currentVendorId, assetType) {
        // Mocking alternate top-tier vendors
        return {
            currentVendorId,
            recommendedAltId: `VND-TOP-TIER-MEP-${Math.random().toString(16).substring(2, 6)}`,
            projectedSlaImprovement: '+18%',
            projectedCostSaving: 'AED 4,500/yr'
        };
    }
}

module.exports = new VendorIntelligenceEngine();
