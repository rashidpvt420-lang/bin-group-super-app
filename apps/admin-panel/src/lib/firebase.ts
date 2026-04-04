import { initializeApp, getApps, getApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import type { FirebaseStorage } from 'firebase/storage';
import { getAnalytics, isSupported } from 'firebase/analytics';
import type { Analytics } from 'firebase/analytics';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import type { Functions } from 'firebase/functions';
import {
    getFirestore, connectFirestoreEmulator, collection, enableIndexedDbPersistence,
    doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, deleteDoc, writeBatch
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

const getEnvVar = (name: string, fallback: string) => {
    try {
        if (typeof process !== 'undefined' && process.env && process.env[name]) {
            return process.env[name];
        }
    } catch (e) {
    }
    return fallback;
};

const firebaseConfig = {
    apiKey: getEnvVar("REACT_APP_FIREBASE_API_KEY", "AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s"),
    authDomain: getEnvVar("REACT_APP_FIREBASE_AUTH_DOMAIN", "bin-groups.com"),
    projectId: getEnvVar("REACT_APP_FIREBASE_PROJECT_ID", "bin-group-57c60"),
    storageBucket: getEnvVar("REACT_APP_FIREBASE_STORAGE_BUCKET", "bin-group-57c60.firebasestorage.app"),
    messagingSenderId: getEnvVar("REACT_APP_FIREBASE_MESSAGING_SENDER_ID", "123413252227"),
    appId: getEnvVar("REACT_APP_FIREBASE_APP_ID", "1:123413252227:web:285cb53bc26626d699f3b6")
};

let _app: FirebaseApp;
try {
    _app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
} catch (err) {
    console.error("FIREBASE_INIT_ERROR", err);
    throw err;
}

const _db: Firestore = getFirestore(_app);

if (typeof window !== 'undefined') {
    (window as any)._firestoreDb = _db;
    (window as any)._firebaseApp = _app;
}

export const app = _app;
export const db = _db;
export const auth: Auth = getAuth(_app);
export const storage: FirebaseStorage = getStorage(_app);
export const functions: Functions = getFunctions(_app);

if (typeof window !== 'undefined') {
    enableIndexedDbPersistence(_db).catch((err: any) => {
        console.warn('PERSISTENCE_ERROR', err.code);
    });
}

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
    } catch (err) {
    }
}

export let analytics: Analytics | null = null;
if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
    isSupported().then((supported) => {
        if (supported) {
            try {
                analytics = getAnalytics(_app);
            } catch (err) {
            }
        }
    }).catch(err => {
    });
}

export { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, deleteDoc, writeBatch };
export default app;
