/**
 * Institutional Certification Hierarchy & National Asset Stability Index (2026 Strategy)
 * Maps property integrity into a standardized hierarchy (AA, A, B) used by REITs and Insurers.
 * Converts complex maintenance data into an industry "Credit Rating" for buildings.
 */
class AssetStabilityRatingEngine {
    
    constructor() {
        this.ratingTiers = {
            AA: { label: 'Institutional Grade (Premium)', minScore: 92, status: 'STABLE_YIELD_GUARANTEED' },
            A: { label: 'Investment Grade (Standard)', minScore: 82, status: 'POSITIVE_PERFORMANCE_TREND' },
            B: { label: 'Operational Grade (Baseline)', minScore: 72, status: 'BASELINE_MAINTENANCE_ACTIVE' },
            C: { label: 'Risk Grade (Substandard)', minScore: 0, status: 'ELEVATED_LIFECYCLE_EXPOSURE' }
        };

        this.certificationHierarchy = [
            'BIN_CERTIFIED',        // Operational Compliance Verified
            'INSTITUTIONAL_GRADE',   // Lifecycle Stability Confirmed
            'INVESTMENT_GRADE',      // Reserve Adequacy Validated
            'INSURANCE_PREFERRED'    // Underwriting-Risk Optimized
        ];
    }

    /**
     * Calculates the 'National Asset Stability Rating' (e.g., AA)
     */
    calculateStabilityRating(propertyId, multiFactorData) {
        // Factors: Lifecycle (0.3), Compliance (0.2), SLA (0.2), Reserve (0.2), Vendor (0.1)
        const rawScore = 
            (multiFactorData.lifecycleScore * 0.3) +
            (multiFactorData.complianceScore * 0.2) +
            (multiFactorData.slaPerformance * 0.2) +
            (multiFactorData.reserveAdequacy * 0.2) +
            (multiFactorData.vendorReliability * 0.1);

        const score = Math.round(rawScore);
        const ratingKeys = Object.keys(this.ratingTiers);
        const ratingKey = ratingKeys.find(key => score >= this.ratingTiers[key].minScore) || 'C';
        const rating = this.ratingTiers[ratingKey];

        const activeCerts = this.certificationHierarchy.filter((cert, idx) => {
            if (idx === 0) return score >= 70;
            if (idx === 1) return score >= 85;
            if (idx === 2) return score >= 90;
            if (idx === 3) return score >= 95;
            return false;
        });

        return {
            propertyId,
            assetStabilityScore: score,
            rating: ratingKey,
            label: rating.label,
            status: rating.status,
            activeCertifications: activeCerts,
            nextTierReadiness: this.calculateNextTierGoal(score, ratingKey),
            attestedBy: 'BIN-STABILITY-INDEX-v4.0'
        };
    }

    calculateNextTierGoal(score, currentRating) {
        const tiers = { 'C': 72, 'B': 82, 'A': 92, 'AA': 100 };
        const target = tiers[currentRating] || 100;
        return {
            pointsRequired: Math.max(0, target - score),
            targetTier: currentRating === 'AA' ? 'MAXIMUM' : Object.keys(tiers)[Object.keys(tiers).indexOf(currentRating) + 1]
        };
    }
}

module.exports = new AssetStabilityRatingEngine();
