// src/lib/firebase.ts
// BIN GROUP root Firebase compatibility layer.
// This file intentionally centralizes Firebase browser SDK exports used by the
// public, owner, broker, tenant, technician, and admin source trees.

import { initializeApp, getApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  limitToLast,
  startAfter,
  endBefore,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
  writeBatch,
  runTransaction,
  getCountFromServer,
  documentId,
  Timestamp,
  type Firestore,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type QuerySnapshot,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  getStorage,
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  type FirebaseStorage,
} from 'firebase/storage';
import { getFunctions, httpsCallable, type Functions } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
  type Messaging,
} from 'firebase/messaging';

const readEnv = (key: string): string => {
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return metaEnv?.[key] || '';
};

const firebaseConfig = {
  apiKey: readEnv('VITE_FIREBASE_API_KEY') || 'AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s',
  authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN') || 'bin-group-57c60.firebaseapp.com',
  projectId: readEnv('VITE_FIREBASE_PROJECT_ID') || 'bin-group-57c60',
  storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET') || 'bin-group-57c60.firebasestorage.app',
  messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || '123413252227',
  appId: readEnv('VITE_FIREBASE_APP_ID') || '1:123413252227:web:285cb53bc26626d699f3b6',
};

export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

let appCheckInstance: AppCheck | null = null;
const appCheckSiteKey = readEnv('VITE_APP_CHECK_SITE_KEY') || '6LdJpTcqAAAAAPv9z_M7pWbB8J1mYtTRg3e_6H1D';
const appCheckExplicitlyEnabled = readEnv('VITE_ENABLE_FIREBASE_APPCHECK') !== 'false';

if (typeof window !== 'undefined' && appCheckExplicitlyEnabled) {
  const isLocal = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');
  if (isLocal) {
    (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    console.info('🛡️ [SECURITY] App Check BYPASSED with debug token for local testing.');
  }

  if (appCheckSiteKey) {
    try {
      appCheckInstance = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
      console.info('[Firebase] App Check initialized for root app.');
    } catch (error) {
      console.warn('[Firebase] App Check initialization failed. Continuing without App Check token injection:', error);
    }
  }
}

export const appCheck = appCheckInstance;
export const db: Firestore = getFirestore(app);
export const auth: Auth = getAuth(app);

if (typeof window !== 'undefined') {
  void setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.warn('[Firebase] Auth persistence setup failed. Continuing with SDK default persistence:', error);
  });
}

export const storage: FirebaseStorage = getStorage(app);
export const FUNCTIONS_REGION = 'europe-west3';
export const functions: Functions = getFunctions(app, FUNCTIONS_REGION);

export const getFirebaseRuntimeDiagnostics = () => ({
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  functionsRegion: FUNCTIONS_REGION,
  hasAppCheckSiteKey: Boolean(appCheckSiteKey),
  appCheckExplicitlyEnabled,
  appCheckInitialized: Boolean(appCheckInstance),
  host: typeof window !== 'undefined' ? window.location.host : 'server',
});

let cachedMessaging: Messaging | null | undefined;
export const getSafeMessaging = async (): Promise<Messaging | null> => {
  if (typeof window === 'undefined') return null;
  if (cachedMessaging !== undefined) return cachedMessaging;
  try {
    cachedMessaging = (await isSupported()) ? getMessaging(app) : null;
  } catch (error) {
    console.warn('[Firebase] Messaging unavailable:', error);
    cachedMessaging = null;
  }
  return cachedMessaging;
};

export const messaging: Messaging | null = null;

export {
  // Auth
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  // Firestore
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  limitToLast,
  startAfter,
  endBefore,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
  writeBatch,
  runTransaction,
  getCountFromServer,
  documentId,
  Timestamp,
  // Storage
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  // Functions
  httpsCallable,
  // Messaging
  getMessaging,
  getToken,
  onMessage,
  isSupported,
};

export type {
  Auth,
  User,
  Firestore,
  FirebaseApp,
  FirebaseStorage,
  Functions,
  Messaging,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  QuerySnapshot,
  QueryDocumentSnapshot,
  Unsubscribe,
};

export default app;
