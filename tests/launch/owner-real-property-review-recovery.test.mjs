import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (relativePath) => readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

test('Owner review refreshes Auth and App Check and retries protected quote evidence without weakening enforcement', async () => {
  const source = await read('src/components/onboarding/ReviewBeforeSubmitStep.tsx');
  assert.match(source, /getToken as getAppCheckToken/);
  assert.match(source, /forceNativeAppCheckRefresh/);
  assert.match(source, /await auth\.currentUser\.getIdToken\(true\)/);
  assert.match(source, /await getAppCheckToken\(appCheck, true\)/);
  assert.match(source, /requestProtectedQuote/);
  assert.match(source, /canRetrySecureProof/);
  assert.match(source, /previewOwnerInspectionQuote/);
  assert.doesNotMatch(source, /code\.includes\('permission-denied'\)\) \{\s*setQuoteNeedsSignIn\(true\)/);
});

test('Owner review reads submitted real-property location evidence instead of canonical verified geo only', async () => {
  const source = await read('src/components/onboarding/ReviewBeforeSubmitStep.tsx');
  assert.match(source, /primaryProperty\?\.submittedGeo \|\| primaryProperty\?\.location \|\| primaryProperty\?\.geo/);
  assert.match(source, /primaryProperty\?\.lat/);
  assert.match(source, /Property location captured for Admin verification/);
  assert.doesNotMatch(source, /primaryProperty\?\.geo\?\.lat && primaryProperty\?\.geo\?\.lng \? '✓ GPS captured/);
});

test('Financial recap is server authoritative and never substitutes zero or stale client pricing for a missing protected quote', async () => {
  const source = await read('src/components/onboarding/ReviewBeforeSubmitStep.tsx');
  assert.match(source, /serverQuoteRequestKey === quoteRequestKey \? storedServerQuote : undefined/);
  assert.match(source, /secureAmount\(serverQuote\?\.annualContractValue\)/);
  assert.match(source, /secureAmount\(serverQuote\?\.activationDeposit\)/);
  assert.match(source, /secureAmount\(installmentValue\)/);
  assert.doesNotMatch(source, /serverQuote\?\.annualContractValue \|\| 0/);
  assert.doesNotMatch(source, /serverQuote\?\.activationDeposit \|\| 0/);
  assert.doesNotMatch(source, /serverPropertyAnnual \|\| localQuote\?\.annualTotal/);
});

test('Contract performance is tied to the protected server property quote', async () => {
  const source = await read('src/components/onboarding/ReviewBeforeSubmitStep.tsx');
  assert.match(source, /contractMode\?: 'FM_ONLY' \| 'PM_ONLY' \| 'BOTH'/);
  assert.match(source, /pricingClass\?: string/);
  assert.match(source, /pricingDriver\?: string/);
  assert.match(source, /Protected server quote/);
  assert.match(source, /Protected annual value for this property/);
});

test('Owner reauthentication returns to the five-page onboarding review instead of being redirected to the locked dashboard', async () => {
  const source = await read('src/components/AuthenticatedShell.tsx');
  assert.match(source, /const requestedReturnTo = loginParams\.get\('returnTo'\)/);
  assert.match(source, /const canResumeOwnerOnboarding =/);
  assert.match(source, /safeReturnTo === '\/onboarding'/);
  assert.match(source, /return <Navigate to=\{safeReturnTo\} replace \/>/);
  const resumeIndex = source.indexOf('canResumeOwnerOnboarding');
  const dashboardIndex = source.indexOf('to="/owner/dashboard"');
  assert.ok(resumeIndex >= 0 && dashboardIndex > resumeIndex, 'onboarding return-to must be evaluated before the generic Owner dashboard redirect');
});
