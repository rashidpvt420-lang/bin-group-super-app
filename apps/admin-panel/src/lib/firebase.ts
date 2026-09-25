import { initializeApp, getApps, getApp } from 'firebase/app';
import {
    getFirestore, collection, doc, getDoc, getDocs,
    setDoc as firestoreSetDoc, addDoc as firestoreAddDoc, updateDoc as firestoreUpdateDoc,
    query, where, orderBy, limit, onSnapshot, serverTimestamp as firestoreServerTimestamp,
    Timestamp, deleteDoc as firestoreDeleteDoc, writeBatch as firestoreWriteBatch, or, arrayUnion
} from 'firebase/firestore';

import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable as firebaseHttpsCallable } from 'firebase/functions';
import {
    getAuth,
    signInWithRedirect,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence,
    signOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';

type BinFirebaseConfig = {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
};

const clean = (value?: string): string => {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    if (normalized.includes('REPLACE_ME') || normalized.includes('REPLACE_WITH')) return '';
    return normalized;
};

const ADMIN_FIREBASE_APP_ID = '1:123413252227:web:285cb53bc26626d699f3b6';

// CRA/CRACO only embeds process.env.REACT_APP_* when references are static.
// The Admin panel must never consume the main web app's generic app ID. Use
// the dedicated Admin variable or the canonical public Admin Firebase app ID.
const firebaseConfig: BinFirebaseConfig = {
    apiKey: clean(process.env.REACT_APP_FIREBASE_API_KEY) || 'AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s',
    authDomain: clean(process.env.REACT_APP_FIREBASE_AUTH_DOMAIN) || 'bin-group-57c60.firebaseapp.com',
    projectId: clean(process.env.REACT_APP_FIREBASE_PROJECT_ID) || 'bin-group-57c60',
    storageBucket: clean(process.env.REACT_APP_FIREBASE_STORAGE_BUCKET) || 'bin-group-57c60.firebasestorage.app',
    messagingSenderId: clean(process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID) || '123413252227',
    appId: clean(process.env.REACT_APP_ADMIN_FIREBASE_APP_ID) || ADMIN_FIREBASE_APP_ID
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

if (typeof window !== 'undefined') {
    const enableAppCheck = clean(process.env.REACT_APP_ENABLE_FIREBASE_APPCHECK) === 'true';
    const isLocal = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');
    const siteKey = clean(process.env.REACT_APP_APP_CHECK_SITE_KEY);
    const appCheckRequired = process.env.NODE_ENV === 'production' && !isLocal;

    if (appCheckRequired && (!enableAppCheck || !siteKey)) {
        throw new Error('[Firebase] Admin App Check configuration is required in production.');
    }

    if (enableAppCheck) {
        const existingDebug = (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN;
        const hasRegisteredDebug =
            typeof existingDebug === 'string' &&
            existingDebug.length > 8 &&
            existingDebug !== 'true' &&
            existingDebug !== 'false';

        // Prefer Playwright-injected registered UUID. Only fall back to boolean
        // auto-debug on localhost when no UUID is present.
        if (!hasRegisteredDebug && isLocal) {
            (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
            console.log('App Check boolean debug token set for local testing.');
        }
        if (hasRegisteredDebug) {
            const fingerprint = `${String(existingDebug).slice(0, 8)}…${String(existingDebug).slice(-4)}`;
            console.info(`[Firebase] Admin App Check debug token fingerprint=${fingerprint}`);
        }

        if (siteKey) {
            try {
                initializeAppCheck(app, {
                    provider: new ReCaptchaEnterpriseProvider(siteKey),
                    isTokenAutoRefreshEnabled: true
                });
                console.log('App Check active.');
            } catch (err) {
                if (appCheckRequired) {
                    throw new Error('[Firebase] Admin App Check initialization failed in production.');
                }
                console.warn('App Check initialization failed in development:', err);
            }
        } else {
            console.warn('App Check site key missing or placeholder. App Check not initialized.');
        }
    } else {
        console.log('App Check is disabled via environment configuration.');
    }
}

const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const functions = getFunctions(app, 'europe-west3');

let sessionExpiryRedirectStarted = false;

const readErrorCode = (error: unknown) => {
    if (typeof error !== 'object' || error === null || !('code' in error)) return '';
    return String((error as { code?: unknown }).code || '').trim().toLowerCase();
};

const isUnauthenticatedCallableError = (error: unknown) => {
    const code = readErrorCode(error);
    const message = error instanceof Error ? error.message.trim().toLowerCase() : '';
    return code === 'functions/unauthenticated' || code === 'unauthenticated' || message === 'unauthenticated';
};

// These Firebase Auth failures prove that the browser session itself can no
// longer be trusted. Network/App Check/callable failures are deliberately not
// included: they must never destroy an otherwise valid Admin login session.
const TERMINAL_ADMIN_AUTH_CODES = new Set([
    'auth/user-token-expired',
    'auth/invalid-user-token',
    'auth/user-disabled',
    'auth/user-not-found',
]);

const isTerminalAdminAuthError = (error: unknown) => TERMINAL_ADMIN_AUTH_CODES.has(readErrorCode(error));

const expireStaleAdminSession = () => {
    if (typeof window === 'undefined' || sessionExpiryRedirectStarted) return;
    sessionExpiryRedirectStarted = true;
    sessionStorage.removeItem('bin-admin-security-session');
    void signOut(auth).catch(() => undefined).finally(() => {
        if (window.location.pathname !== '/login') {
            window.location.replace('/login?session=expired');
        } else {
            sessionExpiryRedirectStarted = false;
        }
    });
};

const httpsCallable: typeof firebaseHttpsCallable = ((functionsInstance: any, name: string, options?: any) => {
    const callable: any = firebaseHttpsCallable(functionsInstance, name, options);
    const wrapped: any = async (data?: unknown) => {
        try {
            return await callable(data);
        } catch (error) {
            if (!isUnauthenticatedCallableError(error)) throw error;

            const currentUser = auth.currentUser;
            if (!currentUser) {
                expireStaleAdminSession();
                throw error;
            }
            const originalUid = currentUser.uid;

            // A callable may return unauthenticated because its Auth/App Check
            // token arrived during rotation. Force a real Auth refresh first.
            // A successful refresh proves that the Firebase browser session is
            // still alive, so retry exactly once without globally signing out.
            try {
                await currentUser.getIdToken(true);
            } catch (refreshError) {
                if (isTerminalAdminAuthError(refreshError)) {
                    expireStaleAdminSession();
                }
                throw refreshError;
            }

            // Never replay a privileged Admin action under a different account
            // if authentication changed while the forced token refresh was in
            // flight. There is intentionally no await between this identity
            // check and the retry, so an auth-state callback cannot interleave.
            if (auth.currentUser?.uid !== originalUid) {
                throw new Error('ADMIN_AUTH_IDENTITY_CHANGED_DURING_CALLABLE_RETRY');
            }

            // If the retry is still unauthenticated, surface that callable/App
            // Check error to the screen. Do not erase a valid Firebase session.
            return await callable(data);
        }
    };
    if (typeof callable.stream === 'function') {
        wrapped.stream = callable.stream.bind(callable);
    }
    return wrapped;
}) as typeof firebaseHttpsCallable;

const pendingAuditWrites = new Map<string, Promise<void>>();

const inferLegacyAuditTarget = (data: any) => {
    const explicitTargetType = String(data?.targetType || data?.entityType || '').trim();
    const explicitTargetId = String(data?.targetId || data?.entityId || '').trim();
    const legacyTargets: Array<[string, string]> = [
        ['contractId', 'contracts'],
        ['paymentId', 'payment_transactions'],
        ['paymentTransactionId', 'payment_transactions'],
        ['propertyId', 'properties'],
        ['ownerId', 'owners'],
        ['ownerUid', 'owners'],
        ['tenantId', 'tenants'],
        ['tenantUid', 'tenants'],
        ['leadId', 'broker_leads'],
        ['referralId', 'broker_referrals'],
        ['staffId', 'staff'],
        ['userId', 'users'],
        ['actorId', 'users'],
    ];
    if (explicitTargetType && explicitTargetId) return { targetType: explicitTargetType, targetId: explicitTargetId };
    for (const [field, fallbackType] of legacyTargets) {
        const targetId = String(data?.[field] || '').trim();
        if (targetId) return { targetType: explicitTargetType || fallbackType, targetId };
    }
    return { targetType: explicitTargetType, targetId: explicitTargetId };
};

type AdminMutationOperation = {
    kind: 'create' | 'set' | 'update' | 'delete';
    path: string;
    data?: Record<string, unknown>;
    merge?: boolean;
};

const serverTimestamp = (() => ({ __binFirestoreType: 'serverTimestamp' })) as typeof firestoreServerTimestamp;

const serializeAdminMutationValue = (value: any): any => {
    if (value === undefined) return undefined;
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(serializeAdminMutationValue);
    if (value instanceof Date) return { __binFirestoreType: 'date', value: value.toISOString() };
    if (typeof value?.toDate === 'function') {
        const date = value.toDate();
        if (date instanceof Date && !Number.isNaN(date.getTime())) {
            return { __binFirestoreType: 'date', value: date.toISOString() };
        }
    }
    return Object.fromEntries(
        Object.entries(value)
            .filter(([, nested]) => nested !== undefined)
            .map(([key, nested]) => [key, serializeAdminMutationValue(nested)]),
    );
};

const runAdminMutation = async (operations: AdminMutationOperation[]) => {
    if (!operations.length) return;
    const mutate = httpsCallable(functions, 'adminAuthorizedFirestoreMutation');
    await mutate({
        operations: operations.map((operation) => ({
            ...operation,
            ...(operation.data ? { data: serializeAdminMutationValue(operation.data) } : {}),
        })),
    });
};

/**
 * Compatibility bridge for historical Admin screens. Audit collections keep
 * their dedicated logger. Every other Admin Firestore mutation is sent through
 * an App Check-protected, Firebase Auth + MFA-authorized Cloud Function that
 * applies server policy and appends an immutable audit event.
 */
const addDoc: typeof firestoreAddDoc = (async (reference: any, data: any) => {
    const collectionPath = String(reference?.path || '');
    if (collectionPath === 'audit_logs' || collectionPath === 'auditLogs') {
        const action = String(data?.action || '').trim();
        const { targetType, targetId } = inferLegacyAuditTarget(data);
        if (!action || !targetType || !targetId) {
            throw new Error('Audit writes require action and a target identifier.');
        }
        const {
            actorId, actorRole, createdAt: _createdAt, timestamp: _timestamp,
            metadata, before, after, userAgent, action: _action,
            targetType: _targetType, targetId: _targetId, ...extra
        } = data || {};
        const auditMetadata: Record<string, unknown> = {
            ...(metadata && typeof metadata === 'object' ? metadata : {}),
            ...extra,
            ...(before !== undefined ? { before } : {}),
            ...(after !== undefined ? { after } : {}),
            ...(userAgent ? { userAgent } : {}),
            ...(actorId ? { legacyClaimedActorId: actorId } : {}),
            ...(actorRole ? { legacyClaimedActorRole: actorRole } : {}),
            sourceCollection: collectionPath,
        };
        const dedupeKey = `${action}|${targetType}|${targetId}`;
        let pending = pendingAuditWrites.get(dedupeKey);
        if (!pending) {
            const logUserAuditAction = firebaseHttpsCallable(functions, 'logUserAuditAction');
            pending = logUserAuditAction({ action, targetType, targetId, metadata: auditMetadata }).then(() => undefined);
            pendingAuditWrites.set(dedupeKey, pending);
            const cleanup = () => queueMicrotask(() => {
                if (pendingAuditWrites.get(dedupeKey) === pending) pendingAuditWrites.delete(dedupeKey);
            });
            void pending.then(cleanup, cleanup);
        }
        await pending;
        return doc(reference);
    }
    const generatedRef = doc(reference);
    await runAdminMutation([{ kind: 'create', path: generatedRef.path, data }]);
    return generatedRef;
}) as typeof firestoreAddDoc;

const setDoc: typeof firestoreSetDoc = (async (reference: any, data: any, options?: any) => {
    if (options?.mergeFields) throw new Error('Admin mergeFields writes require a dedicated server workflow.');
    await runAdminMutation([{ kind: 'set', path: String(reference.path), data, merge: options?.merge === true }]);
}) as typeof firestoreSetDoc;

const updateDoc: typeof firestoreUpdateDoc = (async (reference: any, data: any, ...moreFields: any[]) => {
    if (moreFields.length || !data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Admin field-path update overloads require a dedicated server workflow.');
    }
    await runAdminMutation([{ kind: 'update', path: String(reference.path), data }]);
}) as typeof firestoreUpdateDoc;

const deleteDoc: typeof firestoreDeleteDoc = (async (reference: any) => {
    await runAdminMutation([{ kind: 'delete', path: String(reference.path) }]);
}) as typeof firestoreDeleteDoc;

const writeBatch: typeof firestoreWriteBatch = ((_firestore: any) => {
    const operations: AdminMutationOperation[] = [];
    const batch: any = {
        set(reference: any, data: any, options?: any) {
            if (options?.mergeFields) throw new Error('Admin mergeFields batches require a dedicated server workflow.');
            operations.push({ kind: 'set', path: String(reference.path), data, merge: options?.merge === true });
            return batch;
        },
        update(reference: any, data: any, ...moreFields: any[]) {
            if (moreFields.length || !data || typeof data !== 'object' || Array.isArray(data)) {
                throw new Error('Admin field-path batch updates require a dedicated server workflow.');
            }
            operations.push({ kind: 'update', path: String(reference.path), data });
            return batch;
        },
        delete(reference: any) {
            operations.push({ kind: 'delete', path: String(reference.path) });
            return batch;
        },
        async commit() {
            await runAdminMutation(operations);
            return [];
        },
    };
    return batch;
}) as typeof firestoreWriteBatch;

export {
    app, db, auth, storage, functions, httpsCallable, getMessaging, getToken, isSupported,
    onAuthStateChanged,
    collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp, deleteDoc, writeBatch, or, arrayUnion,
    ref, uploadBytes, getDownloadURL, signInWithRedirect, signInWithEmailAndPassword, setPersistence, browserLocalPersistence
};
export type { User };
export default app;
