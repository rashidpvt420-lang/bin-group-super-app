import { initializeApp, getApps, getApp } from 'firebase/app';
import {
    getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc,
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
    return normalized && !normalized.includes('REPLACE_ME') ? normalized : '';
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
    const isAutomation = typeof navigator !== 'undefined' && navigator.webdriver;

    if (enableAppCheck) {
        if (isLocal || isAutomation) {
            (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
            console.log('App Check debug token set for local/automation testing.');
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

export {
    app, db, auth, storage, functions, httpsCallable, getMessaging, getToken, isSupported,
    onAuthStateChanged,
    collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp, deleteDoc, writeBatch, or, arrayUnion,
    ref, uploadBytes, getDownloadURL, signInWithRedirect, signInWithEmailAndPassword, setPersistence, browserLocalPersistence
};
export type { User };
export default app;
