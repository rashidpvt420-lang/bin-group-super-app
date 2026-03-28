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
    authDomain: "bin-group-57c60.web.app",
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

if (typeof window !== 'undefined') {
    const isLocalhost = 
        window.location.hostname === 'localhost' || 
        window.location.hostname === '127.0.0.1' || 
        window.location.hostname.includes('192.168.') ||
        window.location.hostname.endsWith('.local');

    // 🛡️ App Check Security (V1.21 Sovereign Platform Finalization)
    if (process.env.NODE_ENV === 'production') {
        try {
            initializeAppCheck(app, {
                provider: new ReCaptchaV3Provider('6Lfm270qAAAAAL7-7M2Z_7Z-7M2Z_7Z-7M2Z_7Z'),
                isTokenAutoRefreshEnabled: true
            });
            console.log('[BIN-SECURITY] AppCheck initialized for production.');
        } catch (err) {
            console.error('[BIN-SECURITY] AppCheck initialization failed:', err);
        }
    } else if (isLocalhost) {
        console.warn('[BIN-SECURITY] Protocol bypassing AppCheck for localized node verification.');
        (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    } else {
        console.warn('[BIN-SECURITY] AppCheck is disabled on non-production, non-localhost protocols.');
    }
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
