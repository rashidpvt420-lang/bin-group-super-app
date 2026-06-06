/**
 * OCR Security Guards — Pure helper functions for processTitleDeedOCR
 *
 * All four exports are intentionally free of firebase-admin / firebase-functions
 * DIRECT calls so they can be tested without live infrastructure.
 *
 * Callers (index.ts / processTitleDeedOCR) inject real adapters.
 * Tests inject stubs.
 */

import { HttpsError } from 'firebase-functions/v2/https';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum file size accepted for OCR (10 MB). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Allowed MIME types for title deed documents. */
export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/tiff',
]);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OcrAuthContext {
    uid: string;
    token: Record<string, unknown>;
}

/** Adapter injected by callers to fetch a user's Firestore role document. */
export type GetUserRoleFn = (uid: string) => Promise<Record<string, unknown>>;

/** Adapter injected by callers to fetch Storage object custom metadata. */
export type GetFileMetaFn = (storagePath: string) => Promise<Record<string, unknown>>;

// ── Guard 1: SSRF URL allow-list ──────────────────────────────────────────────

/**
 * Validates that the URL is a Firebase Storage URL and not a private/internal address.
 * Throws a plain Error (not HttpsError) so it can be used inside ocrEngine without
 * a firebase-functions dependency.
 */
export function validateStorageUrl(url: string): void {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error('Invalid URL format.');
    }

    const allowedHosts = [
        'firebasestorage.googleapis.com',
        'storage.googleapis.com',
    ];
    if (!allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h))) {
        throw new Error(
            `Disallowed URL origin: ${parsed.hostname}. Only Firebase Storage URLs are accepted.`
        );
    }

    const lowerHost = parsed.hostname.toLowerCase();
    if (
        lowerHost === 'localhost' ||
        lowerHost === '127.0.0.1' ||
        lowerHost === '169.254.169.254' ||        // GCP metadata service
        lowerHost === 'metadata.google.internal' ||
        lowerHost.startsWith('10.')  ||
        lowerHost.startsWith('192.168.') ||
        lowerHost.startsWith('172.')
    ) {
        throw new Error('Private/internal network addresses are not permitted.');
    }
}

// ── Guard 2: Storage path parser ──────────────────────────────────────────────

/**
 * Parses the object path from a Firebase Storage download URL.
 *
 * Handles both formats the project produces:
 *   firebasestorage.googleapis.com  →  /v0/b/{bucket}/o/{encoded-path}?...
 *   storage.googleapis.com          →  /{bucket}/{path}
 *
 * Returns the decoded object path (e.g. "title_deeds/uid123/deed.pdf").
 * Throws a plain Error on parse failure.
 */
export function parseFirebaseStoragePath(fileUrl: string): string {
    const url = new URL(fileUrl);
    const { hostname, pathname } = url;

    if (hostname === 'firebasestorage.googleapis.com') {
        // /v0/b/{bucket}/o/{encoded-path}
        const match = pathname.match(/^\/v0\/b\/[^/]+\/o\/(.+)$/);
        if (!match) throw new Error('Could not parse object path from firebasestorage URL.');
        return decodeURIComponent(match[1]);
    }

    if (hostname === 'storage.googleapis.com') {
        // /{bucket}/{path...} — first segment is the bucket name
        const parts = pathname.replace(/^\//, '').split('/');
        if (parts.length < 2) throw new Error('Could not parse object path from storage.googleapis.com URL.');
        return parts.slice(1).join('/');
    }

    throw new Error(`Unrecognised Storage hostname: ${hostname}`);
}

// ── Guard 3: Role enforcement ─────────────────────────────────────────────────

function normalizeRole(r: unknown): string {
    return (r || '').toString().trim().toLowerCase();
}

/**
 * Asserts the caller has at least owner-level access to the OCR endpoint.
 * Returns `{ isAdmin: true }` when the caller is admin/super_admin (ownership bypass),
 * `{ isAdmin: false }` for owners.
 *
 * @param auth          - Firebase auth context (uid + decoded token claims).
 * @param getUserRole   - Injected adapter: returns the caller's Firestore user document.
 * @throws HttpsError('unauthenticated')  — no auth context.
 * @throws HttpsError('permission-denied') — role is not owner/admin/super_admin.
 */
export async function assertOcrCallerRole(
    auth: OcrAuthContext | null | undefined,
    getUserRole: GetUserRoleFn
): Promise<{ isAdmin: boolean }> {
    if (!auth) throw new HttpsError('unauthenticated', 'Sovereign identity required.');

    const token = auth.token || {};
    const tokenRole = normalizeRole(token['role']);
    const tokenAdmin = token['admin'] === true || token['super_admin'] === true;

    // Fast-path: admin/super_admin token claim
    if (tokenAdmin) return { isAdmin: true };

    const allowedRoles = new Set(['owner', 'admin', 'super_admin']);
    const adminRoles   = new Set(['admin', 'super_admin']);

    if (allowedRoles.has(tokenRole)) {
        return { isAdmin: adminRoles.has(tokenRole) };
    }

    // Slow-path: check Firestore user document
    const userData = await getUserRole(auth.uid);
    const firestoreRole = normalizeRole(userData['role'] || userData['userRole'] || userData['primaryRole']);

    if (
        userData['isAdmin'] === true ||
        userData['admin']   === true ||
        userData['superAdmin'] === true ||
        userData['super_admin'] === true
    ) {
        return { isAdmin: true };
    }

    if (!allowedRoles.has(firestoreRole)) {
        throw new HttpsError('permission-denied', 'Owner or admin role required.');
    }

    return { isAdmin: adminRoles.has(firestoreRole) };
}

// ── Guard 4: Per-object Storage ownership check ───────────────────────────────

/**
 * Verifies the Storage object's custom metadata.ownerUid matches the caller's uid.
 *
 * @param storagePath    - Decoded GCS object path (e.g. "title_deeds/uid/deed.pdf").
 * @param callerUid      - request.auth.uid of the calling owner.
 * @param getFileMeta    - Injected adapter: returns the object's custom metadata record.
 *                         Must throw any error if the object does not exist.
 * @throws HttpsError('not-found')         — object missing / inaccessible.
 * @throws HttpsError('permission-denied') — ownerUid absent or mismatched.
 */
export async function verifyStorageObjectOwnership(
    storagePath: string,
    callerUid: string,
    getFileMeta: GetFileMetaFn
): Promise<void> {
    let meta: Record<string, unknown>;
    try {
        meta = await getFileMeta(storagePath);
    } catch {
        throw new HttpsError('not-found', 'Storage object could not be located or accessed.');
    }

    // firebase-admin getMetadata() nests custom metadata under metadata.metadata
    const customMeta = meta['metadata'] as Record<string, unknown> | undefined;
    const objectOwnerUid = customMeta?.['ownerUid'] as string | undefined;

    if (!objectOwnerUid) {
        throw new HttpsError(
            'permission-denied',
            'Storage object has no ownership metadata. Only objects uploaded via the BIN GROUP portal are accepted.'
        );
    }

    if (objectOwnerUid !== callerUid) {
        throw new HttpsError('permission-denied', 'You do not own this Storage object.');
    }
}
