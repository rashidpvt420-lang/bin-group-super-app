import {
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

/** Default page size for heavy owner/admin list screens. */
export const LIST_PAGE_SIZE = 100;

export type Page<T = unknown> = {
  docs: QueryDocumentSnapshot<T>[];
  cursor: QueryDocumentSnapshot<T> | null;
  hasMore: boolean;
};

/**
 * Fetch one page of an (already rule-authorised) base query, ordered by document id so
 * no composite index is needed for single-equality filters. Pass the previous page's
 * cursor to continue. Fetches pageSize + 1 to know whether more exist.
 */
export async function fetchPage<T>(
  base: Query<T>,
  cursor: QueryDocumentSnapshot<T> | null,
  pageSize: number = LIST_PAGE_SIZE,
): Promise<Page<T>> {
  const size = Math.max(1, Math.min(500, Math.floor(pageSize)));
  const constraints = cursor
    ? [orderBy(documentId()), startAfter(cursor), limit(size + 1)]
    : [orderBy(documentId()), limit(size + 1)];
  const snap = await getDocs(query(base, ...constraints));
  const hasMore = snap.docs.length > size;
  const docs = hasMore ? snap.docs.slice(0, size) : snap.docs;
  return { docs, cursor: docs.length ? docs[docs.length - 1] : cursor, hasMore };
}
