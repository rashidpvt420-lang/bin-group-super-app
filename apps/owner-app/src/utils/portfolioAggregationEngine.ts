// owner-app/src/utils/portfolioAggregationEngine.ts
import { db, collection, query, where, getDocs } from '../lib/firebase';

export interface PortfolioData {
    properties: any[];
    contracts: any[];
    tickets: any[];
    transactions: any[];
}

/**
 * Aggregates all sovereign data points for a specific owner to drive the BIN-GENESIS™ analytics engine.
 */
export async function fetchPortfolioAggregation(ownerId: string, godMode: boolean = false): Promise<PortfolioData> {
    try {
        const propRef = collection(db, 'properties');
        const contractRef = collection(db, 'contracts');
        const ticketRef = collection(db, 'tickets');
        const txRef = collection(db, 'transactions');

        // Parallel fetching: If godMode is enabled, fetch ALL documents. Otherwise, filter by ownerId.
        const [propSnap, contractSnap, ticketSnap, txSnap] = await Promise.all([
            getDocs(godMode ? propRef : query(propRef, where('ownerId', '==', ownerId))),
            getDocs(godMode ? contractRef : query(contractRef, where('ownerId', '==', ownerId))),
            getDocs(godMode ? ticketRef : query(ticketRef, where('ownerId', '==', ownerId))),
            getDocs(godMode ? txRef : query(txRef, where('ownerId', '==', ownerId)))
        ]);

        return {
            properties: propSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
            contracts: contractSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
            tickets: ticketSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
            transactions: txSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        };
    } catch (error) {
        console.error("Aggregation Engine Failure:", error);
        throw error;
    }
}

/**
 * Extracts a focused historical context for a specific asset to drive the Predictive Intelligence module.
 */
export function getHistoricalContextForProperty(portfolio: PortfolioData, propertyId: string): any {
    const property = portfolio.properties.find(p => p.id === propertyId);
    if (!property) return null;

    return {
        propertyId,
        ownerId: property.ownerId,
        propertyDetails: {
            sqft: property.builtUpAreaSqFt || property.sqft || 1500,
            grade: property.grade || 'A',
            propertyType: property.propertyType || 'RESIDENTIAL',
            emirate: property.emirate || 'DUBAI'
        },
        workOrderHistory: portfolio.tickets
            .filter(t => t.propertyId === propertyId)
            .map(t => ({
                ticketId: t.id,
                createdAt: t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt),
                category: t.trade || 'GENERAL',
                cost: t.costAllocation || 0,
                trade: t.trade || 'GENERAL',
                priority: t.priority || 'OPEN'
            })),
        financialHistory: portfolio.transactions
            .filter(tx => tx.propertyId === propertyId)
            .map(tx => ({
                date: tx.date ? new Date(tx.date) : new Date(),
                type: tx.type || 'debit',
                amount: tx.amount || 0,
                category: tx.category || 'maintenance'
            }))
    };
}
