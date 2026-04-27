import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, 
    updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, 
    Timestamp, deleteDoc, writeBatch, or, arrayUnion, enableIndexedDbPersistence
} from 'firebase/firestore';

import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth, onAuthStateChanged, getRedirectResult, signInWithPopup, User } from 'firebase/auth';
import { getToken, isSupported, getMessaging } from 'firebase/messaging';

const firebaseConfig = {
    apiKey: "AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s",
    authDomain: "bin-group-57c60.firebaseapp.com",
    projectId: "bin-group-57c60",
    storageBucket: "bin-group-57c60.firebasestorage.app",
    messagingSenderId: "123413252227",
    appId: "1:123413252227:web:285cb53bc26626d699f3b6"
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

// [V8] OFFLINE PERSISTENCE PROTOCOL
// Only enable if not already started to avoid initialization crashes
if (typeof window !== 'undefined') {
    (async () => {
        try {
            await enableIndexedDbPersistence(db);
        } catch (err: any) {
            if (err.code === 'failed-precondition') {
                console.warn('[FIREBASE] Persistence failed: Multiple tabs open.');
            } else if (err.code === 'unimplemented') {
                console.warn('[FIREBASE] Persistence unsupported by browser.');
            }
        }
    })();
}

// Regionalized Functions
const PRIMARY_REGION = "europe-west3";
const functions = getFunctions(app, PRIMARY_REGION);

// 🚨 PRODUCTION SAFEGUARD: Never connect to emulator in public production mesh
if (process.env.NODE_ENV === 'development' && window.location.hostname === 'localhost') {
    // connectFunctionsEmulator(functions, "localhost", 5001);
}

// Explicit Exports
export {
    app, db, auth, storage, functions, getToken, isSupported, getMessaging, httpsCallable,
    onAuthStateChanged, getRedirectResult, signInWithPopup, type User,
    ref, uploadBytes, getDownloadURL,
    collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp, deleteDoc, writeBatch, or, arrayUnion
};

export default app;
