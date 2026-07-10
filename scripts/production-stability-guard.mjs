import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

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

function runGuard(script) {
  try {
    execFileSync(process.execPath, [script], { stdio: 'inherit' });
  } catch (error) {
    failures.push(`Nested launch guard failed: ${script}`);
  }
}

// Keep these inside test:stability so CI and Firebase production validation cannot
// accidentally bypass route, duplicate, dashboard, onboarding, profile, or rules-access checks.
runGuard('scripts/audit-admin-canonicalization.mjs');
runGuard('scripts/audit-five-profile-workflows.mjs');
runGuard('scripts/audit-route-and-file-duplicates.mjs');
runGuard('scripts/audit-role-firestore-access.mjs');
runGuard('scripts/verify-five-profile-workflows.mjs');
runGuard('scripts/verify-duplicate-resolution.mjs');
runGuard('scripts/verify-canonical-route-architecture.mjs');

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
const onboardingPersistence = read('src/store/onboardingPersistence.ts');

const ownerActivationIsAdminControlled =
  firestoreRules.includes('adminCreateOrUpdateActivatedContract') ||
  (
    firestoreRules.includes('safeOwnerContractUpdate') &&
    firestoreRules.includes("!(request.resource.data.status in ['active', 'ACTIVE'])") &&
    (
      firestoreRules.includes("allow update: if isAdmin() || hasPermission('canManageContracts') || safeOwnerContractUpdate()") ||
      firestoreRules.includes('allow update: if canManageContracts() || safeOwnerContractUpdate()')
    )
  );

const stripeReturnsToOwnerActivation =
  stripePayment.includes('/owner/activation?payment_success=true') &&
  stripePayment.includes('/owner/activation?payment_failed=true') &&
  stripePayment.includes('session_id={CHECKOUT_SESSION_ID}') &&
  app.includes('<Route path="/owner/*"');

const packageCallIndex = paymentStep.indexOf("httpsCallable(functions, 'submitOwnerOnboardingPaymentPackage')");
const checkoutCallIndex = paymentStep.indexOf("httpsCallable(functions, 'createStripeCheckoutSession')");
const packagePersistsBeforeCheckout = packageCallIndex >= 0 && checkoutCallIndex >= 0 && packageCallIndex < checkoutCallIndex;

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

const workflowWithoutOptionalFunctionsTolerance = workflow.replace(
  /\n\s*- name: Attempt Functions deploy and capture edge failures[\s\S]*?\n\s*exit 0\n?/,
  '\n'
);

assert(firebaseJson.includes('"public": "dist"'), 'Firebase Hosting must deploy dist.');
assert(firebaseJson.includes('"rules": "firestore.rules"'), 'Firebase must reference firestore.rules.');
assert(firebaseJson.includes('"rules": "storage.rules"'), 'Firebase must reference storage.rules.');
assert(firebaseJson.includes('"target": "app"'), 'Firebase public hosting must use explicit app target.');
assert(firebaseJson.includes('"target": "admin"'), 'Firebase admin hosting must use explicit admin target.');

assert(workflow.includes('Validate production build'), 'Workflow must validate production build.');
assert(workflow.includes('Deploy Firebase production stack'), 'Workflow must include production deployment job.');
assert(workflowDispatchOnly || deployJobHasManualGate || emergencyPushDeployIsExplicit, 'Production deploy must be manual-only or explicitly emergency push-gated with secrets preflight.');
assert(workflow.includes('npm run test:stability'), 'Production validation must run the stability gate containing all canonical audits.');
assert(workflow.includes('npm run build --workspace=functions'), 'Workflow must build Firebase Functions.');
assert(workflow.includes('npm run test:rules'), 'Workflow must run Firestore rules tests.');
assert(workflow.includes('npm run build --workspace=@bin/shared'), 'Workflow must build the shared package.');
assert(!workflowWithoutOptionalFunctionsTolerance.includes('continue-on-error: true'), 'Critical production validation/deploy steps must not ignore errors.');

assert(accountStep.includes('submitPendingOwnerRegistration'), 'Owner account step must use server-backed pending owner registration.');
assert(accountStep.includes('signInWithEmailAndPassword'), 'Owner account step must establish an authenticated session after registration.');
assert(ownerRegistration.includes('dashboardLocked: true'), 'New owner registrations must default to dashboardLocked.');
assert(ownerRegistration.includes('paymentVerified: false'), 'New owner registrations must default to paymentVerified false.');
assert(ownerRegistration.includes('adminApproved: false'), 'New owner registrations must default to adminApproved false.');
assert(onboardingPersistence.includes('safeSignupData'), 'Onboarding persistence must sanitize credentials.');
assert(!onboardingPersistence.includes('password: signupData'), 'Onboarding persistence must never store the owner password.');

assert(paymentStep.includes('uploadProofDocuments'), 'Payment submission must upload proof documents.');
assert(paymentStep.includes('submitOwnerOnboardingPaymentPackage'), 'Payment submission must use backend package callable.');
assert(paymentStep.includes('waitForCurrentUser'), 'Payment submission must wait for auth hydration.');
assert(packagePersistsBeforeCheckout, 'Owner package persistence must occur before Stripe Checkout creation.');
assert(!paymentStep.includes("params.get('payment_success') === 'true'"), 'Client query parameters must not be treated as successful payment proof.');

assert(!stripePayment.includes('mock_session_id'), 'Stripe checkout must not return mock sessions.');
assert(stripePayment.includes('failed-precondition'), 'Stripe checkout must fail closed when unconfigured or package persistence is missing.');
assert(stripePayment.includes('assertAuthenticatedOwner(request, ownerUid)'), 'Stripe checkout must bind the caller to the authenticated owner.');
assert(stripePayment.includes('return intakeId;'), 'Stripe onboarding must use the canonical intake ID as the payment ID.');
assert(stripePayment.includes('adminApprovalRequired: true'), 'Stripe verification must explicitly require final admin approval.');
assert(stripePayment.includes('unlocksDashboard: false'), 'Stripe verification must not directly unlock the owner dashboard.');
assert(stripePayment.includes('PAYMENT_VERIFIED_PENDING_ADMIN_APPROVAL'), 'Stripe verification must preserve the pending-admin activation state.');
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

if (failures.length) {
  console.error('\nProduction stability guard failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Production stability guard passed.');
