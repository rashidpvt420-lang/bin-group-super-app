import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
    getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, 
    updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, 
    Timestamp, deleteDoc, writeBatch, or, arrayUnion
} from 'firebase/firestore';

import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth, signInWithPopup, onAuthStateChanged, User } from 'firebase/auth';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';

const firebaseConfig = {
    apiKey: "AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s",
    authDomain: "bin-group-57c60.firebaseapp.com",
    projectId: "bin-group-57c60",
    storageBucket: "bin-group-57c60.firebasestorage.app",
    messagingSenderId: "123413252227",
    appId: "1:123413252227:web:285cb53bc26626d699f3b6"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const functions = getFunctions(app, "europe-west3");

export {
    app, db, auth, storage, functions, httpsCallable, getMessaging, getToken, isSupported,
    onAuthStateChanged, type User,
    collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp, deleteDoc, writeBatch, or, arrayUnion,
    ref, uploadBytes, getDownloadURL, signInWithPopup
};
export default app;
