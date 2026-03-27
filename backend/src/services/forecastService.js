/**
 * Portfolio Cashflow & Reserve Fund Forecast Engine (2026 Strategy)
 * Provides institutional owners and tower committees with forward-looking CAPEX visibility.
 * Transforms BIN-GROUP from a contractor into a Strategic Lifecycle Advisor.
 */
class PortfolioForecastEngine {
    
    constructor() {
        this.assetLifecycles = {
            ELEVATOR_MODERNIZATION: { cycleYears: 15, baseCostPerLift: 180000, critical: true },
            PUMP_REPLACEMENT: { cycleYears: 8, baseCostPerUnit: 12000, critical: true },
            HVAC_CHILLER_OVERHAUL: { cycleYears: 12, baseCostPerTon: 450, critical: true },
            ROOF_WATERPROOFING: { cycleYears: 8, baseCostPerSqft: 18, critical: false },
            FIRE_ALARM_UPGRADE: { cycleYears: 10, baseCostPerBuilding: 85000, critical: true }
        };
    }

    /**
     * Projects the 36-month exposure for a property
     */
    projectExposure(buildingAge, assets) {
        const projections = [];
        const next36Months = 36;
        
        Object.keys(this.assetLifecycles).forEach(key => {
            const config = this.assetLifecycles[key];
            const yearsToNextCycle = config.cycleYears - (buildingAge % config.cycleYears);
            const monthsToNextCycle = Math.round(yearsToNextCycle * 12);

            if (monthsToNextCycle <= next36Months) {
                projections.push({
                    type: key,
                    monthsRemaining: monthsToNextCycle,
                    estimatedCost: this.calculateEstimatedCost(key, assets),
                    priority: config.critical ? 'CRITICAL' : 'PLANNED',
                    impact: monthsToNextCycle <= 12 ? 'HIGH_EXPOSURE' : 'PLANNING_ZONE'
                });
            }
        });

        return projections.sort((a, b) => a.monthsRemaining - b.monthsRemaining);
    }

    calculateEstimatedCost(type, assets) {
        const config = this.assetLifecycles[type];
        if (type === 'ELEVATOR_MODERNIZATION') return config.baseCostPerLift * (assets.lifts || 4);
        if (type === 'PUMP_REPLACEMENT') return config.baseCostPerUnit * (assets.pumps || 6);
        if (type === 'HVAC_CHILLER_OVERHAUL') return config.baseCostPerTon * (assets.tonnage || 500);
        if (type === 'ROOF_WATERPROOFING') return config.baseCostPerSqft * (assets.roofSqft || 15000);
        return config.baseCostPerBuilding;
    }

    /**
     * Calculates the Recommended Reserve Fund Contribution (per month per unit)
     */
    calculateRecommendedReserve(projections, units) {
        if (!units || units === 0) return 0;
        
        // Sum total 36-month exposure
        const total36MonthExposure = projections.reduce((sum, p) => sum + p.estimatedCost, 0);
        
        // Target: Save 100% of 36-month exposure over 36 months
        // Monthly total = Total Exposure / 36
        const monthlyTotal = total36MonthExposure / 36;
        const monthlyPerUnit = monthlyTotal / units;

        return {
            total36MonthExposure,
            monthlyPerUnit: Math.round(monthlyPerUnit),
            reserveAdequacyScore: 0 // To be calculated vs actual reserve fund data
        };
    }

    /**
     * Institutional KPI: Lifecycle Alpha
     * Estimated savings by deferring replacement via high-intensity preventive maintenance
     */
    calculateDeferralSavings(totalExposure, coverageScore) {
        // High coverage (90%+) can defer replacement by ~2-3 years, saving ~15% PV
        if (coverageScore < 85) return 0;
        return Math.round(totalExposure * 0.15);
    }
}

module.exports = new PortfolioForecastEngine();
