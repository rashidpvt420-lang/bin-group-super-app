/**
 * BIN GROUP Sovereign OS - Building Performance Index (BPI) Engine v2.0
 * Calculates multi-system health scores based on structural data,
 * operational intensity, and real-time incident metrics.
 */

export type SystemHealth = {
    system: string;
    score: number;
    status: 'Stable' | 'Warning' | 'Critical';
    color: string;
};

export type BuildingHealthReport = {
    overallScore: number;
    label: 'Excellent' | 'Stable' | 'Watchlist' | 'High Risk';
    systems: SystemHealth[];
    complianceScore: number;
    recommendations: string[];
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
};

export function calculateBuildingHealth(data: {
    age: number;
    floors: number;
    units: number;
    propertyType: string;
    hvacType?: 'District' | 'DX';
    liftCount: number;
    pool: boolean;
    landscapeComplexity?: 'Low' | 'Medium' | 'High';
    complaintFrequency: number; // Avg tickets per month
    unresolvedTickets: number;
    emergencyIncidents: number;
    maintenanceLoad: number; // 0-100 scale of usage vs capacity
}): BuildingHealthReport {
    const systems: SystemHealth[] = [];

    // 1. Structural & Age Decay (Base: 100)
    // Depreciate by 1.5% per year, heavier if floors > 40
    let structuralBase = 100 - (data.age * 1.5);
    if (data.floors > 40) structuralBase -= 5;
    const civilScore = Math.max(structuralBase, 40);

    systems.push({
        system: 'Civil & Structural',
        score: Math.round(civilScore),
        status: civilScore > 85 ? 'Stable' : civilScore > 70 ? 'Warning' : 'Critical',
        color: civilScore > 85 ? '#10b981' : civilScore > 70 ? '#f59e0b' : '#ef4444'
    });

    // 2. Mechanical Load (HVAC & Lifts)
    let mechScore = 100 - (data.age * 2);
    if (data.hvacType === 'DX') mechScore -= 5; // DX systems usually higher maintenance load in UAE
    if (data.liftCount < (data.floors / 10)) mechScore -= 10; // Undersized lift capacity leads to fatigue
    mechScore = Math.max(mechScore, 30);

    systems.push({
        system: 'Mechanical Systems',
        score: Math.round(mechScore),
        status: mechScore > 75 ? 'Stable' : mechScore > 55 ? 'Warning' : 'Critical',
        color: mechScore > 75 ? '#10b981' : mechScore > 55 ? '#f59e0b' : '#ef4444'
    });

    // 3. Operational Friction (Complaints & Unresolved)
    // Impact of tenant satisfaction and maintenance response
    let opsScore = 100 - (data.complaintFrequency * 2) - (data.unresolvedTickets * 5);
    opsScore = Math.max(opsScore, 20);

    systems.push({
        system: 'Operational Flow',
        score: Math.round(opsScore),
        status: opsScore > 80 ? 'Stable' : opsScore > 60 ? 'Warning' : 'Critical',
        color: opsScore > 80 ? '#10b981' : opsScore > 60 ? '#f59e0b' : '#ef4444'
    });

    // 4. Critical Risk (Emergency Incidents)
    let riskScore = 100 - (data.emergencyIncidents * 15);
    riskScore = Math.max(riskScore, 0);

    systems.push({
        system: 'Life Safety & Risk',
        score: Math.round(riskScore),
        status: riskScore > 90 ? 'Stable' : riskScore > 70 ? 'Warning' : 'Critical',
        color: riskScore > 90 ? '#10b981' : riskScore > 70 ? '#f59e0b' : '#ef4444'
    });

    // Calculate Overall BPI
    const overallScore = Math.round(
        (civilScore * 0.25) + 
        (mechScore * 0.25) + 
        (opsScore * 0.20) + 
        (riskScore * 0.30)
    );

    // Determine Label
    let label: BuildingHealthReport['label'] = 'Excellent';
    let riskLevel: BuildingHealthReport['riskLevel'] = 'LOW';

    if (overallScore >= 90) {
        label = 'Excellent';
        riskLevel = 'LOW';
    } else if (overallScore >= 75) {
        label = 'Stable';
        riskLevel = 'MEDIUM';
    } else if (overallScore >= 60) {
        label = 'Watchlist';
        riskLevel = 'HIGH';
    } else {
        label = 'High Risk';
        riskLevel = 'CRITICAL';
    }

    // Generate Recommendations
    const recommendations = [];
    if (data.emergencyIncidents > 0) recommendations.push("URGENT: Root-cause analysis required for recent emergency protocols.");
    if (mechScore < 60) recommendations.push("Mechanical fatigue detected. Proactive lifecycle replacement for high-wear components recommended.");
    if (data.unresolvedTickets > 10) recommendations.push("Maintenance backlog exceeding SLA thresholds. Escalate technician allocation.");
    if (data.age > 15 && civilScore < 75) recommendations.push("Deep structural audit recommended for assets exceeding 15-year decay curve.");
    if (data.pool && mechScore < 80) recommendations.push("Pool filtration system efficiency drop. Schedule specialized chemistry audit.");

    return {
        overallScore,
        label,
        systems,
        complianceScore: Math.min(riskScore + 5, 100),
        recommendations,
        riskLevel
    };
}
