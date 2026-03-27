// backend/firebase-config.js
const admin = require('firebase-admin');

const firebaseConfig = {
  type: process.env.FIREBASE_TYPE || 'service_account',
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
  token_uri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
  auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_CERT ||
    'https://www.googleapis.com/oauth2/v1/certs',
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL || '',
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(firebaseConfig),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

const db = admin.firestore();
const auth = admin.auth();

module.exports = {
  admin,
  db,
  auth,
};
