import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, 
    updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, 
    Timestamp, deleteDoc, writeBatch, or, arrayUnion
} from 'firebase/firestore';

import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth, signInWithPopup, signInWithEmailAndPassword, onAuthStateChanged, type User } from 'firebase/auth';
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

const readRequiredEnv = (name: string): string => {
    const value = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env[name] : process.env[name];
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

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// App Check (Environment Gated)
if (typeof window !== 'undefined') {
    const enableAppCheck = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_ENABLE_FIREBASE_APPCHECK === 'true') || 
                          (typeof process !== 'undefined' && process.env && process.env.VITE_ENABLE_FIREBASE_APPCHECK === 'true') ||
                          readRequiredEnv('VITE_ENABLE_FIREBASE_APPCHECK') === 'true';
    const isLocal = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');
    const isAutomation = typeof navigator !== 'undefined' && navigator.webdriver;
    
    if (enableAppCheck) {
        if (isLocal || isAutomation) {
            (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
            console.log("🛡️ [SECURITY] App Check debug token set for local/automation testing.");
        }
        const siteKey = (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_APP_CHECK_SITE_KEY : '') || 
                        (typeof process !== 'undefined' && process.env ? process.env.VITE_APP_CHECK_SITE_KEY : '') ||
                        readRequiredEnv('VITE_APP_CHECK_SITE_KEY') || 
                        readRequiredEnv('REACT_APP_APP_CHECK_SITE_KEY');
        if (siteKey && !siteKey.includes('REPLACE_ME')) {
            try {
                initializeAppCheck(app, {
                    provider: new ReCaptchaV3Provider(siteKey),
                    isTokenAutoRefreshEnabled: true
                });
                console.log("🛡️ [SECURITY] App Check active.");
            } catch (err) {
                console.warn("App Check initialization failed:", err);
            }
        } else {
            console.warn("VITE_APP_CHECK_SITE_KEY missing or placeholder. App Check not initialized.");
        }
    } else {
        console.log("🛡️ [SECURITY] App Check is disabled via environment configuration.");
    }
}

const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const functions = getFunctions(app, "europe-west3");

export {
    app, db, auth, storage, functions, httpsCallable, getMessaging, getToken, isSupported,
    onAuthStateChanged, type User,
    collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp, deleteDoc, writeBatch, or, arrayUnion,
    ref, uploadBytes, getDownloadURL, signInWithPopup, signInWithEmailAndPassword
};
export default app;
