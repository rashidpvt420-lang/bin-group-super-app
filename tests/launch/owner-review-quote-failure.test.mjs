// Live incident 2026-09-30 21:41 GST (prod 0b2ac993): page 4/5 "Review & Sign" showed
// "Your secure Owner session has expired" while Cloud Functions logged every
// previewOwnerInspectionQuote call as HTTP 401 with verifications { auth: VALID, app: MISSING }.
// The failure was App Check, not the Owner session, so "Sign in again" could never help.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function loadTypeScriptModule(path) {
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: path,
  }).outputText;
  const module = { exports: {} };
  vm.runInContext(compiled, vm.createContext({ module, exports: module.exports, String }), { filename: path });
  return module.exports;
}

const failure = loadTypeScriptModule('src/components/onboarding/ownerQuoteFailure.ts');
const review = readFileSync('src/components/onboarding/ReviewBeforeSubmitStep.tsx', 'utf8');
const systems = readFileSync('src/components/onboarding/SystemsDataStep.tsx', 'utf8');

test('a 401 after a successful ID-token refresh is an App Check failure, not an expired session', () => {
  // Exactly the production pattern: auth VALID (token refreshed), app MISSING -> functions/unauthenticated.
  assert.equal(failure.classifyOwnerQuoteFailure({ code: 'functions/unauthenticated', idTokenRefreshed: true, appCheckTokenOk: null }), 'security_check');
  assert.equal(failure.classifyOwnerQuoteFailure({ code: 'functions/unauthenticated', idTokenRefreshed: true, appCheckTokenOk: false }), 'security_check');
  assert.equal(failure.classifyOwnerQuoteFailure({ code: 'functions/internal', idTokenRefreshed: true, appCheckTokenOk: false }), 'security_check');
});

test('only a failed ID-token refresh is reported as an expired session', () => {
  assert.equal(failure.classifyOwnerQuoteFailure({ code: 'auth/network-request-failed', idTokenRefreshed: false, appCheckTokenOk: null }), 'session_expired');
  assert.equal(failure.classifyOwnerQuoteFailure({ code: 'auth/user-token-expired', idTokenRefreshed: false, appCheckTokenOk: null }), 'session_expired');
});

test('server permission-denied with a valid session and App Check is an account-state problem', () => {
  assert.equal(failure.classifyOwnerQuoteFailure({ code: 'functions/permission-denied', idTokenRefreshed: true, appCheckTokenOk: true }), 'account_not_ready');
  assert.equal(failure.classifyOwnerQuoteFailure({ code: 'functions/invalid-argument', idTokenRefreshed: true, appCheckTokenOk: true }), 'failed');
});

test('"Sign in again" is offered only for an expired session; Retry for security-check and transient failures', () => {
  assert.equal(failure.ownerQuoteFailureOffersSignIn('session_expired'), true);
  for (const kind of ['security_check', 'account_not_ready', 'failed']) assert.equal(failure.ownerQuoteFailureOffersSignIn(kind), false, kind);
  assert.equal(failure.ownerQuoteFailureOffersRetry('security_check'), true);
  assert.equal(failure.ownerQuoteFailureOffersRetry('failed'), true);
  assert.equal(failure.ownerQuoteFailureOffersRetry('session_expired'), false);
  assert.equal(failure.ownerQuoteFailureOffersRetry('account_not_ready'), false);
});

test('Review & Sign probes App Check before the quote call and classifies failures', () => {
  assert.match(review, /import \{ getToken as getAppCheckToken \} from 'firebase\/app-check';/);
  assert.match(review, /import \{ appCheck, auth, functions, httpsCallable \} from '\.\.\/\.\.\/lib\/firebase';/);
  assert.match(review, /await auth\.currentUser\.getIdToken\(true\);\s*idTokenRefreshed = true;/);
  assert.match(review, /await getAppCheckToken\(appCheck, false\);/);
  assert.match(review, /classifyOwnerQuoteFailure\(\{ code: error\?\.code, idTokenRefreshed, appCheckTokenOk \}\)/);
  assert.match(review, /setQuoteNeedsSignIn\(ownerQuoteFailureOffersSignIn\(failure\)\)/);
  // The old blanket mapping of unauthenticated/permission-denied to "session expired" is gone.
  assert.doesNotMatch(review, /if \(code\.includes\('unauthenticated'\) \|\| code\.includes\('permission-denied'\)\) \{\s*setQuoteNeedsSignIn\(true\);/);
  assert.match(review, /signing in again will not fix this/);
  assert.match(review, /setQuoteRetryNonce\(\(value\) => value \+ 1\)/);
  assert.match(review, /quoteRetryNonce\]\);/);
});

test('page-3 add-ons are required only by the systems the Owner selected (no forced baseline stack)', () => {
  assert.doesNotMatch(systems, /BASE_REQUIRED_STACK_IDS/);
  assert.match(systems, /if \(property\?\.fireAlarm === true \|\| property\?\.firePump === true\) ids\.push\('fire_safety'\);/);
  assert.match(systems, /if \(property\?\.tank === true\) ids\.push\('water_tank'\);/);
  assert.match(systems, /if \(property\?\.hvac === true \|\| Number\(property\?\.hvacCount \|\| 0\) > 0\) ids\.push\('hvac_pm'\);/);
  const body = systems.match(/const getRequiredStackIds = \(property: any\) => \{([\s\S]*?)\n\};/)?.[1] || '';
  const jsBody = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const getRequiredStackIds = new Function('property', 'isMajlisAsset', 'ELEVATOR_ADDON_ID', jsBody);
  const none = () => false;
  assert.deepEqual([...getRequiredStackIds({}, none, 'elevator_amc')], [], 'zero systems selected -> zero required add-ons');
  assert.deepEqual([...getRequiredStackIds({ fireAlarm: true, tank: true, hvac: true, lifts: 1 }, none, 'elevator_amc')], ['fire_safety', 'water_tank', 'hvac_pm', 'elevator_amc']);
});
