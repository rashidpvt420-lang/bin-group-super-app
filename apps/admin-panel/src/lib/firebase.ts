import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, deleteDoc, writeBatch } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
const firebaseConfig = {
    apiKey: "AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s",
    authDomain: "bin-group-57c60.firebaseapp.com",
    projectId: "bin-group-57c60",
    storageBucket: "bin-group-57c60.firebasestorage.app",
    messagingSenderId: "123413252227",
    appId: "1:123413252227:web:285cb53bc26626d699f3b6"
};

// Initialize Firebase locally
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const functions = getFunctions(app);

// Explicit Exports
export {
    app, db, auth, storage, functions, httpsCallable, getMessaging, getToken, isSupported,
    collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, deleteDoc, writeBatch
};
export default app;
