// src/utils/queryUtils.ts
import { query, where, onSnapshot, type Query, type DocumentData } from '../lib/firebase';

/**
 * Execute a query with a split 'in' filter if items > 10 to bypass Firestore limits.
 * Deduplicates results by document ID.
 */
export const onSnapshotSplitIn = (
    queryBuilder: (chunk: string[]) => Query<DocumentData>,
    values: string[],
    callback: (mergedDocs: any[]) => void
) => {
    // If values are within single query limit, use standard path
    if (values.length <= 10) {
        return onSnapshot(queryBuilder(values), (snap) => {
            callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
    }

    // Split into chunks of 10
    const chunks: string[][] = [];
    for (let i = 0; i < values.length; i += 10) {
        chunks.push(values.slice(i, i + 10));
    }

    const resultsMap = new Map<number, any[]>();
    const unsubscribers = chunks.map((chunk, index) => {
        return onSnapshot(queryBuilder(chunk), (snap) => {
            resultsMap.set(index, snap.docs.map(d => ({ id: d.id, ...d.data() })));
            
            // Merge all results from all listeners
            const allDocs = Array.from(resultsMap.values()).flat();
            
            // Deduplicate by ID
            const uniqueDocsMap = new Map<string, any>();
            allDocs.forEach(doc => uniqueDocsMap.set(doc.id, doc));
            
            callback(Array.from(uniqueDocsMap.values()));
        });
    });

    return () => unsubscribers.forEach(unsub => unsub());
};
