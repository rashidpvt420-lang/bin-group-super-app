// backend/src/config/firebase.js
const admin = require('firebase-admin');
const dotenv = require('dotenv');

dotenv.config();

let initialized = false;

function initializeFirebase() {
    if (initialized) return;
    
    admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL
    });
    
    initialized = true;
}

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

module.exports = {
    admin,
    db,
    auth,
    storage,
    initializeFirebase
};
