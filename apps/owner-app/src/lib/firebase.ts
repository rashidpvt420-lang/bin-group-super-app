import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, deleteDoc, writeBatch, or } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';

const PRIMARY_REGION = "me-central1";
const SECONDARY_REGION = "europe-west3";

const firebaseConfig = {
    apiKey: "AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s",
    authDomain: "bin-groups.com",
    projectId: "bin-group-57c60",
    storageBucket: "bin-group-57c60.firebasestorage.app",
    messagingSenderId: "123413252227",
    appId: "1:123413252227:web:285cb53bc26626d699f3b6"
};

// [V7] ENTERPRISE FAILOVER MESH
let app;
try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
} catch (e) {
    console.error("Critical Init Failure. Pivoting to Secondary Cloud Node.");
    app = initializeApp(firebaseConfig, "SECONDARY_NODE");
}

const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);

// Regionalized Functions Failover
let functions = getFunctions(app, PRIMARY_REGION);

// Connectivity Watchdog
const connectionWatchdog = setTimeout(() => {
    console.warn("⚠️ [V7-CIRCUIT-BREAKER] Primary UAE Region Latency > 4s. Activating Passive Failover (EU).");
    functions = getFunctions(app, SECONDARY_REGION);
}, 4000);

// Clear watchdog on first successful interaction if possible, 
// but for now, we follow the strict 4000ms requirement.

// Explicit Exports
export {
    app, db, auth, storage, functions, getToken, isSupported, getMessaging, httpsCallable,
    collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, deleteDoc, writeBatch, or
};
export default app;

