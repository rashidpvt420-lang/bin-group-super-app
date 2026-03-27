/**
 * Building Health Intelligence Engine
 * Calculates multi-system health scores based on building age,
 * architectural complexity, and usage intensity.
 */
export type SystemHealth = {
    system: string;
    score: number;
    status: 'Stable' | 'Warning' | 'Critical';
    color: string;
};
export type BuildingHealthReport = {
    overallScore: number;
    systems: SystemHealth[];
    complianceScore: number;
    recommendations: string[];
};
export declare function calculateBuildingHealth(data: {
    age: number;
    floors: number;
    sector: string;
    hvacCount: number;
}): BuildingHealthReport;
