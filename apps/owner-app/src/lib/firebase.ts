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
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

type BinFirebaseConfig = {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
};

const readRequiredEnv = (name: string): string => {
    // @ts-ignore
    const value = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env[name] : '';
    if (!value || value.includes('REPLACE_ME')) {
        return '';
    }
    return value;
};

// Safe fallback ONLY for production bin-group-57c60 config if env is missing
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

// App Check (Monitoring Mode)
if (typeof window !== 'undefined') {
    const siteKey = readRequiredEnv('VITE_APP_CHECK_SITE_KEY');
    if (siteKey) {
        try {
            initializeAppCheck(app, {
                provider: new ReCaptchaV3Provider(siteKey),
                isTokenAutoRefreshEnabled: true
            });
            console.log("🛡️ [SECURITY] App Check active in MONITORING mode.");
        } catch (err) {
            console.warn("App Check initialization failed:", err);
        }
    } else {
        console.warn("VITE_APP_CHECK_SITE_KEY missing or placeholder. App Check not initialized.");
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
    app, db, auth, storage, functions, getToken, isSupported, getMessaging, httpsCallable,
    onAuthStateChanged, getRedirectResult, signInWithPopup, signInWithEmailAndPassword, type User,
    ref, uploadBytes, uploadBytesResumable, getDownloadURL,
    collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp, deleteDoc, writeBatch, or, arrayUnion
};

export default app;
