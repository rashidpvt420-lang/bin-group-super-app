import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(new URL(`../../${p}`, import.meta.url), 'utf8');

test('account step: email verification stays mandatory and sign-in stays in onboarding', async () => {
  const src = await read('src/components/onboarding/AccountCreationStep.tsx');
  assert.match(src, /sendEmailVerification/);
  assert.match(src, /if \(!currentUser\.emailVerified\)/, 'continue must still refuse an unverified email');
  assert.match(src, /resolvedRole !== 'owner'/);
  assert.doesNotMatch(src, /window\.location\.href = '\/login'/, 'sign-in must not drop the owner out of onboarding');
  assert.doesNotMatch(src, /fetchSignInMethodsForEmail/, 'enumeration-protected lookup cannot detect Google accounts');
  assert.match(src, /signInWithEmailAndPassword/);
  assert.match(src, /sendPasswordResetEmail/);
  assert.match(src, /GoogleAuthProvider/);
  assert.match(src, /resendCooldownRemaining/);
  assert.match(src, /existingRoleConflict/);
  assert.match(src, /visibilitychange/, 'verification is re-checked when the owner returns to the tab');
  assert.doesNotMatch(src, /color="#FFF"|color: '#FFF'|rgba\(255,\s*255,\s*255/, 'no hard-coded dark-theme text colours');
  assert.doesNotMatch(src, /action=\{error\.action/, 'errors must not squeeze a button into the Alert action slot');
});

test('onboarding header: one progress line, language switch, no duplicate intro copy', async () => {
  const page = await read('src/pages/PropertyOnboardingPage.tsx');
  assert.match(page, /toggleLanguage/);
  assert.match(page, /initialOwnerSection/);
  assert.doesNotMatch(page, /five-page application progress/);
  assert.doesNotMatch(page, /Five clear pages\. Payment is requested only after/);
});

test('public AI assistant button is hidden on onboarding and login', async () => {
  const app = await read('src/App.tsx');
  assert.match(app, /AI_FAB_HIDDEN_PREFIXES = \['\/onboarding', '\/login'\]/);
  assert.match(app, /function PublicSovereignAIEntry\(\)[\s\S]*if \(isRolePortalRoute\) return null;[\s\S]*if \(hideOnFormRoute\) return null;/);
});
