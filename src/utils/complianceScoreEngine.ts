// owner-app/src/utils/complianceScoreEngine.ts
import type { PortfolioData } from './portfolioAggregationEngine';

/**
 * Compliance Engine v1.0
 * Evaluates the asset portfolio against mandatory sovereign compliance standards.
 */
export function calculateComplianceScore(data: PortfolioData) {
    const complianceTickets = data.tickets.filter(t => t.type === 'compliance' || t.tag === 'MISSION');
    
    if (complianceTickets.length === 0) return 100; // Perfect compliance if no missions are open/due
    
    const settledMissions = complianceTickets.filter(t => t.status === 'COMPLETED' || t.status === 'CLOSED').length;
    const totalMissions = complianceTickets.length;
    
    // Weighted score (settled vs total) with a floor for institutional assets
    const score = (settledMissions / totalMissions) * 100;
    
    return parseFloat(score.toFixed(1));
}
