// src/utils/queryUtils.ts
import { query, where, onSnapshot, type DocumentData, type Unsubscribe } from '../lib/firebase';
import type { CollectionReference, QuerySnapshot } from 'firebase/firestore';

type EqualityFilter = {
    field: string;
    value: unknown;
};

export type SnapshotDoc = {
    id: string;
    [key: string]: unknown;
};

function snapshotToRows(snap: QuerySnapshot<DocumentData>): SnapshotDoc[] {
    return snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
}

/**
 * Execute a Firestore query with a split `in` filter when values exceed the
 * Firestore 10-value limit. Results from concurrent listeners are merged and
 * deduplicated by document ID.
 */
export function onSnapshotSplitIn(
    baseQuery: CollectionReference<DocumentData>,
    equalityFilter: EqualityFilter,
    inField: string,
    values: string[],
    callback: (mergedDocs: SnapshotDoc[]) => void
): Unsubscribe {
    const uniqueValues = Array.from(new Set(values.filter(Boolean)));
    const chunks: string[][] = [];

    for (let i = 0; i < uniqueValues.length; i += 10) {
        chunks.push(uniqueValues.slice(i, i + 10));
    }

    if (chunks.length === 0) {
        callback([]);
        return () => undefined;
    }

    const resultsMap = new Map<number, SnapshotDoc[]>();

    const unsubscribers = chunks.map((chunk, index) => {
        const q = query(
            baseQuery,
            where(equalityFilter.field, '==', equalityFilter.value),
            where(inField, 'in', chunk)
        );

        return onSnapshot(q, (snap: QuerySnapshot<DocumentData>) => {
            resultsMap.set(index, snapshotToRows(snap));

            const uniqueDocsMap = new Map<string, SnapshotDoc>();
            Array.from(resultsMap.values())
                .flat()
                .forEach((row) => uniqueDocsMap.set(row.id, row));

            callback(Array.from(uniqueDocsMap.values()));
        });
    });

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}
