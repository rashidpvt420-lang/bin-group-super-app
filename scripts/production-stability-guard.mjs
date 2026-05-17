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
const ownerOnboardingFunction = read('functions/ownerOnboarding.ts');
const productionWorkflow = read('.github/workflows/firebase-production-deploy.yml');

assert(firebaseJson.includes('"public": "dist"'), 'Firebase Hosting must deploy root dist for the public PWA.');
assert(firebaseJson.includes('"rules": "firestore.rules"'), 'Firebase config must deploy firestore.rules.');
assert(productionWorkflow.includes('firestore:rules'), 'Production deploy workflow must deploy Firestore rules.');
assert(productionWorkflow.includes('functions'), 'Production deploy workflow must deploy Functions.');
assert(productionWorkflow.includes('VITE_APP_CHECK_SITE_KEY'), 'Production deploy workflow must inject VITE_APP_CHECK_SITE_KEY.');

assert(rootOnboardingPage.includes('AccountCreationServerStep'), 'Root property onboarding must use the server-backed account creation step.');
assert(!rootOnboardingPage.includes("../components/onboarding/AccountCreationStep"), 'Root property onboarding must not import the legacy direct-Firestore account step.');

assert(serverStep.includes('httpsCallable'), 'Server-backed account step must use a callable function.');
assert(serverStep.includes('registerOwnerOnboardingAccount'), 'Server-backed account step must call registerOwnerOnboardingAccount.');
assert(serverStep.includes('password'), 'Server-backed account step must pass the owner password to the server registration callable.');
assert(!serverStep.includes('createUserWithEmailAndPassword'), 'Server-backed account step must not call browser-side Firebase Auth signup.');
assert(!serverStep.includes('signInWithEmailAndPassword'), 'Server-backed account step must not call browser-side password sign-in during owner onboarding.');
assert(!serverStep.includes('signInWithCustomToken'), 'Server-backed account step must not depend on custom-token signing.');
assert(!serverStep.includes('customToken'), 'Server-backed account step must not require a custom token from the server.');
assert(!serverStep.includes("setDoc(doc(db, 'users'"), 'Server-backed account step must not directly write users/{uid}.');
assert(!serverStep.includes('collection(db, \'users\')'), 'Server-backed account step must not query users collection client-side for role collision.');

assert(runtime.includes('export * from "./ownerOnboarding"'), 'Functions runtime must export ownerOnboarding callables.');
assert(ownerOnboardingFunction.includes('registerOwnerOnboardingAccount'), 'ownerOnboarding function must define registerOwnerOnboardingAccount.');
assert(ownerOnboardingFunction.includes('createUser'), 'Owner onboarding server function must create Auth users with Admin SDK.');
assert(!ownerOnboardingFunction.includes('createCustomToken'), 'Owner onboarding server function must not rely on custom-token signing.');
assert(ownerOnboardingFunction.includes('upsertOwnerOnboardingProfile'), 'ownerOnboarding function must keep authenticated profile upsert fallback.');
assert(ownerOnboardingFunction.includes('admin.firestore()'), 'Owner onboarding must write profiles with Admin SDK.');

assert(legacyStep.includes("setDoc(doc(db, 'users'"), 'Legacy AccountCreationStep still contains direct Firestore write; keep it unused until removed or migrated.');

if (failures.length) {
  console.error('\nProduction stability guard failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Production stability guard passed.');
