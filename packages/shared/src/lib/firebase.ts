// packages/shared/src/lib/firebase.ts

import { initializeApp, getApps, getApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';

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
  connectAuthEmulator,
} from 'firebase/auth';
import type { Auth, User } from 'firebase/auth';

import {
  getStorage,
  connectStorageEmulator,
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';
import type { FirebaseStorage } from 'firebase/storage';

import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator,
} from 'firebase/functions';
import type { Functions } from 'firebase/functions';

import {
  getFirestore,
  connectFirestoreEmulator,
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
} from 'firebase/firestore';

import type {
  Firestore,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  QuerySnapshot,
  QueryDocumentSnapshot,
  Unsubscribe,
} from 'firebase/firestore';

import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from 'firebase/messaging';
import type { Messaging } from 'firebase/messaging';

type BinFirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
};

const readRequiredEnv = (name: string): string => {
  const metaEnv =
    typeof import.meta !== 'undefined'
      ? (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      : undefined;

  const processEnv =
    typeof process !== 'undefined'
      ? process.env?.[name]
      : undefined;

  const value = metaEnv?.[name] ?? processEnv;

  if (!value || String(value).includes('REPLACE_ME')) {
    return '';
  }

  return String(value);
};

const firebaseConfig: BinFirebaseConfig = {
  apiKey:
    readRequiredEnv('VITE_FIREBASE_API_KEY') ||
    'AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s',
  authDomain:
    readRequiredEnv('VITE_FIREBASE_AUTH_DOMAIN') ||
    'bin-group-57c60.firebaseapp.com',
  projectId:
    readRequiredEnv('VITE_FIREBASE_PROJECT_ID') ||
    'bin-group-57c60',
  storageBucket:
    readRequiredEnv('VITE_FIREBASE_STORAGE_BUCKET') ||
    'bin-group-57c60.firebasestorage.app',
  messagingSenderId:
    readRequiredEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') ||
    '123413252227',
  appId:
    readRequiredEnv('VITE_FIREBASE_APP_ID') ||
    '1:123413252227:web:285cb53bc26626d699f3b6',
};

const firebaseApp: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const getSafeMessaging = (): Messaging | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return getMessaging(firebaseApp);
  } catch (error) {
    console.warn('[Firebase] Messaging unavailable in this environment:', error);
    return null;
  }
};

export const app = firebaseApp;
export const db: Firestore = getFirestore(firebaseApp);
export const auth: Auth = getAuth(firebaseApp);
export const storage: FirebaseStorage = getStorage(firebaseApp);
export const functions: Functions = getFunctions(firebaseApp);
export const messaging: Messaging | null = getSafeMessaging();

export {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
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
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  httpsCallable,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  connectAuthEmulator,
  connectFirestoreEmulator,
  connectStorageEmulator,
  connectFunctionsEmulator,
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
