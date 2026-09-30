// N-26: the Admin Tenants page opened live listeners on all owners and all properties inside a
// mount effect without returning an unsubscribe and without an error handler. Every mount leaked
// two more listeners, and a permission/index error left the lookups silently empty.

export type LookupRow = { id: string; [key: string]: unknown };
type SnapshotLike = { docs: Array<{ id: string; data: () => Record<string, unknown> }> };
export type LookupListen = (onNext: (snapshot: SnapshotLike) => void, onError: (error: unknown) => void) => () => void;

export interface TenantLookupHandlers {
    onOwners: (rows: LookupRow[]) => void;
    onProperties: (rows: LookupRow[]) => void;
    onError: (source: 'owners' | 'properties', error: unknown) => void;
}

const toRows = (snapshot: SnapshotLike): LookupRow[] => snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));

/** Subscribes both lookups and returns one cleanup that detaches both (idempotent). */
export function subscribeTenantLookups(
    listeners: { owners: LookupListen; properties: LookupListen },
    handlers: TenantLookupHandlers,
): () => void {
    let active = true;
    const guard = <T,>(fn: (value: T) => void) => (value: T) => { if (active) fn(value); };
    const unsubscribers = [
        listeners.owners(guard((snapshot) => handlers.onOwners(toRows(snapshot))), guard((error) => handlers.onError('owners', error))),
        listeners.properties(guard((snapshot) => handlers.onProperties(toRows(snapshot))), guard((error) => handlers.onError('properties', error))),
    ];
    return () => {
        if (!active) return;
        active = false;
        unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
}
