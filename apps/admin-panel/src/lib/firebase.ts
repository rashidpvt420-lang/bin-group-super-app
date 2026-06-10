import { initializeApp, getApps, getApp } from 'firebase/app';
import {
    getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc,
    updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp,
    Timestamp, deleteDoc, writeBatch, or, arrayUnion
} from 'firebase/firestore';

import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth, signInWithPopup, signInWithEmailAndPassword, onAuthStateChanged, User } from 'firebase/auth';
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

const readEnv = (name: string): string => {
    const viteValue = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env[name] : '';
    const reactName = name.startsWith('VITE_') ? `REACT_APP_${name.slice(5)}` : name;
    const reactValue = (typeof process !== 'undefined' && process.env) ? process.env[reactName] : '';
    const value = viteValue || reactValue || '';
    return value && !value.includes('REPLACE_ME') ? value : '';
};

const required = (name: string): string => {
    const value = readEnv(name);
    if (!value) {
        throw new Error(`Missing Firebase runtime configuration: ${name}. Set the matching REACT_APP_* variable for the standalone admin panel build.`);
    }
    return value;
};

const firebaseConfig: BinFirebaseConfig = {
    apiKey: required('VITE_FIREBASE_API_KEY'),
    authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN') || 'bin-group-57c60.firebaseapp.com',
    projectId: readEnv('VITE_FIREBASE_PROJECT_ID') || 'bin-group-57c60',
    storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET') || 'bin-group-57c60.firebasestorage.app',
    messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || '123413252227',
    appId: readEnv('VITE_FIREBASE_APP_ID') || '1:123413252227:web:285cb53bc26626d699f3b6'
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

if (typeof window !== 'undefined') {
    const enableAppCheck = readEnv('VITE_ENABLE_FIREBASE_APPCHECK') === 'true';
    const isLocal = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');
    const isAutomation = typeof navigator !== 'undefined' && navigator.webdriver;

    if (enableAppCheck) {
        if (isLocal || isAutomation) {
            (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
            console.log('App Check debug token set for local/automation testing.');
        }
        const siteKey = readEnv('VITE_APP_CHECK_SITE_KEY') || readEnv('REACT_APP_APP_CHECK_SITE_KEY');
        if (siteKey && !siteKey.includes('REPLACE_ME')) {
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
    onAuthStateChanged, type User,
    collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp, deleteDoc, writeBatch, or, arrayUnion,
    ref, uploadBytes, getDownloadURL, signInWithPopup, signInWithEmailAndPassword
};
export default app;
