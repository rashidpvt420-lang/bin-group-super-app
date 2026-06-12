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
const workflow = read('.github/workflows/firebase-production-deploy.yml');
const app = read('src/App.tsx');
const accountStep = read('src/components/onboarding/AccountCreationStep.tsx');
const paymentStep = read('src/components/onboarding/PaymentSubmissionStep.tsx');
const ownerRegistration = read('functions/ownerRegistrationRequest.ts');
const stripePayment = read('functions/stripePayment.ts');
const ownerDashboard = read('src/owner/pages/OwnerDashboardResolvedPage.tsx');
const firestoreRules = read('firestore.rules');
const storageRules = read('storage.rules');
const realtimeService = read('src/lib/firebaseRealtimeService.ts');

const ownerActivationIsAdminControlled =
  firestoreRules.includes('adminCreateOrUpdateActivatedContract') ||
  (
    firestoreRules.includes('safeOwnerContractUpdate') &&
    firestoreRules.includes("!(request.resource.data.status in ['active', 'ACTIVE'])") &&
    firestoreRules.includes("allow update: if isAdmin() || hasPermission('canManageContracts') || safeOwnerContractUpdate()")
  );

const stripeReturnsToOwnerActivation =
  stripePayment.includes('/owner/activation?payment_success=true') &&
  stripePayment.includes('/owner/activation?payment_failed=true') &&
  stripePayment.includes('session_id={CHECKOUT_SESSION_ID}') &&
  app.includes('<Route path="/owner/*"');

const workflowDispatchOnly =
  workflow.includes('workflow_dispatch:') &&
  !workflow.includes('\n  push:') &&
  !workflow.includes('\n  pull_request:') &&
  !workflow.includes('\n  schedule:');

const deployJobHasManualGate = workflow.includes("if: github.event_name == 'workflow_dispatch'");
const emergencyPushDeployIsExplicit =
  workflow.includes('push:') &&
  workflow.includes('branches: [main]') &&
  workflow.includes("if: github.event_name == 'workflow_dispatch' || github.event_name == 'push'") &&
  workflow.includes('Deployment secrets preflight');

assert(firebaseJson.includes('"public": "dist"'), 'Firebase Hosting must deploy dist.');
assert(firebaseJson.includes('"rules": "firestore.rules"'), 'Firebase must reference firestore.rules.');
assert(firebaseJson.includes('"rules": "storage.rules"'), 'Firebase must reference storage.rules.');
assert(firebaseJson.includes('"target": "app"'), 'Firebase public hosting must use explicit app target.');
assert(firebaseJson.includes('"target": "admin"'), 'Firebase admin hosting must use explicit admin target.');

assert(workflow.includes('Validate production build'), 'Workflow must validate production build.');
assert(workflow.includes('Deploy Firebase production stack'), 'Workflow must include production deployment job.');
assert(workflowDispatchOnly || deployJobHasManualGate || emergencyPushDeployIsExplicit, 'Production deploy must be manual-only or explicitly emergency push-gated with secrets preflight.');
assert(workflow.includes('npm run build --workspace=functions'), 'Workflow must build Firebase Functions.');
assert(workflow.includes('npm run test:rules'), 'Workflow must run Firestore rules tests.');
assert(workflow.includes('npm run build --workspace=@bin/shared'), 'Workflow must build the shared package.');
assert(!workflow.includes('continue-on-error: true'), 'Critical production validation/deploy steps must not ignore errors.');
assert(workflow.includes('Deploy Firebase Functions'), 'Workflow must deploy Firebase Functions as a first-class production step.');
assert(workflow.includes('npx firebase deploy --only functions'), 'Workflow must deploy Firebase Functions.');
assert(workflow.includes('VITE_ENABLE_FIREBASE_APPCHECK=true'), 'Production build must enable App Check when a site key exists.');

assert(accountStep.includes('submitPendingOwnerRegistration'), 'Owner account step must use server-backed pending owner registration.');
assert(accountStep.includes('signInWithEmailAndPassword'), 'Owner account step must establish an authenticated session after registration.');
assert(ownerRegistration.includes('dashboardLocked: true'), 'New owner registrations must default to dashboardLocked.');
assert(ownerRegistration.includes('paymentVerified: false'), 'New owner registrations must default to paymentVerified false.');
assert(ownerRegistration.includes('adminApproved: false'), 'New owner registrations must default to adminApproved false.');

assert(paymentStep.includes('uploadProofDocuments'), 'Payment submission must upload proof documents.');
assert(paymentStep.includes('submitOwnerOnboardingPaymentPackage'), 'Payment submission must use backend package callable.');
assert(paymentStep.includes('waitForCurrentUser'), 'Payment submission must wait for auth hydration.');

assert(!stripePayment.includes('mock_session_id'), 'Stripe checkout must not return mock sessions.');
assert(stripePayment.includes('failed-precondition'), 'Stripe checkout must fail closed when unconfigured.');
assert(stripeReturnsToOwnerActivation, 'Stripe return URLs must route to the owner activation flow.');
assert(!existsSync('src/pages/public/PaymentResultPage.tsx'), 'Legacy PaymentResultPage must be removed after Stripe owner activation routing.');

assert(!ownerDashboard.includes("'READY_FOR_ACTIVATION'"), 'Owner dashboard active states must not include READY_FOR_ACTIVATION.');
assert(!ownerDashboard.includes("'OWNER_SIGNED'"), 'Owner dashboard active states must not include OWNER_SIGNED.');
assert(ownerDashboard.includes('profile.paymentVerified === true'), 'Owner dashboard profile active check must require paymentVerified.');
assert(ownerDashboard.includes('contract.paymentVerified === true'), 'Owner dashboard contract active check must require paymentVerified.');

assert(firestoreRules.includes('paymentDraftCreate'), 'Firestore rules must guard payment draft creation.');
assert(firestoreRules.includes('safeTenantEvidenceUpdate'), 'Firestore rules must allow narrow tenant-owned evidence metadata updates.');
assert(ownerActivationIsAdminControlled, 'Firestore rules must keep activation admin controlled.');
assert(storageRules.includes('onboarding-proof'), 'Storage rules must cover onboarding proof uploads.');

assert(realtimeService.includes("const MAINTENANCE_TICKETS_COLLECTION = 'maintenanceTickets'"), 'Realtime service must define maintenanceTickets as the canonical ticket collection.');
assert(!realtimeService.includes("collection(db, 'tickets')"), 'Realtime service must not subscribe to legacy tickets collection.');
assert(realtimeService.includes('collection(db, MAINTENANCE_TICKETS_COLLECTION)'), 'Realtime service must subscribe to maintenanceTickets.');
assert(realtimeService.includes('private addListener(ref: string, callback: (data: any) => void)'), 'Realtime service must keep a valid listener callback type signature.');

if (failures.length) {
  console.error('\nProduction stability guard failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Production stability guard passed.');
