import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(file, 'utf8');

const workflow = read('.github/workflows/owner-auth-recovery-command.yml');
const recovery = read('scripts/repair-owner-auth-blocking-functions.mjs');
const accountStep = read('src/components/onboarding/AccountCreationStep.tsx');
const onboardingPage = read('src/pages/PropertyOnboardingPage.tsx');

test('Owner Auth recovery is an exact owner-only protected production command', () => {
  assert.match(workflow, /issue_comment:\s*\n\s*types: \[created\]/);
  assert.match(workflow, /github\.event\.issue\.number == 434/);
  assert.match(workflow, /github\.event\.comment\.user\.login == github\.repository_owner/);
  assert.match(workflow, /github\.event\.comment\.author_association == 'OWNER'/);
  assert.match(workflow, /github\.event\.comment\.body == '\/bin-launch repair-owner-auth'/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /google-github-actions\/auth@v2/);
  assert.match(workflow, /token_format: access_token/);
  assert.match(workflow, /repair-owner-auth-blocking-functions\.mjs --repair --probe/);
});

test('Auth recovery clears only blocking triggers and proves real public signup', () => {
  assert.match(recovery, /identitytoolkit\.googleapis\.com\/admin\/v2/);
  assert.match(recovery, /updateMask', 'blockingFunctions\.triggers'/);
  assert.match(recovery, /blockingFunctions: \{ triggers: \{\} \}/);
  assert.match(recovery, /accounts:signUp/);
  assert.match(recovery, /accounts:delete/);
  assert.match(recovery, /GITHUB_REF !== 'refs\/heads\/main'/);
  assert.match(recovery, /sensitiveValuesExcluded: true/);
  assert.doesNotMatch(recovery, /console\.log\([^\n]*(accessToken|password|idToken)/i);
});

test('Owner onboarding remains five pages and never renders raw Firebase HTML errors', () => {
  assert.match(onboardingPage, /const PAGE_COUNT = 5/);
  assert.match(accountStep, /createUserWithEmailAndPassword/);
  assert.match(accountStep, /isBlockingFunctionFailure/);
  assert.match(accountStep, /secure account verification service is temporarily unavailable/i);
  assert.doesNotMatch(accountStep, /\$\{err\?\.message/);
  assert.doesNotMatch(accountStep, /setError\(\{ message: err\?\.message/);
});
