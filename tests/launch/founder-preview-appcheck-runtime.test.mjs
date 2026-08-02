import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  canonicalHostingSiteId,
  classifyConsoleSignal,
  classifyRuntimeSignals,
  redactUrl,
} from '../../scripts/verify-founder-preview-appcheck-runtime.mjs';

const workflowPath = new URL('../../.github/workflows/founder-preview-appcheck-runtime.yml', import.meta.url);
const verifierPath = new URL('../../scripts/verify-founder-preview-appcheck-runtime.mjs', import.meta.url);

test('runtime classification fails closed on the observed reCAPTCHA 400 pattern', () => {
  const result = classifyRuntimeSignals({
    appCheckActiveObserved: true,
    appCheckExchangeStatuses: [],
    recaptchaStatuses: [400],
    consoleSignals: ['appcheck-active', 'appcheck-recaptcha-error'],
    requestFailureKinds: ['recaptcha-clear-request-failed'],
  });

  assert.equal(result.passed, false);
  assert.ok(result.fatalSignals.includes('appcheck-recaptcha-error'));
  assert.ok(result.fatalSignals.includes('recaptcha-http-failure'));
  assert.ok(result.fatalSignals.includes('appcheck-token-exchange-not-observed'));
});

test('runtime classification passes only after a successful App Check exchange', () => {
  const result = classifyRuntimeSignals({
    appCheckActiveObserved: true,
    appCheckExchangeStatuses: [200],
    recaptchaStatuses: [200],
    consoleSignals: ['appcheck-active'],
    requestFailureKinds: [],
    pageErrorCount: 0,
  });

  assert.equal(result.passed, true);
  assert.equal(result.successfulExchangeCount, 1);
  assert.deepEqual(result.fatalSignals, []);
});

test('runtime classification rejects compiled-but-inactive App Check', () => {
  const result = classifyRuntimeSignals({
    appCheckActiveObserved: false,
    appCheckExchangeStatuses: [],
    recaptchaStatuses: [],
  });

  assert.equal(result.passed, false);
  assert.ok(result.fatalSignals.includes('appcheck-active-console-not-observed'));
  assert.ok(result.fatalSignals.includes('appcheck-token-exchange-not-observed'));
});

test('console classification records only sanitized signal names', () => {
  assert.equal(classifyConsoleSignal('App Check active.'), 'appcheck-active');
  assert.equal(
    classifyConsoleSignal('FirebaseError: AppCheck: ReCAPTCHA error. (appCheck/recaptcha-error).'),
    'appcheck-recaptcha-error',
  );
  assert.equal(
    classifyConsoleSignal('Error while retrieving App Check token: FirebaseError'),
    'appcheck-token-retrieval-error',
  );
  assert.equal(classifyConsoleSignal('unrelated browser message'), null);
});

test('Hosting manifest comparison uses the Firebase site ID, not the public hostname', () => {
  assert.equal(
    canonicalHostingSiteId('https://bin-founder-totp-260801174030.web.app'),
    'bin-founder-totp-260801174030',
  );
  assert.equal(
    canonicalHostingSiteId('https://bin-founder-totp-260801174030.firebaseapp.com'),
    'bin-founder-totp-260801174030',
  );
});

test('URL redaction strips query strings, fragments, and embedded key material', () => {
  const redacted = redactUrl('https://www.google.com/recaptcha/api2/clr?k=do-not-persist#token');
  assert.equal(redacted, 'https://www.google.com/recaptcha/api2/clr');
  assert.equal(redacted.includes('do-not-persist'), false);
});

test('verifier evidence never stores raw console text or request URLs', async () => {
  const source = await readFile(verifierPath, 'utf8');

  assert.match(source, /consoleSignals/);
  assert.match(source, /requestFailureKinds/);
  assert.doesNotMatch(source, /consoleMessages\s*:/);
  assert.doesNotMatch(source, /requestUrls\s*:/);
  assert.doesNotMatch(source, /message\.text\(\).*push/);
  assert.doesNotMatch(source, /response\.url\(\).*push/);
});

test('workflow is read-only, exact-head bound, and label gated', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /contains\(github\.event\.pull_request\.labels\.\*\.name, 'deploy-founder-preview'\)/);
  assert.match(workflow, /EXPECTED_HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(workflow, /bin-founder-totp-260801174030\.web\.app/);
  assert.match(workflow, /founder-preview-\$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(workflow, /publicReleaseGate/);
  assert.match(workflow, /hardLaunchClaim/);
  assert.doesNotMatch(workflow, /id-token:\s*write/);
  assert.doesNotMatch(workflow, /firebase-tools hosting:(?:channel:deploy|clone)/);
  assert.doesNotMatch(workflow, /firebase deploy/);
});
