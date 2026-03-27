/**
 * Equipment-Level Lifecycle Registry & Warranty Intelligence (2026 Strategy)
 * Models individual asset decay curves (Chillers, Elevators, Pumps, Generators).
 * Maps failure probability vs service history to provide lifecycle advice.
 */
class AssetLifecycleRegistry {
    
    constructor() {
        this.decayModels = {
            CHILLER: { designLife: 15, annualDegradation: 0.05, criticalFailurePhase: 12, failureMultiplier: 1.4 },
            ELEVATOR_MOTOR: { designLife: 18, annualDegradation: 0.03, criticalFailurePhase: 15, failureMultiplier: 1.2 },
            FIRE_PUMP: { designLife: 10, annualDegradation: 0.08, criticalFailurePhase: 8, failureMultiplier: 2.1 },
            ROOF_MEMBRANE: { designLife: 8, annualDegradation: 0.12, criticalFailurePhase: 6, failureMultiplier: 3.5 }
        };
    }

    /**
     * Calculates the 'Asset Health Score' for a specific unit
     */
    calculateAssetHealth(unitType, ageYears, serviceScore) {
        const model = this.decayModels[unitType];
        if (!model) return { health: 100, status: 'STABLE' };

        // Base decay = (Age / DesignLife)
        const baseDecay = (ageYears / model.designLife);
        
        // Service impact: every 10% below 100 service score adds 5% decay
        const servicePenalty = Math.max(0, (100 - serviceScore) / 10 * 0.05);
        
        const finalHealth = (1 - (baseDecay + servicePenalty)) * 100;
        const failureProb = baseDecay * model.failureMultiplier * 100;

        return {
            health: Math.round(Math.max(0, finalHealth)),
            failureProbability: Math.min(100, Math.round(failureProb)),
            status: finalHealth < 30 ? 'CRITICAL_REPLACE' : (finalHealth < 60 ? 'UPGRADE_ZONE' : 'HEALTHY_PPM'),
            remainingLifeYears: Math.max(0, model.designLife - ageYears)
        };
    }

    /**
     * Warranty Intelligence Logic
     * Alerts if a service request or spare part conflicts with the OEM warranty.
     */
    checkWarrantyStatus(assetId, warrantyExpiry, isOEMPart) {
        const isExpired = new Date(warrantyExpiry).getTime() < Date.now();
        
        return {
            assetId,
            warrantyActive: !isExpired,
            oemCompliance: isOEMPart,
            riskAlert: !isExpired && !isOEMPart ? 'WARRANTY_INVALIDATION_RISK' : 'NONE',
            action: !isExpired ? 'OEM_AUTHORIZED_SERVICE_ONLY' : 'OPEN_VENDOR_COMPLIANCE'
        };
    }

    /**
     * Institutional KPI: Lifecycle Alpha
     * Measures years of life 'recovered' by switching from standard to BIN-PPM (high intensity).
     */
    getLifeRecovery(assetType, currentAge, binPpmIntensity) {
        if (binPpmIntensity < 90) return 0;
        // High intensity maintenance can extend design life by ~15-20%
        const model = this.decayModels[assetType];
        return parseFloat((model.designLife * 0.18).toFixed(1));
    }
}

module.exports = new AssetLifecycleRegistry();
