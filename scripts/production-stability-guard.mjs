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

function extractSection(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  if (start === -1) return '';
  const end = text.indexOf(endMarker, start + startMarker.length);
  return text.slice(start, end === -1 ? undefined : end);
}

const firebaseJson = read('firebase.json');
const firestoreRules = read('firestore.rules');
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
assert(legacyStep.includes('setOwnerAccount'), 'AccountCreationStep must persist owner account details into onboarding state.');
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

const appCheckIsEnvGated = rootFirebase.includes('VITE_ENABLE_FIREBASE_APPCHECK') && rootFirebase.includes('appCheckExplicitlyEnabled');
const appCheckIsHardDisabled = rootFirebase.includes('export const appCheck = null') && rootFirebase.includes('appCheckInitialized: false');
assert(appCheckIsEnvGated || appCheckIsHardDisabled, 'Root Firebase app must either gate App Check behind VITE_ENABLE_FIREBASE_APPCHECK or hard-disable it while reCAPTCHA is invalid.');

// Firestore launch-blocker guardrails.
const userSection = extractSection(firestoreRules, 'match /users/{userId}', 'match /propertyMembers/{propertyId}');
const technicianSection = extractSection(firestoreRules, 'match /technicians/{techId}', 'match /settings/companyProfile');
const notificationsSection = extractSection(firestoreRules, 'match /notifications/{notifId}', 'match /brokerReferrals/{referralId}');
const auditLogsSection = extractSection(firestoreRules, 'match /auditLogs/{auditId}', 'match /disputes/{disputeId}');
const paymentTransactionsSection = extractSection(firestoreRules, 'match /payment_transactions/{paymentId}', 'match /design_requests/{requestId}');
const designRequestsSection = extractSection(firestoreRules, 'match /design_requests/{requestId}', 'match /{document=**}');

for (const blockedField of ['dashboardUnlocked', 'adminApproved', 'paymentVerified', 'activeContractId', 'approvedAt', 'approvedBy']) {
  assert(!userSection.includes(`'${blockedField}'`), `Firestore users self-update allowlist must not include ${blockedField}; activation/payment fields must be admin/server controlled.`);
}

assert(!technicianSection.includes('allow read: if signedIn();'), 'Technician profiles must not be readable by every signed-in user.');
assert(!notificationsSection.includes('allow create: if isAdmin() || signedIn();'), 'Notification creation must be scoped to admin/server or the recipient user.');
assert(!auditLogsSection.includes('allow create: if signedIn();'), 'Audit log creation must require actorId to match the caller or be admin/server controlled.');
assert(paymentTransactionsSection.includes('request.resource.data.ownerUid == request.auth.uid') || paymentTransactionsSection.includes('request.resource.data.ownerId == request.auth.uid'), 'Payment transaction creation must require an owner/payer field to match the caller UID.');
assert(!designRequestsSection.includes('allow create: if signedIn();'), 'Design request creation must require caller-owned owner/tenant fields, not only signed-in status.');

if (failures.length) {
  console.error('\nProduction stability guard failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Production stability guard passed.');
