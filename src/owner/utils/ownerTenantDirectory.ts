import { resolvePropertyDisplayName } from '../../../functions/shared/propertyDisplayName';

export type DirectoryDocument = { id: string; data: () => Record<string, unknown> };
export type DirectoryRow = { id: string; displayName: string; email: string; emailHref?: string; propertyName: string; unitNumber: string; status: string };
const text = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

export function tenantEmailHref(value: unknown): string | undefined {
    const email = text(value);
    // A single mailbox only: prevent mailto headers, recipient lists and control characters.
    if (!/^[^\s@,;<>:"?&#%]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) return undefined;
    return `mailto:${encodeURIComponent(email)}`;
}

export function resolveDirectoryRows(properties: DirectoryDocument[], tenants: DirectoryDocument[], ownerUid: string): DirectoryRow[] {
    const owned = new Map(properties.filter(p => p.data().ownerId === ownerUid).map(p => [p.id, p]));
    return tenants.filter(t => t.data().ownerId === ownerUid && t.data().role === 'tenant').map(t => {
        const data = t.data();
        const property = owned.get(text(data.propertyId));
        const email = text(data.email);
        return {
            id: t.id, displayName: text(data.displayName), email, emailHref: tenantEmailHref(email),
            propertyName: property ? resolvePropertyDisplayName(property.data(), { propertyId: property.id, fallback: '' }) : '',
            unitNumber: text(data.unitNumber), status: text(data.status),
        };
    });
}

export function filterDirectoryRows(rows: DirectoryRow[], search: string): DirectoryRow[] {
    const needle = search.trim().toLocaleLowerCase();
    return rows.filter(row => [row.displayName, row.email, row.propertyName, row.unitNumber].some(value => value.toLocaleLowerCase().includes(needle)));
}

/** Subscribe without allowing cancelled or superseded snapshots to publish rows. */
export function subscribeOwnerDirectory(
    ownerUid: string,
    properties: (next: (docs: DirectoryDocument[]) => void, fail: () => void) => () => void,
    tenants: (next: (docs: DirectoryDocument[]) => void, fail: () => void) => () => void,
    publish: (rows: DirectoryRow[], loading: boolean, failed: boolean) => void,
): () => void {
    let disposed = false;
    let revision = 0;
    let stopTenants: (() => void) | undefined;
    const clear = () => { revision++; stopTenants?.(); stopTenants = undefined; };
    const fail = () => { if (!disposed) { clear(); publish([], false, true); } };
    const stopProperties = properties(docs => {
        if (disposed) return;
        clear();
        const current = revision;
        if (!docs.length) { publish([], false, false); return; }
        publish([], true, false);
        stopTenants = tenants(tenantDocs => {
            if (!disposed && current === revision) publish(resolveDirectoryRows(docs, tenantDocs, ownerUid), false, false);
        }, () => { if (!disposed && current === revision) fail(); });
    }, fail);
    return () => { disposed = true; clear(); stopProperties(); };
}
