import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  documentId,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type DocumentData,
  type Firestore,
  type Query,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

/** Page size for admin lists and owner reporting tables. */
export const ADMIN_LIST_PAGE_SIZE = 40;

const NO_CONSTRAINTS: QueryConstraint[] = [];

export type PagedRow = DocumentData & { id: string };

export type UsePagedCollectionOptions = {
  db: Firestore;
  collectionName: string;
  constraints?: QueryConstraint[];
  pageSize?: number;
  /** Defaults to document id so single-field filters do not need a new composite index. */
  orderByField?: string;
  orderDirection?: 'asc' | 'desc';
  enabled?: boolean;
  /** Change this when filters change so the first page reloads. */
  resetKey?: string;
};

async function countFor(base: Query): Promise<number | null> {
  try {
    return (await getCountFromServer(base)).data().count;
  } catch {
    return null;
  }
}

export function usePagedCollection<T extends PagedRow = PagedRow>(options: UsePagedCollectionOptions) {
  const {
    db,
    collectionName,
    constraints = NO_CONSTRAINTS,
    pageSize = ADMIN_LIST_PAGE_SIZE,
    orderByField,
    orderDirection = 'asc',
    enabled = true,
    resetKey = '',
  } = options;
  const [rows, setRows] = useState<T[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const loadPage = useCallback(async (from: QueryDocumentSnapshot | null, append: boolean) => {
    const size = Math.max(25, Math.min(50, Math.floor(pageSize)));
    const orderConstraint = orderByField
      ? orderBy(orderByField, orderDirection)
      : orderBy(documentId());
    const base = query(collection(db, collectionName), ...constraints, orderConstraint);
    const pageQuery = from
      ? query(base, startAfter(from), limit(size + 1))
      : query(base, limit(size + 1));
    const snap = await getDocs(pageQuery);
    const more = snap.docs.length > size;
    const docs = more ? snap.docs.slice(0, size) : snap.docs;
    const nextRows = docs.map((item) => ({ id: item.id, ...item.data() } as T));
    setRows((current) => (append ? [...current, ...nextRows] : nextRows));
    setCursor(docs.length ? docs[docs.length - 1] : from);
    setHasMore(more);
  }, [db, collectionName, constraints, pageSize, orderByField, orderDirection, resetKey]);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setRows([]);
      setHasMore(false);
      setTotal(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      await loadPage(null, false);
      setTotal(await countFor(query(collection(db, collectionName), ...constraints)));
    } catch (err: any) {
      setError(err?.message || 'This list could not be loaded.');
      setRows([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [enabled, loadPage, db, collectionName, constraints, resetKey]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !cursor) return;
    setLoadingMore(true);
    setError('');
    try {
      await loadPage(cursor, true);
    } catch (err: any) {
      setError(err?.message || 'More rows could not be loaded.');
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, cursor, loadPage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rows, total, hasMore, loading, loadingMore, error, loadMore, refresh };
}

