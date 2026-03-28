// packages/shared/src/lib/firebase.ts
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, Auth } from 'firebase/auth';
import { getStorage, connectStorageEmulator, FirebaseStorage } from 'firebase/storage';
import { getAnalytics, Analytics } from 'firebase/analytics';
import { getFunctions, connectFunctionsEmulator, Functions } from 'firebase/functions';
import { 
    getFirestore, connectFirestoreEmulator, collection, enableIndexedDbPersistence, Firestore, CollectionReference,
    doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, deleteDoc
} from 'firebase/firestore';


const firebaseConfig = {
    apiKey: "AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s",
    authDomain: "bin-group-57c60.web.app",
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
    (window as any)._firestoreDb = _db;
    (window as any)._firebaseApp = _app;
}

export const app = _app;
export const db = _db;
export const auth: Auth = getAuth(_app);
export const storage: FirebaseStorage = getStorage(_app);
export const functions: Functions = getFunctions(_app);

// 🌐 Offline Persistence
if (typeof window !== 'undefined') {
    enableIndexedDbPersistence(_db).catch((err) => {
        if (err.code === 'failed-precondition') {
            console.warn('⚠️ [FIREBASE] Persistence locked (multiple tabs)');
        } else if (err.code === 'unimplemented') {
            console.warn('⚠️ [FIREBASE] Persistence unsupported');
        }
    });
}

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

export const analytics: Analytics | null = typeof window !== 'undefined' ? getAnalytics(_app) : null;

export { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, deleteDoc };

// Finalized App Singleton Registry
export default app;




