/**
 * Tenant Risk Scoring Engine (2026 Strategy)
 * Protects landlord assets by tracking "High Friction" behaviors and maintenance misuse.
 * Essential for portfolios, family offices, and developers who manage multi-unit assets.
 */
class TenantRiskScoring {
    
    constructor() {
        this.riskThresholds = {
            COMPLAINT_FREQUENCY: { penalty: 5, label: 'Excessive Service Calls', threshold: 4, period: 'MONTHLY' },
            MAINTENANCE_MISUSE: { penalty: 15, label: 'Non-Standard Wear/Damage', threshold: 1, period: 'QUARTERLY' },
            PAYMENT_DELAY: { penalty: 20, label: 'Rental Arrears History', threshold: 1, period: 'ANNUAL' },
            ACCESS_DENIAL: { penalty: 10, label: 'Denied Inspection Entry', threshold: 2, period: 'QUARTERLY' }
        };
    }

    /**
     * Calculates the 'Tenant Risk Score' for a specific tenant
     */
    calculateRiskScore(behavioralLog) {
        let baseScore = 100; // Perfect score
        const activeFlags = [];

        Object.keys(this.riskThresholds).forEach(key => {
            const config = this.riskThresholds[key];
            const incidents = behavioralLog.filter(log => log.type === key).length;

            if (incidents >= config.threshold) {
                baseScore -= config.penalty;
                activeFlags.push({
                    type: key,
                    label: config.label,
                    severity: config.penalty >= 15 ? 'HIGH' : 'MEDIUM'
                });
            }
        });

        // Normalize floor at 0
        const finalScore = Math.max(0, baseScore);
        
        let riskClass = 'LOW';
        if (finalScore < 50) riskClass = 'HIGH';
        else if (finalScore < 80) riskClass = 'MEDIUM';

        return {
            finalScore,
            riskClass,
            activeFlags,
            recommendation: this.getRecommendation(riskClass),
            lastUpdated: new Date().toISOString()
        };
    }

    getRecommendation(riskClass) {
        if (riskClass === 'HIGH') return 'MANDATORY_INSPECTION_REQUIRED_FOR_RENEWAL';
        if (riskClass === 'MEDIUM') return 'INCREASE_RESERVE_FUND_ALLOCATION_PER_UNIT';
        return 'STANDARD_RENEWAL_ELIGIBLE';
    }

    /**
     * Institutional KPI: Asset Preservation Alpha
     * Measures how much "Maintenance Exposure" is avoided by identifying high-risk tenants early.
     */
    calculatePreservationImpact(highRiskCount, avgUnitCost) {
        // High-risk tenants typically cost 2.4x more in unplanned repairs
        return Math.round(highRiskCount * avgUnitCost * 1.4);
    }
}

module.exports = new TenantRiskScoring();
