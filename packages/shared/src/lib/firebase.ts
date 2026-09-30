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
  addDoc as firestoreAddDoc,
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

type EnvBag = Record<string, string | undefined>;

const readProcessEnv = (name: string): string => {
  const processLike = globalThis as unknown as { process?: { env?: EnvBag } };
  const value = processLike.process?.env?.[name];
  if (!value || value.includes('REPLACE_ME')) return '';
  return value;
};

const firebaseConfig: BinFirebaseConfig = {
  apiKey:
    readProcessEnv('VITE_FIREBASE_API_KEY') ||
    'AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s',
  authDomain:
    readProcessEnv('VITE_FIREBASE_AUTH_DOMAIN') ||
    'bin-group-57c60.firebaseapp.com',
  projectId:
    readProcessEnv('VITE_FIREBASE_PROJECT_ID') ||
    'bin-group-57c60',
  storageBucket:
    readProcessEnv('VITE_FIREBASE_STORAGE_BUCKET') ||
    'bin-group-57c60.firebasestorage.app',
  messagingSenderId:
    readProcessEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') ||
    '123413252227',
  appId:
    readProcessEnv('VITE_FIREBASE_APP_ID') ||
    '1:123413252227:web:285cb53bc26626d699f3b6',
};

const firebaseApp: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const getSafeMessaging = (): Messaging | null => {
  if (typeof window === 'undefined') return null;
  try {
    return getMessaging(firebaseApp);
  } catch (error) {
    console.warn('[BIN SHARED] Firebase Messaging unavailable:', error);
    return null;
  }
};

const auth: Auth = getAuth(firebaseApp);
const db: Firestore = getFirestore(firebaseApp);
const storage: FirebaseStorage = getStorage(firebaseApp);
const functions: Functions = getFunctions(firebaseApp, 'europe-west3');
const messaging: Messaging | null = getSafeMessaging();

const pendingAuditWrites = new Map<string, Promise<void>>();

const inferLegacyAuditTarget = (data: any) => {
  const explicitTargetType = String(data?.targetType || data?.entityType || '').trim();
  const explicitTargetId = String(data?.targetId || data?.entityId || '').trim();
  const legacyTargets: Array<[string, string]> = [
    ['contractId', 'contracts'],
    ['paymentId', 'payment_transactions'],
    ['paymentTransactionId', 'payment_transactions'],
    ['propertyId', 'properties'],
    ['ownerId', 'owners'],
    ['ownerUid', 'owners'],
    ['tenantId', 'tenants'],
    ['tenantUid', 'tenants'],
    ['leadId', 'broker_leads'],
    ['referralId', 'broker_referrals'],
    ['staffId', 'staff'],
    ['userId', 'users'],
    ['actorId', 'users'],
  ];

  if (explicitTargetType && explicitTargetId) {
    return { targetType: explicitTargetType, targetId: explicitTargetId };
  }

  for (const [field, fallbackType] of legacyTargets) {
    const targetId = String(data?.[field] || '').trim();
    if (targetId) {
      return { targetType: explicitTargetType || fallbackType, targetId };
    }
  }

  return { targetType: explicitTargetType, targetId: explicitTargetId };
};

/**
 * Compatibility bridge for legacy shared consumers that still call addDoc()
 * directly on audit_logs/auditLogs. Security Rules deny those client writes by
 * design, so route them through the authenticated Cloud Function instead.
 */
const addDoc: typeof firestoreAddDoc = (async (reference: any, data: any) => {
  const collectionPath = String(reference?.path || '');
  if (collectionPath !== 'audit_logs' && collectionPath !== 'auditLogs') {
    return firestoreAddDoc(reference, data);
  }

  const action = String(data?.action || '').trim();
  const { targetType, targetId } = inferLegacyAuditTarget(data);
  if (!action || !targetType || !targetId) {
    throw new Error('Audit writes require action and a target identifier.');
  }

  const {
    actorId,
    actorRole,
    createdAt: _createdAt,
    timestamp: _timestamp,
    metadata,
    before,
    after,
    userAgent,
    action: _action,
    targetType: _targetType,
    targetId: _targetId,
    ...extra
  } = data || {};

  const auditMetadata: Record<string, unknown> = {
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
    ...extra,
    ...(before !== undefined ? { before } : {}),
    ...(after !== undefined ? { after } : {}),
    ...(userAgent ? { userAgent } : {}),
    ...(actorId ? { legacyClaimedActorId: actorId } : {}),
    ...(actorRole ? { legacyClaimedActorRole: actorRole } : {}),
    sourceCollection: collectionPath,
  };

  const dedupeKey = `${action}|${targetType}|${targetId}`;
  let pending = pendingAuditWrites.get(dedupeKey);
  if (!pending) {
    const logUserAuditAction = httpsCallable(functions, 'logUserAuditAction');
    pending = logUserAuditAction({ action, targetType, targetId, metadata: auditMetadata }).then(() => undefined);
    pendingAuditWrites.set(dedupeKey, pending);
    const cleanup = () => queueMicrotask(() => {
      if (pendingAuditWrites.get(dedupeKey) === pending) pendingAuditWrites.delete(dedupeKey);
    });
    void pending.then(cleanup, cleanup);
  }

  await pending;
  return doc(reference);
}) as typeof firestoreAddDoc;

// The emulator decision is made on every page load. It used to be remembered in localStorage
// ('bin_emulators_connected'), so after one reload on localhost the emulators were skipped and the
// same local session silently talked to production Firebase. The in-memory flag only prevents a
// second connect for the same SDK instances (e.g. hot module reload), which the SDK rejects.
const EMULATORS_CONNECTED_FLAG = '__BIN_SHARED_FIREBASE_EMULATORS_CONNECTED__';
const LEGACY_EMULATORS_CONNECTED_KEY = 'bin_emulators_connected';

if (typeof window !== 'undefined') {
  const hostname = window.location.hostname;
  const shouldUseEmulators = hostname === 'localhost' || hostname === '127.0.0.1';
  try {
    window.localStorage?.removeItem(LEGACY_EMULATORS_CONNECTED_KEY);
  } catch {
    // Storage can be unavailable (privacy mode); the decision never depended on it.
  }
  const pageScope = window as unknown as Record<string, unknown>;
  if (shouldUseEmulators && pageScope[EMULATORS_CONNECTED_FLAG] !== true) {
    try {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', 8080);
      connectStorageEmulator(storage, '127.0.0.1', 9199);
      connectFunctionsEmulator(functions, '127.0.0.1', 5001);
      pageScope[EMULATORS_CONNECTED_FLAG] = true;
    } catch (error) {
      console.warn('[BIN SHARED] Emulator connection skipped:', error);
    }
  }
}

export {
  firebaseApp as app,
  auth,
  db,
  storage,
  functions,
  messaging,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
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

export default firebaseApp;
