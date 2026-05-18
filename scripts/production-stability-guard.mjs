import { readFileSync, existsSync } from 'node:fs';

const failures = [];

function read(path) {
  if (!existsSync(path)) {
    failures.push(`Missing required file: ${path}`);
    return '';
  }
  return readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const firebaseJson = read('firebase.json');
const rootOnboardingPage = read('src/pages/PropertyOnboardingPage.tsx');
const serverStep = read('src/components/onboarding/AccountCreationServerStep.tsx');
const legacyStep = read('src/components/onboarding/AccountCreationStep.tsx');
const runtime = read('functions/runtime.ts');
const ownerRegistrationRequest = read('functions/ownerRegistrationRequest.ts');
const productionWorkflow = read('.github/workflows/firebase-production-deploy.yml');

assert(firebaseJson.includes('"public": "dist"'), 'Firebase Hosting must deploy root dist for the public PWA.');
assert(firebaseJson.includes('"rules": "firestore.rules"'), 'Firebase config must deploy firestore.rules.');
assert(productionWorkflow.includes('firestore:rules'), 'Production deploy workflow must deploy Firestore rules.');
assert(productionWorkflow.includes('functions'), 'Production deploy workflow must deploy Functions.');
assert(productionWorkflow.includes('VITE_APP_CHECK_SITE_KEY'), 'Production deploy workflow must inject VITE_APP_CHECK_SITE_KEY.');

assert(rootOnboardingPage.includes('AccountCreationServerStep'), 'Root property onboarding must use the server-backed account step.');
assert(!rootOnboardingPage.includes("../components/onboarding/AccountCreationStep"), 'Root property onboarding must not import the legacy direct-Firestore account step.');

assert(serverStep.includes('httpsCallable'), 'Server-backed account step must use a callable function.');
assert(serverStep.includes('submitPendingOwnerRegistration'), 'Server-backed account step must submit pending owner registration.');
assert(!serverStep.includes('registerOwnerOnboardingAccount'), 'Owner onboarding must not use the previous live-account callable.');
assert(!serverStep.includes('createUserWithEmailAndPassword'), 'Owner onboarding must not call browser-side account creation.');
assert(!serverStep.includes('signInWithEmailAndPassword'), 'Owner onboarding must not call browser-side sign-in.');
assert(!serverStep.includes('signInWithCustomToken'), 'Owner onboarding must not depend on custom-token sign-in.');
assert(!serverStep.includes('customToken'), 'Owner onboarding must not require a custom token from the server.');
assert(!serverStep.includes("setDoc(doc(db, 'users'"), 'Server-backed account step must not directly write users/{uid}.');
assert(!serverStep.includes('collection(db, \'users\')'), 'Server-backed account step must not query users collection client-side for role collision.');

assert(runtime.includes('export * from "./ownerRegistrationRequest"'), 'Functions runtime must export pending owner registration callable.');
assert(ownerRegistrationRequest.includes('submitPendingOwnerRegistration'), 'Pending owner registration callable must be defined.');
assert(ownerRegistrationRequest.includes('owner_registration_requests'), 'Pending owner registration must write owner_registration_requests.');
assert(ownerRegistrationRequest.includes('pending_owners'), 'Pending owner registration must write pending_owners.');

assert(legacyStep.includes("setDoc(doc(db, 'users'"), 'Legacy AccountCreationStep still contains direct Firestore write; keep it unused until removed or migrated.');

if (failures.length) {
  console.error('\nProduction stability guard failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Production stability guard passed.');
