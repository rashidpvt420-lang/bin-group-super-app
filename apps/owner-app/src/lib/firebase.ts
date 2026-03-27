// apps/owner-app/src/lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from 'firebase/analytics';
import { getFunctions } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { 
    getFirestore, 
    collection, 
    enableIndexedDbPersistence, 
    doc, 
    getDoc, 
    getDocs,
    setDoc,
    addDoc,
    updateDoc,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    serverTimestamp,
    deleteDoc,
    collectionGroup,
    writeBatch
} from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s",
    authDomain: "bin-group-57c60.firebaseapp.com",
    databaseURL: "https://bin-group-57c60-default-rtdb.firebaseio.com",
    projectId: "bin-group-57c60",
    storageBucket: "bin-group-57c60.firebasestorage.app",
    messagingSenderId: "123413252227",
    appId: "1:123413252227:web:285cb53bc26626d699f3b6",
    measurementId: "G-63X8EKNMF5"
};

// 💎 Local App Singleton
const _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const _db = getFirestore(_app);

if (typeof window !== 'undefined') {
    (window as any)._firestoreDb = _db;
    enableIndexedDbPersistence(_db).catch(() => {});
}

export const app = _app;
export const db = _db;
export const auth = getAuth(_app);
export const storage = getStorage(_app);
export const functions = getFunctions(_app);
export const analytics = typeof window !== 'undefined' ? getAnalytics(_app) : null;

// 🛡️ App Check Security (V1.4 Lockdown)
if (typeof window !== 'undefined') {
    // Enable debug mode for local testing across all likely local hostnames
    const isLocalhost = 
        window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' || 
        window.location.hostname.includes('192.168.') ||
        window.location.hostname.endsWith('.local');

    if (isLocalhost) {
        console.warn('[BIN-SECURITY] Protocol bypassing AppCheck for localized node verification.');
        (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }

    // [CRITICAL] Temporarily bypassing App Check on production to unblock launch/login issues.
    // The current reCAPTCHA key appears to be returning an 'invalid-token' response on the .web.app domain.
    /*
    if (!isLocalhost) {
        try {
            initializeAppCheck(_app, {
                provider: new ReCaptchaV3Provider('6LdWtpsqAAAAAO-6Y3mmqCkpkFBZRNPuMVwNIOSn'),
                isTokenAutoRefreshEnabled: true
            });
        } catch (err) {
            console.error('[BIN-SECURITY] AppCheck initialization failed:', err);
        }
    } else {
        console.log('[BIN-SECURITY] AppCheck initialization skipped on localhost protocol.');
    }
    */
    console.warn('[BIN-SECURITY] AppCheck is disabled on all protocols to allow administrative unblocking.');
}

// ─── FireStore Primitives ────────────────────────────────────────────────────
export { 
    collection, 
    doc, 
    getDoc, 
    getDocs, 
    setDoc, 
    addDoc, 
    updateDoc, 
    query, 
    where, 
    orderBy, 
    limit, 
    onSnapshot, 
    serverTimestamp, 
    deleteDoc,
    collectionGroup,
    writeBatch
};

// Finalized App Singleton Registry
export default app;
