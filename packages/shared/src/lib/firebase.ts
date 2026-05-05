// packages/shared/src/lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import type { FirebaseStorage } from 'firebase/storage';
import type { Analytics } from 'firebase/analytics';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import type { Functions } from 'firebase/functions';
import { 
    getFirestore, connectFirestoreEmulator, collection,
    doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, deleteDoc
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

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
    const value = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env[name] : process.env[name];
    if (!value || value.includes('REPLACE_ME')) {
        return ''; // Handled by safe fallback below
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

import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import type { Messaging } from 'firebase/messaging';

const _app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const _db: Firestore = getFirestore(_app);
export const app = _app;
export const db = _db;
export const auth: Auth = getAuth(_app);
export const storage: FirebaseStorage = getStorage(_app);
export const functions: Functions = getFunctions(_app);
export const messaging: Messaging | null = typeof window !== 'undefined' ? getMessaging(_app) : null;

export { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, deleteDoc };
export default app;
