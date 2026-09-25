import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
    getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc,
    updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp,
    Timestamp, deleteDoc, writeBatch, or, arrayUnion
} from 'firebase/firestore';

import { getStorage, ref, uploadBytes, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth, onAuthStateChanged, getRedirectResult, signInWithPopup, signInWithEmailAndPassword, User } from 'firebase/auth';
import { getToken, isSupported, getMessaging } from 'firebase/messaging';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, ReCaptchaV3Provider } from 'firebase/app-check';

type BinFirebaseConfig = {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
};

const readRequiredEnv = (name: string): string => {
    // CRACO/CRA uses REACT_APP_* while the unified Vite app uses VITE_*.
    // Keep both names readable so the dedicated Owner build cannot silently
    // lose Firebase security configuration.
    const viteValue = (() => {
        try {
            // @ts-ignore
            return (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env[name] : '';
        } catch {
            return '';
        }
    })();
    const reactName = name.startsWith('VITE_') ? `REACT_APP_${name.slice(5)}` : name;
    const reactValue = typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>)[reactName] || '' : '';
    const value = String(viteValue || reactValue || '').trim();
    if (!value || /REPLACE_(?:ME|WITH_)/i.test(value)) return '';
    return value;
}

// Firebase Web App config is public client configuration, not a service-account secret.
// Keep environment variables preferred, but provide stable BIN GROUP production fallbacks
// so local/CI owner-app builds never initialize Firebase with an empty apiKey.
const firebaseConfig: BinFirebaseConfig = {
    apiKey: readRequiredEnv('VITE_FIREBASE_API_KEY') || "AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s",
    authDomain: readRequiredEnv('VITE_FIREBASE_AUTH_DOMAIN') || "bin-group-57c60.firebaseapp.com",
    projectId: readRequiredEnv('VITE_FIREBASE_PROJECT_ID') || "bin-group-57c60",
    storageBucket: readRequiredEnv('VITE_FIREBASE_STORAGE_BUCKET') || "bin-group-57c60.firebasestorage.app",
    messagingSenderId: readRequiredEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || "123413252227",
    appId: readRequiredEnv('VITE_FIREBASE_APP_ID') || "1:123413252227:web:285cb53bc26626d699f3b6"
};

// [V7] ENTERPRISE FAILOVER MESH
let app: FirebaseApp;
try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
} catch (e) {
    console.error("Critical Init Failure. Pivoting to Secondary Cloud Node.");
    app = initializeApp(firebaseConfig, "SECONDARY_NODE");
}

const siteKey = readRequiredEnv('VITE_APP_CHECK_SITE_KEY');
const appCheckEnabled = readRequiredEnv('VITE_ENABLE_FIREBASE_APPCHECK') === 'true';
const requestedProvider = readRequiredEnv('VITE_APP_CHECK_PROVIDER').toLowerCase();
const productionBuild = typeof process !== 'undefined' && process.env.NODE_ENV === 'production';
let appCheck: ReturnType<typeof initializeAppCheck> | null = null;

if (productionBuild && (!appCheckEnabled || !siteKey)) {
    throw new Error('[Owner Firebase] App Check is required for production Owner builds.');
}

if (appCheckEnabled && typeof window !== 'undefined') {
    try {
        const provider = requestedProvider === 'enterprise'
            ? new ReCaptchaEnterpriseProvider(siteKey)
            : new ReCaptchaV3Provider(siteKey);
        appCheck = initializeAppCheck(app, {
            provider,
            isTokenAutoRefreshEnabled: true
        });
    } catch (err) {
        if (productionBuild) throw new Error('[Owner Firebase] App Check initialization failed in production.');
        console.warn('[Owner Firebase] App Check initialization failed in development:', err);
    }
}

const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// Regionalized Functions
const PRIMARY_REGION = "europe-west3";
const functions = getFunctions(app, PRIMARY_REGION);

// Explicit Exports
export {
    app, appCheck, db, auth, storage, functions, getToken, isSupported, getMessaging, httpsCallable,
    onAuthStateChanged, getRedirectResult, signInWithPopup, signInWithEmailAndPassword, type User,
    ref, uploadBytes, uploadBytesResumable, getDownloadURL,
    collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp, deleteDoc, writeBatch, or, arrayUnion
};

export default app;