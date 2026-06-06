/**
 * OCR Security Guards — Unit Tests
 *
 * Imports production helper functions from the compiled lib/ output.
 * Zero live Firebase / Storage / Vertex AI calls — stubs only.
 *
 * Run:  node --test functions/test/ocr-guards.test.cjs
 *   or: npm run test:ocr-guards   (from functions/ directory)
 *
 * Node ≥ 22 required (node:test built-in runner).
 */

'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');

// ── Import production guards from compiled output ─────────────────────────────
const {
    validateStorageUrl,
    parseFirebaseStoragePath,
    assertOcrCallerRole,
    verifyStorageObjectOwnership,
    MAX_FILE_BYTES,
    ALLOWED_MIME_TYPES,
} = require('../lib/ocrSecurityGuards');

// ── Stubs / helpers ───────────────────────────────────────────────────────────

const VALID_FB_URL =
    'https://firebasestorage.googleapis.com/v0/b/bin-group-57c60.appspot.com' +
    '/o/title_deeds%2Fowner_a%2Fdeed.pdf?alt=media&token=abc';

const VALID_GCS_URL =
    'https://storage.googleapis.com/bin-group-57c60.appspot.com/title_deeds/owner_a/deed.pdf';

/** Stub getUserRole — maps uid to a Firestore user document. */
function makeRoleStore(map) {
    return async (uid) => map[uid] || {};
}

/** Stub getFileMeta — maps path to fake Storage metadata, or throws on null. */
function makeFileStore(map) {
    return async (path) => {
        if (!(path in map) || map[path] === null) {
            throw new Error('Object not found');
        }
        return map[path];
    };
}

const ownerA_roleStore  = makeRoleStore({ owner_a: { role: 'owner' } });
const admin_roleStore   = makeRoleStore({ admin_user: { role: 'admin', isAdmin: true } });
const tenant_roleStore  = makeRoleStore({ tenant_x: { role: 'tenant' } });
const tech_roleStore    = makeRoleStore({ tech_x:   { role: 'technician' } });
const broker_roleStore  = makeRoleStore({ broker_x: { role: 'broker' } });

const VALID_PATH = 'title_deeds/owner_a/deed.pdf';

// ─────────────────────────────────────────────────────────────────────────────
// 1. validateStorageUrl
// ─────────────────────────────────────────────────────────────────────────────

describe('validateStorageUrl', () => {

    it('accepts valid firebasestorage.googleapis.com URL', () => {
        assert.doesNotThrow(() => validateStorageUrl(VALID_FB_URL));
    });

    it('accepts valid storage.googleapis.com URL', () => {
        assert.doesNotThrow(() => validateStorageUrl(VALID_GCS_URL));
    });

    it('rejects external URL (example.com)', () => {
        assert.throws(
            () => validateStorageUrl('https://example.com/file.pdf'),
            { message: /disallowed url origin/i }
        );
    });

    it('rejects GCP metadata endpoint (169.254.169.254)', () => {
        assert.throws(
            () => validateStorageUrl('http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token'),
            (err) => {
                // fails allow-list check (not a Storage host) before reaching private-IP check
                assert.match(err.message, /disallowed url origin|private\/internal/i);
                return true;
            }
        );
    });

    it('rejects private IP URL (10.0.0.1)', () => {
        assert.throws(
            () => validateStorageUrl('http://10.0.0.1/secrets'),
            { message: /disallowed url origin|private\/internal/i }
        );
    });

    it('rejects metadata.google.internal', () => {
        assert.throws(
            () => validateStorageUrl('http://metadata.google.internal/computeMetadata/v1/'),
            { message: /disallowed url origin|private\/internal/i }
        );
    });

    it('rejects invalid (non-parseable) URL', () => {
        assert.throws(
            () => validateStorageUrl('not-a-url'),
            { message: /invalid url format/i }
        );
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// 2. parseFirebaseStoragePath
// ─────────────────────────────────────────────────────────────────────────────

describe('parseFirebaseStoragePath', () => {

    it('parses firebasestorage.googleapis.com URL correctly', () => {
        const path = parseFirebaseStoragePath(VALID_FB_URL);
        assert.equal(path, 'title_deeds/owner_a/deed.pdf');
    });

    it('parses storage.googleapis.com URL correctly', () => {
        const path = parseFirebaseStoragePath(VALID_GCS_URL);
        assert.equal(path, 'title_deeds/owner_a/deed.pdf');
    });

    it('decodes percent-encoded path segments', () => {
        const url = 'https://firebasestorage.googleapis.com/v0/b/bucket.appspot.com/o/folder%2Fsub%2Ffile.pdf?alt=media';
        assert.equal(parseFirebaseStoragePath(url), 'folder/sub/file.pdf');
    });

    it('throws on unrecognised hostname', () => {
        assert.throws(
            () => parseFirebaseStoragePath('https://example.com/bucket/file.pdf'),
            { message: /unrecognised storage hostname/i }
        );
    });

    it('throws when firebasestorage path has no /o/ segment', () => {
        assert.throws(
            () => parseFirebaseStoragePath('https://firebasestorage.googleapis.com/v0/b/bucket'),
            { message: /could not parse object path/i }
        );
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// 3. assertOcrCallerRole
// ─────────────────────────────────────────────────────────────────────────────

describe('assertOcrCallerRole', () => {

    it('throws unauthenticated when auth is null', async () => {
        await assert.rejects(
            () => assertOcrCallerRole(null, makeRoleStore({})),
            (err) => { assert.equal(err.code, 'unauthenticated'); return true; }
        );
    });

    it('throws unauthenticated when auth is undefined', async () => {
        await assert.rejects(
            () => assertOcrCallerRole(undefined, makeRoleStore({})),
            (err) => { assert.equal(err.code, 'unauthenticated'); return true; }
        );
    });

    it('rejects tenant role → permission-denied', async () => {
        await assert.rejects(
            () => assertOcrCallerRole({ uid: 'tenant_x', token: { role: 'tenant' } }, tenant_roleStore),
            (err) => { assert.equal(err.code, 'permission-denied'); return true; }
        );
    });

    it('rejects technician role → permission-denied', async () => {
        await assert.rejects(
            () => assertOcrCallerRole({ uid: 'tech_x', token: { role: 'technician' } }, tech_roleStore),
            (err) => { assert.equal(err.code, 'permission-denied'); return true; }
        );
    });

    it('rejects broker role → permission-denied', async () => {
        await assert.rejects(
            () => assertOcrCallerRole({ uid: 'broker_x', token: { role: 'broker' } }, broker_roleStore),
            (err) => { assert.equal(err.code, 'permission-denied'); return true; }
        );
    });

    it('accepts owner role via Firestore → isAdmin: false', async () => {
        const result = await assertOcrCallerRole(
            { uid: 'owner_a', token: {} },
            ownerA_roleStore
        );
        assert.equal(result.isAdmin, false);
    });

    it('accepts owner role via token claim → isAdmin: false', async () => {
        const result = await assertOcrCallerRole(
            { uid: 'owner_a', token: { role: 'owner' } },
            makeRoleStore({}) // Firestore not reached due to token fast-path
        );
        assert.equal(result.isAdmin, false);
    });

    it('accepts admin via token claim → isAdmin: true', async () => {
        const result = await assertOcrCallerRole(
            { uid: 'admin_user', token: { role: 'admin', admin: true } },
            makeRoleStore({})
        );
        assert.equal(result.isAdmin, true);
    });

    it('accepts super_admin via token claim → isAdmin: true', async () => {
        const result = await assertOcrCallerRole(
            { uid: 'su', token: { role: 'super_admin', super_admin: true } },
            makeRoleStore({})
        );
        assert.equal(result.isAdmin, true);
    });

    it('accepts admin via Firestore isAdmin flag → isAdmin: true', async () => {
        const result = await assertOcrCallerRole(
            { uid: 'admin_user', token: {} },
            admin_roleStore
        );
        assert.equal(result.isAdmin, true);
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// 4. verifyStorageObjectOwnership
// ─────────────────────────────────────────────────────────────────────────────

describe('verifyStorageObjectOwnership', () => {

    it('accepts object where metadata.ownerUid matches callerUid', async () => {
        const fileStore = makeFileStore({
            [VALID_PATH]: { metadata: { ownerUid: 'owner_a' } }
        });
        await assert.doesNotReject(
            () => verifyStorageObjectOwnership(VALID_PATH, 'owner_a', fileStore)
        );
    });

    it('throws not-found when object does not exist (getFileMeta throws)', async () => {
        const fileStore = makeFileStore({ [VALID_PATH]: null });
        await assert.rejects(
            () => verifyStorageObjectOwnership(VALID_PATH, 'owner_a', fileStore),
            (err) => { assert.equal(err.code, 'not-found'); return true; }
        );
    });

    it('throws permission-denied when metadata.ownerUid is missing', async () => {
        const fileStore = makeFileStore({ [VALID_PATH]: { metadata: {} } });
        await assert.rejects(
            () => verifyStorageObjectOwnership(VALID_PATH, 'owner_a', fileStore),
            (err) => {
                assert.equal(err.code, 'permission-denied');
                assert.match(err.message, /no ownership metadata/i);
                return true;
            }
        );
    });

    it('throws permission-denied when metadata is entirely absent', async () => {
        const fileStore = makeFileStore({ [VALID_PATH]: {} });
        await assert.rejects(
            () => verifyStorageObjectOwnership(VALID_PATH, 'owner_a', fileStore),
            (err) => { assert.equal(err.code, 'permission-denied'); return true; }
        );
    });

    it('throws permission-denied when ownerUid belongs to a different user', async () => {
        const fileStore = makeFileStore({
            [VALID_PATH]: { metadata: { ownerUid: 'owner_b' } }
        });
        await assert.rejects(
            () => verifyStorageObjectOwnership(VALID_PATH, 'owner_a', fileStore),
            (err) => {
                assert.equal(err.code, 'permission-denied');
                assert.match(err.message, /do not own/i);
                return true;
            }
        );
    });

});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Exported constants
// ─────────────────────────────────────────────────────────────────────────────

describe('exported constants', () => {

    it('MAX_FILE_BYTES is 10 MB', () => {
        assert.equal(MAX_FILE_BYTES, 10 * 1024 * 1024);
    });

    it('ALLOWED_MIME_TYPES includes application/pdf', () => {
        assert.ok(ALLOWED_MIME_TYPES.has('application/pdf'));
    });

    it('ALLOWED_MIME_TYPES rejects application/zip', () => {
        assert.ok(!ALLOWED_MIME_TYPES.has('application/zip'));
    });

    it('ALLOWED_MIME_TYPES rejects text/html', () => {
        assert.ok(!ALLOWED_MIME_TYPES.has('text/html'));
    });

});
