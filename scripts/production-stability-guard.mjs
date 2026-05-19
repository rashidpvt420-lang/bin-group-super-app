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
const rootFirebase = read('src/lib/firebase.ts');
const paymentSubmissionStep = read('src/components/onboarding/PaymentSubmissionStep.tsx');

assert(firebaseJson.includes('"public": "dist"'), 'Firebase Hosting must deploy root dist for the public PWA.');
assert(firebaseJson.includes('"rules": "firestore.rules"'), 'Firebase config must deploy firestore.rules.');
assert(productionWorkflow.includes('firestore:rules'), 'Production deploy workflow must deploy Firestore rules.');
assert(productionWorkflow.includes('functions'), 'Production deploy workflow must deploy Functions.');
assert(productionWorkflow.includes('VITE_APP_CHECK_SITE_KEY'), 'Production deploy workflow must inject VITE_APP_CHECK_SITE_KEY.');

// Owner onboarding now requires a real Firebase Auth session before payment/document submission.
// Step 7 must create the owner Auth user and users/{uid}; Step 9 then uploads proof documents
// to Firebase Storage and submits the admin-verification package under that UID.
assert(rootOnboardingPage.includes('AccountCreationStep'), 'Root property onboarding must use the real client-side owner account step.');
assert(rootOnboardingPage.includes("../components/onboarding/AccountCreationStep"), 'Root property onboarding must import AccountCreationStep.');
assert(!rootOnboardingPage.includes("../components/onboarding/AccountCreationServerStep"), 'Root property onboarding must not import AccountCreationServerStep for the live owner-signup flow.');

assert(legacyStep.includes('createUserWithEmailAndPassword'), 'AccountCreationStep must create the real Firebase Auth owner account.');
assert(legacyStep.includes("setDoc(doc(db, 'users'"), 'AccountCreationStep must create users/{uid} for the owner profile.');
assert(legacyStep.includes('ownerAccount'), 'AccountCreationStep must persist ownerAccount into onboarding state.');
assert(paymentSubmissionStep.includes('uploadProofDocuments'), 'Payment submission must upload physical proof documents before admin verification.');
assert(paymentSubmissionStep.includes('onboarding-proof'), 'Payment submission must store documents under onboarding-proof storage paths.');
assert(paymentSubmissionStep.includes('waitForCurrentUser'), 'Payment submission must wait for Firebase Auth hydration before final submit.');

// Keep the server-backed pending-owner registration callable available for admin/import/manual flows,
// but do not force the public onboarding page to use it.
assert(serverStep.includes('httpsCallable'), 'Server-backed account step must continue to use a callable function.');
assert(serverStep.includes('submitPendingOwnerRegistration'), 'Server-backed account step must submit pending owner registration.');
assert(runtime.includes('export * from "./ownerRegistrationRequest"'), 'Functions runtime must export pending owner registration callable.');
assert(ownerRegistrationRequest.includes('submitPendingOwnerRegistration'), 'Pending owner registration callable must be defined.');
assert(ownerRegistrationRequest.includes('owner_registration_requests'), 'Pending owner registration must write owner_registration_requests.');
assert(ownerRegistrationRequest.includes('pending_owners'), 'Pending owner registration must write pending_owners.');

assert(rootFirebase.includes('VITE_ENABLE_FIREBASE_APPCHECK'), 'Root Firebase app must gate App Check behind VITE_ENABLE_FIREBASE_APPCHECK.');
assert(rootFirebase.includes('appCheckExplicitlyEnabled'), 'Root Firebase app must not initialize App Check just because a site key exists.');

if (failures.length) {
  console.error('\nProduction stability guard failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Production stability guard passed.');

