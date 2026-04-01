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
    authDomain: "bin-groups.com",
    databaseURL: "https://bin-group-57c60-default-rtdb.firebaseio.com",
    projectId: "bin-group-57c60",
    storageBucket: "bin-group-57c60.firebasestorage.app",
    messagingSenderId: "123413252227",
    appId: "1:123413252227:web:285cb53bc26626d699f3b6",
    measurementId: "G-63X8EKNMF5"
};

// 💎 [BIN-BOOT] Local Firebase Evaluation Started
// 💎 Local App Singleton
// Singleton initialized on default app
const _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const _db = getFirestore(_app);

// [STABILITY] Removing redundant persistence call that deadlocks evaluated bundle. 
// Persistence is now managed exclusively by @bin/shared to ensure atomic initialization.
if (typeof window !== 'undefined') {
    (window as any)._firestoreDb = _db;
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

    // [RESILIENCY] App Check bypassed for production stability verification
    
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
