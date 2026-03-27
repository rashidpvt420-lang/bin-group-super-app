"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteDoc = exports.serverTimestamp = exports.onSnapshot = exports.limit = exports.orderBy = exports.where = exports.query = exports.updateDoc = exports.addDoc = exports.setDoc = exports.getDocs = exports.getDoc = exports.doc = exports.collection = exports.analytics = exports.functions = exports.storage = exports.auth = exports.db = exports.app = void 0;
// packages/shared/src/lib/firebase.ts
const app_1 = require("firebase/app");
const auth_1 = require("firebase/auth");
const storage_1 = require("firebase/storage");
const analytics_1 = require("firebase/analytics");
const functions_1 = require("firebase/functions");
const firestore_1 = require("firebase/firestore");
Object.defineProperty(exports, "collection", { enumerable: true, get: function () { return firestore_1.collection; } });
Object.defineProperty(exports, "doc", { enumerable: true, get: function () { return firestore_1.doc; } });
Object.defineProperty(exports, "getDoc", { enumerable: true, get: function () { return firestore_1.getDoc; } });
Object.defineProperty(exports, "getDocs", { enumerable: true, get: function () { return firestore_1.getDocs; } });
Object.defineProperty(exports, "setDoc", { enumerable: true, get: function () { return firestore_1.setDoc; } });
Object.defineProperty(exports, "addDoc", { enumerable: true, get: function () { return firestore_1.addDoc; } });
Object.defineProperty(exports, "updateDoc", { enumerable: true, get: function () { return firestore_1.updateDoc; } });
Object.defineProperty(exports, "query", { enumerable: true, get: function () { return firestore_1.query; } });
Object.defineProperty(exports, "where", { enumerable: true, get: function () { return firestore_1.where; } });
Object.defineProperty(exports, "orderBy", { enumerable: true, get: function () { return firestore_1.orderBy; } });
Object.defineProperty(exports, "limit", { enumerable: true, get: function () { return firestore_1.limit; } });
Object.defineProperty(exports, "onSnapshot", { enumerable: true, get: function () { return firestore_1.onSnapshot; } });
Object.defineProperty(exports, "serverTimestamp", { enumerable: true, get: function () { return firestore_1.serverTimestamp; } });
Object.defineProperty(exports, "deleteDoc", { enumerable: true, get: function () { return firestore_1.deleteDoc; } });
const firebaseConfig = {
    apiKey: "AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s",
    authDomain: "bin-group-57c60.firebaseapp.com",
    projectId: "bin-group-57c60",
    storageBucket: "bin-group-57c60.firebasestorage.app",
    messagingSenderId: "123413252227",
    appId: "1:123413252227:web:285cb53bc26626d699f3b6"
};
console.log("💎 [BIN-INIT] Starting Sovereign Firebase Protocol...");
// Singleton App
const _app = (0, app_1.getApps)().length === 0 ? (0, app_1.initializeApp)(firebaseConfig) : (0, app_1.getApp)();
console.log("💎 [BIN-INIT] Firebase App initialized:", _app.name);
// Singleton Firestore
const _db = (0, firestore_1.getFirestore)(_app);
if (!_db) {
    console.error("🚨 [BIN-INIT] FATAL: Firestore instance is undefined after getFirestore()");
}
else {
    console.log("💎 [BIN-INIT] Firestore instance secured.");
}
// Global exposure for debugging (Production safe as it only attaches to window)
if (typeof window !== 'undefined') {
    window._firestoreDb = _db;
    window._firebaseApp = _app;
}
exports.app = _app;
exports.db = _db;
exports.auth = (0, auth_1.getAuth)(_app);
exports.storage = (0, storage_1.getStorage)(_app);
exports.functions = (0, functions_1.getFunctions)(_app);
// 🌐 Offline Persistence
if (typeof window !== 'undefined') {
    (0, firestore_1.enableIndexedDbPersistence)(_db).catch((err) => {
        if (err.code === 'failed-precondition') {
            console.warn('⚠️ [FIREBASE] Persistence locked (multiple tabs)');
        }
        else if (err.code === 'unimplemented') {
            console.warn('⚠️ [FIREBASE] Persistence unsupported');
        }
    });
}
// ✅ Emulator Mesh
const shouldUseEmulator = typeof window !== 'undefined' && window.location.search.includes('useEmulator=true');
if (typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
    shouldUseEmulator) {
    try {
        (0, auth_1.connectAuthEmulator)(exports.auth, 'http://localhost:9099', { disableWarnings: true });
        (0, firestore_1.connectFirestoreEmulator)(_db, 'localhost', 8080);
        (0, storage_1.connectStorageEmulator)(exports.storage, 'localhost', 9199);
        (0, functions_1.connectFunctionsEmulator)(exports.functions, 'localhost', 5001);
        console.log('🛡️ [INIT] Connected to Local Emulators.');
    }
    catch (err) {
        console.warn('⚠️ [INIT] Emulator bypass failed:', err);
    }
}
exports.analytics = typeof window !== 'undefined' ? (0, analytics_1.getAnalytics)(_app) : null;
// Finalized App Singleton Registry
exports.default = exports.app;
