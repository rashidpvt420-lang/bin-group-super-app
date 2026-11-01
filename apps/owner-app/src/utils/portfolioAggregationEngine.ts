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
export async function fetchPortfolioAggregation(ownerId: string): Promise<PortfolioData> {
    try {
        const propRef = collection(db, 'properties');
        const contractRef = collection(db, 'contracts');
        const ticketRef = collection(db, 'maintenanceTickets');
        const txRef = collection(db, 'transactions');

        // [BULLETPROOF] Individual catch blocks per query to prevent total aggregate failure
        const [propSnap, contractSnap, ticketSnap, txSnap] = await Promise.all([
            getDocs(query(propRef, where('ownerId', '==', ownerId))).catch(e => { console.warn("📍 [AGG-ENGINE] Properties restricted:", e); return { docs: [] }; }),
            getDocs(query(contractRef, where('ownerId', '==', ownerId))).catch(e => { console.warn("📍 [AGG-ENGINE] Contracts restricted:", e); return { docs: [] }; }),
            getDocs(query(ticketRef, where('ownerId', '==', ownerId))).catch(e => { console.warn("📍 [AGG-ENGINE] Tickets restricted:", e); return { docs: [] }; }),
            getDocs(query(txRef, where('ownerId', '==', ownerId))).catch(e => { console.warn("📍 [AGG-ENGINE] Transactions restricted:", e); return { docs: [] }; })
        ]);

        return {
            properties: propSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })),
            contracts: contractSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })),
            tickets: ticketSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })),
            transactions: txSnap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }))
        };
    } catch (error) {
        console.error("Aggregation Engine Failure:", error);
        return { properties: [], contracts: [], tickets: [], transactions: [] };
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
        // Unknown property facts stay null; do not invent size, grade, type or emirate.
        propertyDetails: {
            sqft: Number(property.builtUpAreaSqFt || property.sqft) > 0 ? Number(property.builtUpAreaSqFt || property.sqft) : null,
            grade: property.grade || null,
            propertyType: property.propertyType || null,
            emirate: property.emirate || null
        },
        workOrderHistory: portfolio.tickets
            .filter(t => t.propertyId === propertyId)
            .map(t => ({
                ticketId: t.id,
                propertyId,
                createdAt: t.createdAt?.toDate ? t.createdAt.toDate() : (t.createdAt || null),
                completedAt: t.completedAt?.toDate ? t.completedAt.toDate() : (t.completedAt || null),
                dueAt: t.dueAt?.toDate ? t.dueAt.toDate() : (t.dueAt || t.slaDueAt || null),
                status: t.status || t.ticketStatus || '',
                category: t.category || t.issueType || t.trade || 'GENERAL',
                cost: Number(t.actualCost || t.approvedCost || t.costAllocation || 0),
                trade: t.trade || 'GENERAL',
                priority: t.priority || t.severity || 'NORMAL'
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
