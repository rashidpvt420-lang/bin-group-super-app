import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, 
    updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, 
    Timestamp, deleteDoc, writeBatch, or, arrayUnion
} from 'firebase/firestore';

import { getStorage, ref, uploadBytes, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth, onAuthStateChanged, getRedirectResult, signInWithPopup, User } from 'firebase/auth';
import { getToken, isSupported, getMessaging } from 'firebase/messaging';

type BinFirebaseConfig = {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
};

const readRequiredEnv = (name: string): string => {
    const value = process.env[name];
    if (!value || value.includes('REPLACE_ME')) {
        throw new Error(`Missing required Firebase environment variable: ${name}`);
    }
    return value;
};

const firebaseConfig: BinFirebaseConfig = {
    apiKey: readRequiredEnv('REACT_APP_FIREBASE_API_KEY'),
    authDomain: readRequiredEnv('REACT_APP_FIREBASE_AUTH_DOMAIN'),
    projectId: readRequiredEnv('REACT_APP_FIREBASE_PROJECT_ID'),
    storageBucket: readRequiredEnv('REACT_APP_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: readRequiredEnv('REACT_APP_FIREBASE_MESSAGING_SENDER_ID'),
    appId: readRequiredEnv('REACT_APP_FIREBASE_APP_ID')
};

// [V7] ENTERPRISE FAILOVER MESH
let app: FirebaseApp;
try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
} catch (e) {
    console.error("Critical Init Failure. Pivoting to Secondary Cloud Node.");
    app = initializeApp(firebaseConfig, "SECONDARY_NODE");
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
    onAuthStateChanged, getRedirectResult, signInWithPopup, type User,
    ref, uploadBytes, uploadBytesResumable, getDownloadURL,
    collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp, deleteDoc, writeBatch, or, arrayUnion
};

export default app;
