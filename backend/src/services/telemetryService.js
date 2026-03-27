/**
 * IoT Telemetry & Predictive Failure Engine (2026 Strategy)
 * Real-time signal ingestion (Vibration, Temperature, Pressure, Runtime).
 * Transforms BIN-GROUP into a Predictive Failure Network.
 */
class TelemetryPredictorEngine {
    
    constructor() {
        this.sensorThresholds = {
            CHILLER_VFD_TEMP: { nominal: 45, alert: 78, failure: 89, unit: 'C' },
            PUMP_VIBRATION: { nominal: 2, alert: 5.5, failure: 8.2, unit: 'mm/s' },
            PANEL_PHASE_VAR: { nominal: 2, alert: 8, failure: 15, unit: '%' },
            GEN_BATTERY_V: { nominal: 13.2, alert: 11.8, failure: 11, unit: 'V' }
        };
    }

    /**
     * Ingests a telemetry packet and calculates the 45-day failure probability
     */
    processTelemetry(sensorId, type, value, historyDays) {
        const threshold = this.sensorThresholds[type];
        if (!threshold) return { probability: 0, status: 'UNKNOWN' };

        // Simple linear extrapolation vs alert/failure thresholds
        const trend = value / threshold.alert;
        const speedOfDegradation = (value - (historyDays[0] || value)) / historyDays.length;

        let probability = Math.round(trend * 80);
        if (value > threshold.alert) probability = 85;
        if (value > threshold.failure) probability = 100;

        // Estimated failure window (Days)
        const daysToFailure = Math.round((threshold.failure - value) / (speedOfDegradation || 1));
        const estimatedWindow = Math.max(1, Math.min(45, daysToFailure));

        return {
            sensorId,
            currentValue: value,
            unit: threshold.unit,
            failureProbability: Math.min(100, probability),
            estimatedFailureWindow: estimatedWindow,
            recommendedServiceBy: this.addDays(estimatedWindow),
            status: probability > 70 ? 'CRITICAL_PREVENTIVE_LOCK' : (probability > 40 ? 'EARLY_DEGRADATION' : 'OPTIMAL_RUNTIME')
        };
    }

    addDays(days) {
        const date = new Date();
        date.setDate(date.getDate() + days);
        return date.toISOString().split('T')[0];
    }

    /**
     * Institutional KPI: Availability Alpha
     * Measures downtime avoided by actioning telemetry alerts BEFORE failure
     */
    calculateDowntimeAvoided(criticalAlertsResolved) {
        // Average HVAC/Elevator/Pump downtime cost: AED 2,500 - 8,000 / hr
        return Math.round(criticalAlertsResolved * 12 * 4500); // 12hr avg downtime avoided
    }
}

module.exports = new TelemetryPredictorEngine();
