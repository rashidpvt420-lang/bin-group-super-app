"use strict";
/**
 * Building Health Intelligence Engine
 * Calculates multi-system health scores based on building age,
 * architectural complexity, and usage intensity.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateBuildingHealth = calculateBuildingHealth;
function calculateBuildingHealth(data) {
    const systems = [];
    // 1. HVAC Health
    let hvacScore = Math.max(95 - (data.age * 2.5) - (data.hvacCount > 50 ? 5 : 0), 30);
    systems.push({
        system: 'HVAC Infrastructure',
        score: Math.round(hvacScore),
        status: hvacScore > 75 ? 'Stable' : hvacScore > 50 ? 'Warning' : 'Critical',
        color: hvacScore > 75 ? 'emerald' : hvacScore > 50 ? 'orange' : 'red'
    });
    // 2. Electrical Distribution
    let elecScore = Math.max(98 - (data.age * 1.5), 45);
    systems.push({
        system: 'Electrical Grid',
        score: Math.round(elecScore),
        status: elecScore > 80 ? 'Stable' : elecScore > 60 ? 'Warning' : 'Critical',
        color: elecScore > 80 ? 'emerald' : elecScore > 60 ? 'orange' : 'red'
    });
    // 3. Plumbing & Hydraulics
    let plumbScore = Math.max(92 - (data.age * 3) - (data.floors > 40 ? 10 : 0), 25);
    systems.push({
        system: 'Plumbing & Hydraulic',
        score: Math.round(plumbScore),
        status: plumbScore > 70 ? 'Stable' : plumbScore > 45 ? 'Warning' : 'Critical',
        color: plumbScore > 70 ? 'emerald' : plumbScore > 45 ? 'orange' : 'red'
    });
    // 4. Civil & Structural
    let civilScore = Math.max(99 - (data.age * 0.8), 65);
    systems.push({
        system: 'Civil & Structural',
        score: Math.round(civilScore),
        status: civilScore > 85 ? 'Stable' : 'Warning',
        color: civilScore > 85 ? 'emerald' : 'orange'
    });
    // 5. Compliance & Safety (Simulated based on age/sector)
    let complianceScore = Math.max(100 - (data.age * 1) - (data.sector === 'Industrial' ? 10 : 0), 50);
    const overallScore = Math.round((systems.reduce((acc, s) => acc + s.score, 0) / systems.length) * 0.7 +
        (complianceScore * 0.3));
    const recommendations = [];
    if (hvacScore < 60)
        recommendations.push("Predictive Maintenance Alert: Urgent chiller plant audit recommended due to efficiency drop.");
    if (plumbScore < 60)
        recommendations.push("High-pressure pump array showing fatigue. AI Property Recommendation: Install IoT Leak Detection Sensors.");
    if (data.age >= 10)
        recommendations.push("Predictive Maintenance Alert: Mandatory HVAC duct inspection for buildings 10+ years old.");
    if (overallScore < 70)
        recommendations.push("Consider upgrading to Premium PM for deeper asset preservation.");
    return {
        overallScore,
        systems,
        complianceScore,
        recommendations
    };
}
