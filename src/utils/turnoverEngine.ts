// owner-app/src/utils/turnoverEngine.ts
import { db, collection, query, where, getDocs } from '../lib/firebase';

export interface TurnoverStats {
    pending: number;
    approved: number;
    inProgress: number;
    completed: number;
    totalInvoiced: number;
}

/**
 * Turnover Engine v1.0
 * Calculates statistics for quote restoration and turnover cycles.
 */
export async function fetchTurnoverStats(ownerId: string): Promise<TurnoverStats> {
    try {
        const quoteRef = collection(db, 'turnover-quotes');
        const quoteSnap = await getDocs(query(quoteRef, where('ownerId', '==', ownerId)));
        const quotes = quoteSnap.docs.map(doc => doc.data() as any);

        return {
            pending: quotes.filter(q => q.status === 'PENDING').length,
            approved: quotes.filter(q => q.status === 'APPROVED').length,
            inProgress: quotes.filter(q => q.status === 'IN_PROGRESS').length,
            completed: quotes.filter(q => q.status === 'COMPLETED').length,
            totalInvoiced: quotes.reduce((sum, q) => sum + (q.finalPrice || 0), 0)
        };
    } catch (error) {
        console.error("Turnover Engine Failure:", error);
        throw error;
    }
}
