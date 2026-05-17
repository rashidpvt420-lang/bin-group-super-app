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

assert(rootOnboardingPage.includes('AccountCreationServerStep'), 'Root property onboarding must use the server-backed account creation step.');
assert(!rootOnboardingPage.includes("../components/onboarding/AccountCreationStep"), 'Root property onboarding must not import the legacy direct-Firestore account step.');

assert(serverStep.includes('httpsCallable'), 'Server-backed account step must use a callable function.');
assert(serverStep.includes('upsertOwnerOnboardingProfile'), 'Server-backed account step must call upsertOwnerOnboardingProfile.');
assert(!serverStep.includes("setDoc(doc(db, 'users'"), 'Server-backed account step must not directly write users/{uid}.');
assert(!serverStep.includes('collection(db, \'users\')'), 'Server-backed account step must not query users collection client-side for role collision.');

assert(runtime.includes('export * from "./ownerOnboarding"'), 'Functions runtime must export ownerOnboarding callables.');
assert(ownerOnboardingFunction.includes('upsertOwnerOnboardingProfile'), 'ownerOnboarding function must define upsertOwnerOnboardingProfile.');
assert(ownerOnboardingFunction.includes('admin.firestore()'), 'Owner onboarding must write with Admin SDK.');

assert(legacyStep.includes("setDoc(doc(db, 'users'"), 'Legacy AccountCreationStep still contains direct Firestore write; keep it unused until removed or migrated.');

if (failures.length) {
  console.error('\nProduction stability guard failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Production stability guard passed.');
