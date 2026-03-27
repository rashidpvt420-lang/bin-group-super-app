/**
 * Spare-Parts Intelligence Benchmark Engine (2026 Strategy)
 * Validates spare part quotes against market averages to build instant trust with Tower Committees.
 * Eliminates transparency gaps in HVAC and MEP procurement.
 */
class PartsIntelligenceEngine {
    
    constructor() {
        this.marketBaselines = {
            'HVAC_COMPRESSOR_3TON': { low: 4500, avg: 5200, high: 6500, unit: 'AED' },
            'CHILLER_PUMP_MOTOR_7KW': { low: 8500, avg: 11200, high: 14500, unit: 'AED' },
            'FIRE_PUMP_DIESEL_ENGINE': { low: 35000, avg: 42000, high: 55000, unit: 'AED' },
            'ELEVATOR_CONTROL_BOARD': { low: 18000, avg: 22500, high: 28000, unit: 'AED' },
            'VFD_DRIVE_15KW': { low: 6200, avg: 7800, high: 9500, unit: 'AED' }
        };
    }

    /**
     * Validates a quoted price against the BIN-INTELLIGENCE benchmark
     */
    validatePartQuote(partCode, quotedPrice) {
        const baseline = this.marketBaselines[partCode];
        if (!baseline) return { status: 'UNKNOWN', confidence: 0 };

        const variance = ((quotedPrice - baseline.avg) / baseline.avg) * 100;
        
        let status = 'VALIDATED_FAIR';
        let alert = false;
        if (quotedPrice > baseline.high) {
            status = 'OVER_MARKET_ALERT';
            alert = true;
        } else if (quotedPrice < baseline.low) {
            status = 'BELOW_MARKET_SUSPICIOUS';
            alert = true;
        }

        return {
            partCode,
            quotedPrice,
            marketAvg: baseline.avg,
            marketRange: { low: baseline.low, high: baseline.high },
            variance: Math.round(variance),
            status,
            alert,
            binNegotiatedSavings: quotedPrice > baseline.avg ? 0 : Math.round(baseline.avg - quotedPrice)
        };
    }

    /**
     * Institutional KPI: Procurement Alpha
     * Calculates total savings achieved via BIN-GROUP direct procurement vs market average
     */
    getPortfolioSavings(processedQuotes) {
        return processedQuotes.reduce((total, q) => total + q.binNegotiatedSavings, 0);
    }

    /**
     * Lifecycle Insight: Genuine vs Aftermarket
     * Estimates the lifecycle impact of using 100% Genuine parts vs Aftermarket
     */
    getLifecycleImpact(isGenuine) {
        return isGenuine ? 1.4 : 0.8; // Genuine parts extend asset MTBF by ~40%
    }
}

module.exports = new PartsIntelligenceEngine();
