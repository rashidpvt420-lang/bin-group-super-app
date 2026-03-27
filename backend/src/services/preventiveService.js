/**
 * Preventive Maintenance Scheduler & Intelligence Engine (2026 Strategy)
 * Shifts binary operations from reactive ticketing to institutional asset protection.
 */
class PreventiveMaintenanceEngine {
    
    constructor() {
        this.maintenanceStandards = {
            HVAC: { frequency: 'QUARTERLY', tasks: ['Filter cleaning', 'Gas check', 'Coil descaling'], weight: 0.4 },
            PUMPS_MOTORS: { frequency: 'MONTHLY', tasks: ['Alignment check', 'Bearing lubrication', 'Current draw test'], weight: 0.2 },
            FIRE_SAFETY: { frequency: 'ANNUAL', tasks: ['Panel testing', 'Smoke detector audit', 'SIRA compliance'], weight: 0.2 },
            GENERATORS: { frequency: 'MONTHLY', tasks: ['Runtime test', 'Fluid levels', 'Battery health'], weight: 0.1 },
            WATER_TANKS: { frequency: 'BI_ANNUAL', tasks: ['Cleaning', 'Disinfection', 'Lab sample testing'], weight: 0.1 }
        };
    }

    /**
     * Calculates the 'Preventive Coverage Score' for a property
     */
    calculateCoverageScore(completedInspections, requiredInspections) {
        if (!requiredInspections || requiredInspections === 0) return 100;
        const score = (completedInspections / requiredInspections) * 100;
        return Math.min(100, Math.round(score));
    }

    /**
     * Generates a 12-month scheduler for a specific property type
     */
    generateSchedule(propertyMeta) {
        const schedule = [];
        const types = Object.keys(this.maintenanceStandards);
        
        types.forEach(type => {
            const config = this.maintenanceStandards[type];
            let interval = 3; // Quarterly default
            if (config.frequency === 'MONTHLY') interval = 1;
            if (config.frequency === 'BI_ANNUAL') interval = 6;
            if (config.frequency === 'ANNUAL') interval = 12;

            for (let m = 1; m <= 12; m += interval) {
                schedule.push({
                    assetType: type,
                    month: m,
                    tasks: config.tasks,
                    slaPriority: 'P2',
                    estimatedDurationHours: 2,
                    complianceRequirement: type === 'FIRE_SAFETY' ? 'SIRA' : (type === 'WATER_TANKS' ? 'DM' : 'BIN_INTERNAL')
                });
            }
        });

        return schedule;
    }

    /**
     * Estimates the reduction in emergency failures based on preventive intensity
     */
    estimateExposureReduction(coverageScore) {
        // High coverage (90%+) correlates to ~35-40% reduction in emergency calls in UAE towers
        const floor = 5; // Base reduction
        const multiplier = 0.35;
        const reduction = floor + (coverageScore * multiplier);
        return Math.round(reduction);
    }

    /**
     * Institutional KPI: Lifecycle Alpha
     * Measures how many years are added to asset life via BIN-PREVENT logic
     */
    calculateLifecycleExtension(coverageScore) {
        if (coverageScore < 50) return 0;
        // Every 10% above 50% coverage adds ~0.8 years to core MEP life
        return parseFloat(((coverageScore - 50) / 10 * 0.8).toFixed(1));
    }
}

module.exports = new PreventiveMaintenanceEngine();
