// owner-app/src/utils/esgRatingEngine.ts
import { PortfolioData } from './portfolioAggregationEngine';

/**
 * ESG Rating Engine v1.0
 * Calculates sovereign ESG scores (Environmental, Social, Governance) based on asset sustainability markers.
 */
export function calculateESGRatings(data: PortfolioData) {
    const totalAssets = data.properties.length;
    if (totalAssets === 0) return { rating: 'N/A', score: 0, eScore: 0, sScore: 0, gScore: 0, weightedAverage: 0 };

    // Environmental (E) - Solar, EV, Irrigation (Estate-wide markers)
    const solarCount = data.properties.filter(p => p.solarIntegration).length;
    const evCount = data.properties.filter(p => p.evReadiness).length;
    const irrigationCount = data.properties.filter(p => p.smartIrrigation).length;
    
    // Weighted E score
    const eScore = ((solarCount + evCount + irrigationCount) / (totalAssets * 3 || 1)) * 100;

    // Social (S) - Tenant satisfaction from tickets (feedback-type)
    const feedbackTickets = data.tickets.filter(t => t.type === 'feedback');
    const positiveFeedback = feedbackTickets.filter(t => t.rating && t.rating >= 4).length;
    const sScore = feedbackTickets.length > 0 ? (positiveFeedback / feedbackTickets.length) * 100 : 100; // 100 as benchmark if no friction recorded

    // Governance (G) - Asset Health vs Compliance ratio
    const gScore = data.properties.reduce((sum, p) => sum + (p.healthIndex || 90), 0) / totalAssets;

    const weightedAverage = (eScore * 0.4) + (sScore * 0.3) + (gScore * 0.3);

    // Rating mapping
    let rating = 'B';
    if (weightedAverage > 95) rating = 'A+';
    else if (weightedAverage > 85) rating = 'A';
    else if (weightedAverage > 75) rating = 'B+';

    return {
        rating,
        eScore: parseFloat(eScore.toFixed(0)),
        sScore: parseFloat(sScore.toFixed(1)),
        gScore: parseFloat(gScore.toFixed(0)),
        weightedAverage: parseFloat(weightedAverage.toFixed(1))
    };
}
