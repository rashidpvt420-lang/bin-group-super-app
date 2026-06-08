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
import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
  type Messaging,
} from 'firebase/messaging';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const readEnv = (key: string): string => {
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const value = metaEnv?.[key] || '';
  return value.includes('REPLACE_ME') ? '' : value;
};

// Firebase Web App config is public client configuration, not a service-account
// secret. Keep environment variables preferred, but provide stable BIN GROUP
// project fallbacks so Codespaces/local builds do not boot with empty Firebase
// values and trigger auth/invalid-api-key.
const firebaseConfig = {
  apiKey: readEnv('VITE_FIREBASE_API_KEY') || 'AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s',
  authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN') || 'bin-group-57c60.firebaseapp.com',
  projectId: readEnv('VITE_FIREBASE_PROJECT_ID') || 'bin-group-57c60',
  storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET') || 'bin-group-57c60.firebasestorage.app',
  messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || '123413252227',
  appId: readEnv('VITE_FIREBASE_APP_ID') || '1:123413252227:web:285cb53bc26626d699f3b6',
};

export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Firebase App Check — enabled only when VITE_APP_CHECK_SITE_KEY and
// VITE_ENABLE_FIREBASE_APPCHECK=true are set. Safe to run without them in dev.
const appCheckSiteKey = readEnv('VITE_APP_CHECK_SITE_KEY');
const appCheckExplicitlyEnabled = readEnv('VITE_ENABLE_FIREBASE_APPCHECK') === 'true';
let appCheckInitialized = false;
export let appCheck = null as ReturnType<typeof initializeAppCheck> | null;

if (appCheckExplicitlyEnabled && appCheckSiteKey && typeof window !== 'undefined') {
  try {
    // Enable debug token in non-production environments for local testing
    if (import.meta.env.DEV) {
      (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInitialized = true;
  } catch (appCheckError) {
    console.warn('[Firebase] App Check initialization failed — continuing without enforcement:', appCheckError);
  }
}

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
  appCheckInitialized,
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
