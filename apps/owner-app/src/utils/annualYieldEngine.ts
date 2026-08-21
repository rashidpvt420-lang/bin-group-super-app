import { PortfolioData } from './portfolioAggregationEngine';

/**
 * Institutional Yield Engine v1.1
 * Calculates owner metrics only from persisted portfolio records.
 * Missing source data remains unavailable instead of being replaced by demo assumptions.
 */
export function calculateAnnualYieldMetrics(data: PortfolioData) {
    if (!data || data.properties.length === 0) {
        return {
            grossContractValue: 0,
            netIncome: 0,
            totalCollected: 0,
            totalMaintenanceCosts: 0,
            grossROI: 0,
            netROI: 0,
            annualYield: 0,
            assetExposureAvailable: false,
            pmMetrics: {
                totalUnits: 0,
                occupiedUnits: 0,
                vacantUnits: 0,
                occupancyRate: null,
                occupancyDataAvailable: false,
                renewalsProcessed: 0,
                resolvedTickets: 0,
                resolutionRate: null,
                resolutionDataAvailable: false,
                avgVacancyDays: null,
                vacancyDataAvailable: false,
            },
        };
    }

    const totalGVC = data.contracts.reduce((sum, c) => sum + Number(c.annualContractValue || 0), 0);

    const totalCollected = data.transactions
        .filter(t => t.type === 'credit' && t.status === 'SETTLED')
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const totalCosts = data.transactions
        .filter(t => t.type === 'debit')
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);

    const netIncome = totalCollected - totalCosts;

    const assetExposure = data.properties.reduce(
        (sum, p: any) => sum + Number(p.purchasePrice || p.estimatedValue || p.marketValue || p.value || 0),
        0,
    );
    const assetExposureAvailable = assetExposure > 0;
    const grossROI = assetExposureAvailable ? (totalGVC / assetExposure) * 100 : 0;
    const netROI = assetExposureAvailable ? (netIncome / assetExposure) * 100 : 0;

    const propertiesWithUnitData = data.properties.filter((p: any) => {
        const units = Number(p.units ?? p.totalUnits ?? p.numberOfUnits);
        const occupied = Number(p.occupiedUnits);
        return Number.isFinite(units) && units >= 0 && Number.isFinite(occupied) && occupied >= 0;
    });
    const totalUnits = propertiesWithUnitData.reduce(
        (sum, p: any) => sum + Number(p.units ?? p.totalUnits ?? p.numberOfUnits ?? 0),
        0,
    );
    const occupiedUnits = propertiesWithUnitData.reduce((sum, p: any) => sum + Number(p.occupiedUnits || 0), 0);
    const occupancyDataAvailable = totalUnits > 0;
    const occupancyRate = occupancyDataAvailable ? (occupiedUnits / totalUnits) * 100 : null;

    const resolvedTickets = data.tickets.filter(t => ['COMPLETED', 'RESOLVED', 'CLOSED'].includes(String(t.status || '').toUpperCase())).length;
    const totalTickets = data.tickets.length;
    const resolutionDataAvailable = totalTickets > 0;
    const resolutionRate = resolutionDataAvailable ? (resolvedTickets / totalTickets) * 100 : null;

    const renewalsProcessed = data.contracts.filter(c => String(c.status || '').toUpperCase() === 'RENEWED').length;

    const vacancyDurations = data.properties
        .flatMap((p: any) => Array.isArray(p.unitsData) ? p.unitsData : [])
        .filter((unit: any) => unit.vacantSince)
        .map((unit: any) => {
            const start = typeof unit.vacantSince?.toDate === 'function' ? unit.vacantSince.toDate() : new Date(unit.vacantSince);
            return Number.isNaN(start.getTime()) ? null : Math.max(0, (Date.now() - start.getTime()) / 86400000);
        })
        .filter((days: number | null): days is number => days !== null);
    const vacancyDataAvailable = vacancyDurations.length > 0;
    const avgVacancyDays = vacancyDataAvailable
        ? parseFloat((vacancyDurations.reduce((sum, days) => sum + days, 0) / vacancyDurations.length).toFixed(1))
        : null;

    return {
        grossContractValue: totalGVC,
        netIncome,
        totalCollected,
        totalMaintenanceCosts: totalCosts,
        grossROI: parseFloat(grossROI.toFixed(1)) || 0,
        netROI: parseFloat(netROI.toFixed(1)) || 0,
        annualYield: assetExposureAvailable ? parseFloat(((totalGVC / assetExposure) * 100).toFixed(2)) : 0,
        assetExposureAvailable,
        pmMetrics: {
            totalUnits,
            occupiedUnits,
            vacantUnits: Math.max(totalUnits - occupiedUnits, 0),
            occupancyRate: occupancyRate === null ? null : parseFloat(occupancyRate.toFixed(1)),
            occupancyDataAvailable,
            renewalsProcessed,
            resolvedTickets,
            resolutionRate: resolutionRate === null ? null : parseFloat(resolutionRate.toFixed(1)),
            resolutionDataAvailable,
            avgVacancyDays,
            vacancyDataAvailable,
        },
    };
}
