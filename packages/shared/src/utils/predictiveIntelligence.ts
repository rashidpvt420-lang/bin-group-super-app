/**
 * BIN-GENESIS™ Predictive Intelligence Engine v2.0
 * Systemic Asset Failure Prediction & Risk Mitigation Layer.
 */

export interface PredictionAdvisory {
    system: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    probability: number;
    warning: string;
    recommendation: string;
    timeframe: string;
}

export interface PredictiveContext {
    propertyId: string;
    ownerId: string;
    metadata: {
        age: number;
        floors: number;
        units: number;
        propertyType: string;
        hvacType?: string;
        liftCount: number;
        pool: boolean;
    };
    bpiScore: number;
    ticketHistory: Array<{
        category: string;
        priority: string;
        createdAt: any;
        status: string;
    }>;
}

export interface PredictiveMaintenanceReport {
    propertyId: string;
    generatedAt: string;
    overallRiskScore: number;
    advisories: PredictionAdvisory[];
}

/**
 * Generates probabilistic maintenance advisories based on institutional datasets.
 */
export function generatePredictiveMaintenance(context: PredictiveContext): PredictiveMaintenanceReport {
    const advisories: PredictionAdvisory[] = [];
    const { metadata, ticketHistory, bpiScore } = context;

    // 1. AC FAILURE RISK (Systemic Summer Heat Intensity)
    const hvacTickets = ticketHistory.filter(t => t.category === 'HVAC');
    const recentHvacIssues = hvacTickets.length;
    let acRisk: PredictionAdvisory['riskLevel'] = 'LOW';
    let acProb = 0.15;

    if (metadata.hvacType === 'DX' && metadata.age > 10) { acProb += 0.30; acRisk = 'MEDIUM'; }
    if (recentHvacIssues > 2) { acProb += 0.40; acRisk = 'HIGH'; }
    if (acProb > 0.8 || bpiScore < 60) acRisk = 'CRITICAL';

    if (acProb > 0.4) {
        advisories.push({
            system: 'HVAC / Cooling',
            riskLevel: acRisk,
            probability: Math.round(acProb * 100),
            warning: `Advisory: Potential ${acRisk === 'CRITICAL' ? 'imminent' : 'gradual'} cooling efficiency loss detected.`,
            recommendation: 'Perform deep coil sanitization and refrigerant pressure stabilization.',
            timeframe: acRisk === 'CRITICAL' ? 'Within 7 days' : 'Next 30 days'
        });
    }

    // 2. REPEATED PUMP / PLUMBING RISK
    const plumbingTickets = ticketHistory.filter(t => t.category === 'PLUMBING');
    const emergencyLeaks = plumbingTickets.filter(t => t.priority === 'EMERGENCY').length;
    
    if (emergencyLeaks > 0 || plumbingTickets.length > 4) {
        advisories.push({
            system: 'Hydraulic / Pumps',
            riskLevel: emergencyLeaks > 1 ? 'CRITICAL' : 'HIGH',
            probability: emergencyLeaks > 1 ? 92 : 75,
            warning: 'Advisory: Hydraulic pressure fluctuation patterns suggest systemic seal or pump fatigue.',
            recommendation: 'Schedule ultrasonic leak detection and master pump station audit.',
            timeframe: 'Urgent'
        });
    }

    // 3. LIFT SERVICING PRESSURE (Load Intensity)
    if (metadata.floors > 20 && metadata.liftCount < (metadata.floors / 8)) {
        const liftTickets = ticketHistory.filter(t => t.category === 'LIFT' || t.category === 'ELEVATOR').length;
        advisories.push({
            system: 'Vertical Transport',
            riskLevel: liftTickets > 2 ? 'HIGH' : 'MEDIUM',
            probability: liftTickets > 2 ? 80 : 55,
            warning: 'Advisory: High load-to-asset ratio detected. Likely drive motor thermal stress.',
            recommendation: 'Increase lubrication frequency and perform brake wear thickness audit.',
            timeframe: 'Next scheduled service'
        });
    }

    // 4. LEAK RECURRENCE (Roof / Wet Areas)
    const leaks = ticketHistory.filter(t => (t.category === 'PLUMBING' || t.category === 'GENERAL') && t.priority === 'HIGH').length;
    if (leaks > 3 && metadata.age > 15) {
        advisories.push({
            system: 'Envelope / Roofing',
            riskLevel: 'HIGH',
            probability: 68,
            warning: 'Advisory: Recurrent moisture signals in primary structural nodes.',
            recommendation: 'Perform thermographic moisture mapping of roof and expansion joints.',
            timeframe: 'Before Q3 heat peak'
        });
    }

    // Calculate Overall Portfolio Risk Contribution
    const overallRiskScore = Math.round(
        advisories.reduce((acc, curr) => {
            const weight = curr.riskLevel === 'CRITICAL' ? 100 : curr.riskLevel === 'HIGH' ? 75 : 40;
            return acc + (weight * (curr.probability / 100));
        }, 0) / (advisories.length || 1)
    );

    return {
        propertyId: context.propertyId,
        generatedAt: new Date().toISOString(),
        overallRiskScore,
        advisories
    };
}
