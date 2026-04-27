// packages/shared/src/lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import type { FirebaseStorage } from 'firebase/storage';
import type { Analytics } from 'firebase/analytics';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import type { Functions } from 'firebase/functions';
import { 
    getFirestore, connectFirestoreEmulator, collection,
    doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, deleteDoc
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';


const firebaseConfig = {
    apiKey: "AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s",
    authDomain: "bin-groups.com",
    projectId: "bin-group-57c60",
    storageBucket: "bin-group-57c60.firebasestorage.app",
    messagingSenderId: "123413252227",
    appId: "1:123413252227:web:285cb53bc26626d699f3b6"
};

console.log("💎 [BIN-INIT] Starting Sovereign Firebase Protocol...");

// Singleton App
const _app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
console.log("💎 [BIN-INIT] Firebase App initialized:", _app.name);

// Singleton Firestore
const _db: Firestore = getFirestore(_app);
if (!_db) {
    console.error("🚨 [BIN-INIT] FATAL: Firestore instance is undefined after getFirestore()");
} else {
console.log("💎 [BIN-INIT] Firestore instance secured.");
}

// Global exposure for debugging (Production safe as it only attaches to window)
if (typeof window !== 'undefined') {
    console.log("💎 [BIN-INIT] Setting window globals...");
    (window as any)._firestoreDb = _db;
    (window as any)._firebaseApp = _app;
    console.log("💎 [BIN-INIT] Window globals set.");
}

console.log("💎 [BIN-INIT] Exporting app/db...");
export const app = _app;
export const db = _db;

console.log("💎 [BIN-INIT] Initializing Auth...");
export const auth: Auth = getAuth(_app);
console.log("💎 [BIN-INIT] Auth secured.");

console.log("💎 [BIN-INIT] Initializing Storage...");
export const storage: FirebaseStorage = getStorage(_app);
console.log("💎 [BIN-INIT] Storage secured.");

console.log("💎 [BIN-INIT] Initializing Functions...");
export const functions: Functions = getFunctions(_app);
console.log("💎 [BIN-INIT] Functions secured.");

console.log("💎 [BIN-INIT] Persistence deferred until an authenticated offline workflow requests it.");
console.log("💎 [BIN-INIT] Script evaluation reaching emulator section...");

// ✅ Emulator Mesh
const shouldUseEmulator = typeof window !== 'undefined' && window.location.search.includes('useEmulator=true');
if (typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
    shouldUseEmulator
) {
    try {
        connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
        connectFirestoreEmulator(_db, 'localhost', 8080);
        connectStorageEmulator(storage, 'localhost', 9199);
        connectFunctionsEmulator(functions, 'localhost', 5001);
        console.log('🛡️ [INIT] Connected to Local Emulators.');
    } catch (err) {
        console.warn('⚠️ [INIT] Emulator bypass failed:', err);
    }
}

// 📊 Analytics (Resilient)
let _analytics: Analytics | null = null;
const measurementId = (firebaseConfig as { measurementId?: string }).measurementId;
if (typeof window !== 'undefined' && measurementId) {
    import('firebase/analytics')
        .then(({ getAnalytics }) => {
            _analytics = getAnalytics(_app);
            console.log("💎 [BIN-INIT] Analytics secured.");
        })
        .catch(() => {
            console.warn("⚠️ [BIN-INIT] Analytics initialization skipped (Safe).");
        });
} else {
    console.log("💎 [BIN-INIT] Analytics skipped: no measurementId configured.");
}
export const analytics = _analytics;

export { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, deleteDoc };

// Finalized App Singleton Registry
export default app;



