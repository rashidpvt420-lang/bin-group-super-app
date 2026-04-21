// owner-app/src/utils/annualYieldEngine.ts
import { PortfolioData } from './portfolioAggregationEngine';

/**
 * Institutional Yield Engine v1.0
 * Calculates ROI and yield performance based on real-time collection data.
 */
export function calculateAnnualYieldMetrics(data: PortfolioData) {
    // If there's no portfolio data (e.g., no properties), return default zero/N/A metrics
    if (!data || data.properties.length === 0) {
        return {
            grossContractValue: 0,
            netIncome: 0,
            totalCollected: 0,
            totalMaintenanceCosts: 0,
            grossROI: 0,
            netROI: 0,
            annualYield: 0
        };
    }

    const totalGVC = data.contracts.reduce((sum, c) => sum + (c.annualContractValue || 0), 0);
    
    // Total Collections from Transactions (credit-type)
    const totalCollected = data.transactions
        .filter(t => t.type === 'credit' && t.status === 'SETTLED')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

    // Total Maintenance/Service Costs (debit-type)
    const totalCosts = data.transactions
        .filter(t => t.type === 'debit')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

    // Calculate yield percentage (normalized against asset count or total sqft)
    // Here we use a standard ROI calculation based on net/gross
    const netIncome = totalCollected - totalCosts;
    
    // Mocking an asset base value for ROI if not present (AED 1.5M average)
    const estimatedAssetExposure = data.properties.length * 1500000;
    const grossROI = estimatedAssetExposure > 0 ? (totalGVC / estimatedAssetExposure) * 100 : 0;
    const netROI = estimatedAssetExposure > 0 ? (netIncome / estimatedAssetExposure) * 100 : 0;

    // [V2] PM Operational Metrics
    const totalUnits = data.properties.reduce((sum, p) => sum + (p.units || 1), 0);
    const occupiedUnits = data.properties.reduce((sum, p) => sum + (p.occupiedUnits || (p.units || 1)), 0);
    const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 100;

    const resolvedTickets = data.tickets.filter(t => ['COMPLETED', 'RESOLVED', 'CLOSED'].includes(t.status)).length;
    const totalTickets = data.tickets.length;
    const resolutionRate = totalTickets > 0 ? (resolvedTickets / totalTickets) * 100 : 100;

    const renewalsProcessed = data.contracts.filter(c => c.status === 'RENEWED').length;

    return {
        grossContractValue: totalGVC,
        netIncome: netIncome,
        totalCollected: totalCollected,
        totalMaintenanceCosts: totalCosts,
        grossROI: parseFloat(grossROI.toFixed(1)) || 0,
        netROI: parseFloat(netROI.toFixed(1)) || 0,
        annualYield: estimatedAssetExposure > 0 ? parseFloat(((totalGVC / estimatedAssetExposure) * 100).toFixed(2)) : 0,
        pmMetrics: {
            totalUnits,
            occupiedUnits,
            vacantUnits: totalUnits - occupiedUnits,
            occupancyRate: parseFloat(occupancyRate.toFixed(1)),
            renewalsProcessed,
            resolvedTickets,
            resolutionRate: parseFloat(resolutionRate.toFixed(1)),
            avgVacancyDays: 14 // Mocked for now
        }
    };
}
