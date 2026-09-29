'use strict';
// Shared harness for behavioural callable tests against the local Firebase emulators.
// Runs only against a demo- project (no production credentials or resources are used).
const path = require('node:path');

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'demo-bin-callables';
if (!projectId.startsWith('demo-')) {
  throw new Error(`Callable emulator tests must run against a demo- project, got ${projectId}.`);
}
for (const variable of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (!process.env[variable]) throw new Error(`${variable} is required; run through npm run test:emulator-callables.`);
}

const functionsRoot = path.resolve(__dirname, '..', '..', 'functions');
const admin = require(require.resolve('firebase-admin', { paths: [path.join(functionsRoot, 'lib')] }));
if (!admin.apps.length) {
  admin.initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` });
}

function lib(moduleName) {
  return require(path.join(functionsRoot, 'lib', moduleName));
}

async function createUser(uid, claims, extra = {}) {
  const email = extra.email || `${uid}@example.invalid`;
  try {
    await admin.auth().createUser({ uid, email, emailVerified: true, ...extra });
  } catch (error) {
    if (error?.code !== 'auth/uid-already-exists') throw error;
  }
  await admin.auth().setCustomUserClaims(uid, claims);
  return { uid, token: { ...claims, email, email_verified: true, ...(extra.tokenExtra || {}) } };
}

async function clearFirestore() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const response = await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`Could not clear Firestore emulator: ${response.status}`);
}

async function call(callable, actor, data) {
  if (typeof callable?.run !== 'function') throw new Error('Callable has no run() handler.');
  return callable.run({ auth: actor ? { uid: actor.uid, token: actor.token } : undefined, data, rawRequest: {} });
}

async function expectHttpsError(promise, code) {
  try {
    await promise;
  } catch (error) {
    if (error?.code !== code) {
      throw new Error(`Expected HttpsError ${code}, got ${error?.code || 'no code'}: ${error?.message}`);
    }
    return error;
  }
  throw new Error(`Expected HttpsError ${code}, but the call succeeded.`);
}

module.exports = { admin, db: admin.firestore(), projectId, lib, createUser, clearFirestore, call, expectHttpsError };
