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

const packageJson = read('package.json');
const firebaseJson = read('firebase.json');
const workflow = read('.github/workflows/firebase-production-deploy.yml');
const app = read('src/App.tsx');
const ownerPage = read('src/pages/PropertyOnboardingPage.tsx');
const accountStep = read('src/components/onboarding/AccountCreationStep.tsx');
const inspectionSubmission = read('src/components/onboarding/InspectionSubmissionStep.tsx');
const ownerOnboarding = read('functions/ownerOnboarding.ts');
const inspectionWorkflow = read('functions/inspectionFirstOwnerOnboarding.ts');
const inspectionLink = read('functions/ownerInspectionAdminLink.ts');
const inspectionCompletion = read('functions/ownerInspectionCompletion.ts');
const paymentStep = read('src/components/onboarding/PaymentSubmissionStep.tsx');
const stripePayment = read('functions/stripePayment.ts');
const ownerDashboard = read('src/owner/pages/OwnerDashboardResolvedPage.tsx');
const ownerActivationPolicy = read('src/owner/activationPolicy.ts');
const paymentEvidence = read('functions/paymentEvidence.ts');
const runtime = read('functions/runtime.ts');
const payrollPage = read('apps/admin-panel/src/pages/financials/PayrollManagementPage.tsx');
const firestoreRules = read('firestore.rules');
const generatedFirestoreRules = read('launch_generated/firestore.rules');
const firestoreRulesWriter = read('scripts/write-production-firestore-rules.mjs');
const storageRules = read('storage.rules');

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
assert(firebaseJson.includes('"rules": "launch_generated/firestore.rules"'), 'Firebase must deploy the generated hardened Firestore rules artefact.');
assert(packageJson.includes('"write:production-rules": "node scripts/write-production-firestore-rules.mjs"'), 'Package scripts must expose the production rules artefact writer.');
assert(packageJson.includes('npm run harden:live-location-authority && npm run write:production-rules'), 'The generated rules artefact must be written only after the final GPS authority hardener.');
assert(firestoreRulesWriter.includes("const outputPath = `${outputDirectory}/firestore.rules`"), 'Rules writer must target launch_generated/firestore.rules.');
assert(firestoreRulesWriter.includes("createHash('sha256')"), 'Rules writer must record a SHA-256 digest.');
assert(generatedFirestoreRules === firestoreRules, 'Generated Firestore deploy artefact must exactly equal the fully hardened source produced in this run.');
assert(firebaseJson.includes('"rules": "storage.rules"'), 'Firebase must reference storage.rules.');
assert(firebaseJson.includes('"target": "app"'), 'Firebase public hosting must use explicit app target.');
assert(firebaseJson.includes('"target": "admin"'), 'Firebase admin hosting must use explicit admin target.');

assert(workflow.includes('Validate production build'), 'Workflow must validate production build.');
assert(
  workflow.includes('Deploy and verify Firebase production stack') &&
    workflow.includes('node scripts/deploy-firebase-production.mjs'),
  'Workflow must deploy through the protected Firebase production script.',
);
assert(workflowDispatchOnly || deployJobHasManualGate || emergencyPushDeployIsExplicit, 'Production deploy must be manual-only or explicitly emergency push-gated with secrets preflight.');
assert(workflow.includes('npm run build:functions'), 'Workflow must invoke the canonical Firebase Functions build script.');
assert(packageJson.includes('"build:functions": "npm run build --workspace=functions"'), 'The canonical Functions build script must compile the functions workspace.');
assert(workflow.includes('npm run test:rules'), 'Workflow must run Firestore rules tests.');
assert(workflow.includes('npm run build --workspace=@bin/shared'), 'Workflow must build the shared package.');
assert(!workflowWithoutOptionalFunctionsTolerance.includes('continue-on-error: true'), 'Critical production validation/deploy steps must not ignore errors.');

assert(ownerPage.includes('PAGE_COUNT = 5'), 'Public Owner onboarding must expose exactly five top-level pages.');
assert(ownerPage.includes('InspectionSubmissionStep'), 'Page 5 must submit the application for Admin review and property visits.');
assert(!ownerPage.includes('PaymentSummaryStep') && !ownerPage.includes('PaymentSubmissionStep'), 'Public five-page Owner onboarding must not collect payment.');
assert(accountStep.includes('createUserWithEmailAndPassword'), 'Owner account page must create the Firebase Auth account directly.');
assert(accountStep.includes('sendEmailVerification'), 'Owner account page must verify control of the Owner email.');
assert(accountStep.includes('upsertOwnerOnboardingProfile'), 'Verified Owner identity must be bound to the server-authored profile.');
assert(!accountStep.includes('submitPendingOwnerRegistration'), 'Public Owner account creation must not depend on the App Check registration deadlock.');
assert(ownerOnboarding.includes('if (!request.auth)'), 'Owner profile upsert must require Firebase Auth.');
assert(ownerOnboarding.includes('email_verified !== true'), 'Owner profile upsert must require verified email.');
assert(ownerOnboarding.includes('dashboardLocked: true'), 'New Owner profiles must remain dashboard locked.');
assert(ownerOnboarding.includes('paymentVerified: false'), 'New Owner profiles must default to paymentVerified false.');
assert(ownerOnboarding.includes('adminApproved: false'), 'New Owner profiles must default to adminApproved false.');

assert(inspectionSubmission.includes('uploadOwnerInspectionProofDocument'), 'Page 5 must upload protected proof documents server-side.');
assert(inspectionSubmission.includes('submitOwnerInspectionFirstOnboarding'), 'Page 5 must use the inspection-first backend submission callable.');
assert(inspectionSubmission.includes('waitForCurrentUser'), 'Page 5 must wait for Owner Auth hydration.');
assert(!inspectionSubmission.includes('paymentReceipt') && !inspectionSubmission.includes('createStripeCheckoutSession'), 'Page 5 must not collect cash, cheque, bank or card payment.');
assert(inspectionWorkflow.includes('OWNER_FIVE_PAGE_INSPECTION_FIRST_V1'), 'Backend must version the five-page inspection-first workflow.');
assert(inspectionWorkflow.includes('SUBMITTED_FOR_PROPERTY_INSPECTION'), 'Submission must enter Admin property-review state.');
assert(inspectionWorkflow.includes('NOT_DUE_UNTIL_INSPECTION_COMPLETE'), '15% payment must not be due before the site visit.');
assert(inspectionWorkflow.includes('INSPECTION_REQUIRED_BEFORE_PAYMENT'), 'Payment record must fail closed until inspection.');
assert(inspectionWorkflow.includes('Number(quote.annualContractValue) * 0.15'), 'Backend must lock the exact 15% mobilisation amount.');
assert(inspectionWorkflow.includes('adminRecordOwnerMobilizationPaymentEvidence'), 'Admin must record immutable 15% receipt evidence before approval.');
assert(inspectionWorkflow.includes('payment.inspectionVerified !== true'), 'Receipt recording must reject payment before completed inspections.');
assert(inspectionLink.includes('adminCreateOwnerPortfolioPropertyInspection'), 'Admin must create portfolio-safe inspections.');
assert(inspectionLink.includes('paymentCollectionRequired: false'), 'Property visits must never collect Owner payment.');
assert(inspectionLink.includes('Expected ${propertyCount}, received ${inspectionIds.length}'), 'Admin must create one linked inspection per property.');
assert(inspectionCompletion.includes('Every property requires a linked site inspection'), 'Portfolio completion must require every property inspection.');
assert(inspectionCompletion.includes('PENDING_ADMIN_PAYMENT_VERIFICATION'), 'Completed visits must make the exact 15% ready for Admin verification.');

// Keep legacy Phase 2 Stripe code fail-closed even though it is not routed from the five-page acquisition flow.
assert(paymentStep.includes('uploadProofDocuments'), 'Legacy payment submission must upload proof documents.');
assert(paymentStep.includes('submitOwnerOnboardingPaymentPackage'), 'Legacy payment submission must use backend package callable.');
assert(paymentStep.includes('waitForCurrentUser'), 'Legacy payment submission must wait for auth hydration.');
assert(packagePersistsBeforeCheckout, 'Legacy Owner package persistence must occur before Stripe Checkout creation.');
assert(!paymentStep.includes("params.get('payment_success') === 'true'"), 'Client query parameters must not be treated as successful payment proof.');

assert(!stripePayment.includes('mock_session_id'), 'Stripe checkout must not return mock sessions.');
assert(stripePayment.includes('failed-precondition'), 'Stripe checkout must fail closed when unconfigured or package persistence is missing.');
assert(stripePayment.includes('assertAuthenticatedPayer(request, ownerUid)'), 'Stripe checkout must bind the caller to the authenticated payer.');
assert(stripePayment.includes('return intakeId;'), 'Stripe onboarding must use the canonical intake ID as the payment ID.');
assert(stripePayment.includes('adminApprovalRequired: true'), 'Stripe verification must explicitly require final admin approval.');
assert(stripePayment.includes('unlocksDashboard: false'), 'Stripe verification must not directly unlock the owner dashboard.');
assert(stripePayment.includes('PAYMENT_VERIFIED_PENDING_ADMIN_APPROVAL'), 'Stripe verification must preserve the pending-admin activation state.');
assert(stripeReturnsToOwnerActivation, 'Stripe return URLs must route to the owner activation flow.');
assert(!existsSync('src/pages/public/PaymentResultPage.tsx'), 'Legacy PaymentResultPage must be removed after Stripe owner activation routing.');

assert(!ownerDashboard.includes("'READY_FOR_ACTIVATION'"), 'Owner dashboard active states must not include READY_FOR_ACTIVATION.');
assert(!ownerDashboard.includes("'OWNER_SIGNED'"), 'Owner dashboard active states must not include OWNER_SIGNED.');
assert(ownerDashboard.includes('isOwnerProfileActivated'), 'Owner dashboard must use the canonical profile activation policy.');
assert(ownerDashboard.includes('isOwnerContractActivated'), 'Owner dashboard must use the canonical contract activation policy.');
for (const requiredFlag of [
  "normalized(profile.status) === 'active'",
  'profile.adminApproved === true',
  'profile.paymentVerified === true',
  'profile.dashboardUnlocked === true',
  'profile.dashboardLocked !== true',
  "profile.activeContractId || ''",
]) {
  assert(ownerActivationPolicy.includes(requiredFlag), `Owner activation policy missing ${requiredFlag}.`);
}

assert(!firestoreRules.includes('function paymentDraftCreate'), 'Legacy client-authored payment drafts must remain removed.');
assert(
  firestoreRules.includes('match /payment_transactions/{paymentId}') &&
    firestoreRules.includes('// Financial evidence is always created by a validated Cloud Function.') &&
    firestoreRules.includes('allow create: if false;'),
  'Firestore rules must keep payment transactions server-authored.',
);
assert(firestoreRules.includes('safeTenantEvidenceUpdate'), 'Firestore rules must allow narrow tenant-owned evidence metadata updates.');
assert(ownerActivationIsAdminControlled, 'Firestore rules must keep activation admin controlled.');
assert(storageRules.includes('onboarding-proof'), 'Storage rules must cover onboarding proof uploads.');
assert(storageRules.includes('function hasVerifiedEmail()'), 'Storage email ACLs must require a verified email claim.');
assert(storageRules.includes('hasTenantReceiptMetadata(tenantId)'), 'Tenant receipt uploads must bind immutable hash metadata.');
assert(paymentEvidence.includes('assertStoredTenantReceipt'), 'Tenant payment proof must verify stored receipt metadata server-side.');
assert(runtime.includes('submitOwnerInspectionFirstOnboarding'), 'Runtime must explicitly export five-page Owner submission.');
assert(runtime.includes('adminRecordOwnerMobilizationPaymentEvidence'), 'Runtime must explicitly export immutable Owner payment evidence recording.');
assert(runtime.includes('from "./inspectionFirstOwnerOnboarding"'), 'Runtime must source the explicit five-page Owner callables.');
assert(!/^export \* from "\.\/inspectionFirstOwnerOnboarding";/m.test(runtime), 'Runtime must not deploy the unsafe legacy single-property completion export.');
assert(runtime.includes('export * from "./ownerInspectionAdminLink";'), 'Runtime must export portfolio inspection creation/linking.');
assert(runtime.includes('export * from "./ownerInspectionCompletion";'), 'Runtime must export portfolio inspection completion.');
assert(runtime.includes('export * from "./paymentEvidence";'), 'Runtime must export tenant and design payment callables.');
assert(runtime.includes('export * from "./ticketDispatchOperations";'), 'Runtime must export dispatch and dispute callables.');
assert(payrollPage.includes("'adminGeneratePayrollBatch'"), 'Admin payroll UI must use the server-side generation callable.');
assert(payrollPage.includes("'adminSettlePayrollRecord'"), 'Admin payroll UI must use the server-side settlement callable.');
assert(!payrollPage.includes("collection(db, 'transactions')"), 'Admin payroll UI must not write financial ledger rows directly.');

if (failures.length) {
  console.error('\nProduction stability guard failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Production stability guard passed.');
