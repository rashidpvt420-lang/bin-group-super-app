import {
  collection,
  documentId,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type Firestore,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

export const REPORTING_PAGE_SIZE = 40;
export const REPORTING_READ_CAP = 300;

async function loadPages(db: Firestore, collectionName: string, constraints: QueryConstraint[], cap: number) {
  const rows: Array<Record<string, any>> = [];
  let cursor: QueryDocumentSnapshot | null = null;
  const size = REPORTING_PAGE_SIZE;
  while (rows.length < cap) {
    const base = query(collection(db, collectionName), ...constraints, orderBy(documentId()));
    const page = cursor ? query(base, startAfter(cursor), limit(size)) : query(base, limit(size));
    const snap = await getDocs(page);
    if (!snap.docs.length) break;
    for (const item of snap.docs) rows.push({ id: item.id, ...item.data() });
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < size) break;
  }
  return { rows: rows.slice(0, cap), truncated: rows.length >= cap };
}

/**
 * Paged reporting reads. Totals come from count(); row samples are capped so dashboards
 * never download a whole collection. Owner views are query-bound to ownerId/ownerUid.
 */
export async function loadReportingCollection(db: Firestore, collectionName: string, ownerUid?: string) {
  const col = collection(db, collectionName);
  if (ownerUid) {
    const [countById, countByUid, byId, byUid] = await Promise.all([
      getCountFromServer(query(col, where('ownerId', '==', ownerUid))),
      getCountFromServer(query(col, where('ownerUid', '==', ownerUid))),
      loadPages(db, collectionName, [where('ownerId', '==', ownerUid)], REPORTING_READ_CAP),
      loadPages(db, collectionName, [where('ownerUid', '==', ownerUid)], REPORTING_READ_CAP),
    ]);
    const merged = new Map<string, Record<string, any>>();
    for (const row of [...byId.rows, ...byUid.rows]) merged.set(String(row.id), row);
    const total = Math.max(countById.data().count, countByUid.data().count, merged.size);
    return {
      rows: [...merged.values()],
      total,
      truncated: byId.truncated || byUid.truncated || merged.size < total,
    };
  }

  const total = (await getCountFromServer(query(col))).data().count;
  const page = await loadPages(db, collectionName, [], REPORTING_READ_CAP);
  return { rows: page.rows, total, truncated: page.rows.length < total };
}
