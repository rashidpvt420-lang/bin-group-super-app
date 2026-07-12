import { initializeApp, getApps, getApp } from 'firebase/app';
import {
    getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc as firestoreAddDoc,
    updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp,
    Timestamp, deleteDoc, writeBatch, or, arrayUnion
} from 'firebase/firestore';

import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth, signInWithRedirect, signInWithEmailAndPassword, onAuthStateChanged, setPersistence, browserLocalPersistence } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

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

// CRA/CRACO only embeds process.env.REACT_APP_* when references are static.
// Do not use dynamic process.env[key] here; it is not replaced during build.
const firebaseConfig: BinFirebaseConfig = {
    apiKey: clean(process.env.REACT_APP_FIREBASE_API_KEY) || 'AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s',
    authDomain: clean(process.env.REACT_APP_FIREBASE_AUTH_DOMAIN) || 'bin-group-57c60.firebaseapp.com',
    projectId: clean(process.env.REACT_APP_FIREBASE_PROJECT_ID) || 'bin-group-57c60',
    storageBucket: clean(process.env.REACT_APP_FIREBASE_STORAGE_BUCKET) || 'bin-group-57c60.firebasestorage.app',
    messagingSenderId: clean(process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID) || '123413252227',
    appId: clean(process.env.REACT_APP_FIREBASE_APP_ID) || '1:123413252227:web:285cb53bc26626d699f3b6'
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

if (typeof window !== 'undefined') {
    const enableAppCheck = clean(process.env.REACT_APP_ENABLE_FIREBASE_APPCHECK) === 'true';
    const isLocal = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');

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

        const siteKey = clean(process.env.REACT_APP_APP_CHECK_SITE_KEY);
        if (siteKey) {
            try {
                initializeAppCheck(app, {
                    provider: new ReCaptchaV3Provider(siteKey),
                    isTokenAutoRefreshEnabled: true
                });
                console.log('App Check active.');
            } catch (err) {
                console.warn('App Check initialization failed:', err);
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

    if (explicitTargetType && explicitTargetId) {
        return { targetType: explicitTargetType, targetId: explicitTargetId };
    }

    for (const [field, fallbackType] of legacyTargets) {
        const targetId = String(data?.[field] || '').trim();
        if (targetId) {
            return { targetType: explicitTargetType || fallbackType, targetId };
        }
    }

    return { targetType: explicitTargetType, targetId: explicitTargetId };
};

/**
 * Compatibility bridge for legacy screens that still call addDoc() directly on
 * audit_logs/auditLogs. Security Rules deny those client writes by design, so
 * route them through the authenticated Cloud Function instead. All other
 * collections retain the native Firestore addDoc behavior.
 */
const addDoc: typeof firestoreAddDoc = (async (reference: any, data: any) => {
    const collectionPath = String(reference?.path || '');
    if (collectionPath !== 'audit_logs' && collectionPath !== 'auditLogs') {
        return firestoreAddDoc(reference, data);
    }

    const action = String(data?.action || '').trim();
    const { targetType, targetId } = inferLegacyAuditTarget(data);
    if (!action || !targetType || !targetId) {
        throw new Error('Audit writes require action and a target identifier.');
    }

    const {
        actorId,
        actorRole,
        createdAt: _createdAt,
        timestamp: _timestamp,
        metadata,
        before,
        after,
        userAgent,
        action: _action,
        targetType: _targetType,
        targetId: _targetId,
        ...extra
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

    // Some legacy flows wrote the same event to both audit_logs and auditLogs
    // in one Promise.all. Deduplicate only while the first callable is pending.
    const dedupeKey = `${action}|${targetType}|${targetId}`;
    let pending = pendingAuditWrites.get(dedupeKey);
    if (!pending) {
        const logUserAuditAction = httpsCallable(functions, 'logUserAuditAction');
        pending = logUserAuditAction({ action, targetType, targetId, metadata: auditMetadata }).then(() => undefined);
        pendingAuditWrites.set(dedupeKey, pending);
        const cleanup = () => queueMicrotask(() => {
            if (pendingAuditWrites.get(dedupeKey) === pending) pendingAuditWrites.delete(dedupeKey);
        });
        void pending.then(cleanup, cleanup);
    }

    await pending;
    return doc(reference);
}) as typeof firestoreAddDoc;

export {
    app, db, auth, storage, functions, httpsCallable, getMessaging, getToken, isSupported,
    onAuthStateChanged,
    collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp, deleteDoc, writeBatch, or, arrayUnion,
    ref, uploadBytes, getDownloadURL, signInWithRedirect, signInWithEmailAndPassword, setPersistence, browserLocalPersistence
};
export type { User };
export default app;
