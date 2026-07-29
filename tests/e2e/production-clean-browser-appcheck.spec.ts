import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const required = (name: string) => {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required for clean-browser App Check evidence.`);
  return value;
};

test('clean production browser obtains real App Check attestation without a debug token', async ({ page }) => {
  const config = {
    apiKey: required('VITE_FIREBASE_API_KEY'),
    authDomain: 'bin-group-57c60.firebaseapp.com',
    projectId: 'bin-group-57c60',
    storageBucket: 'bin-group-57c60.firebasestorage.app',
    messagingSenderId: required('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: required('VITE_FIREBASE_APP_ID'),
    siteKey: required('VITE_APP_CHECK_SITE_KEY'),
  };

  await page.addInitScript(() => {
    delete (globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN;
    delete (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN;
  });
  await page.goto('/', { waitUntil: 'networkidle' });

  const evidence = await page.evaluate(async (settings) => {
    delete (globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN;
    delete (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN;

    // @ts-ignore - browser-only ESM modules are intentionally loaded on the real hosted origin.
    const appModule = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js');
    // @ts-ignore
    const appCheckModule = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-check.js');
    // @ts-ignore
    const functionsModule = await import('https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js');

    const app = appModule.initializeApp({
      apiKey: settings.apiKey,
      authDomain: settings.authDomain,
      projectId: settings.projectId,
      storageBucket: settings.storageBucket,
      messagingSenderId: settings.messagingSenderId,
      appId: settings.appId,
    }, `clean_appcheck_${Date.now()}`);
    const appCheck = appCheckModule.initializeAppCheck(app, {
      provider: new appCheckModule.ReCaptchaV3Provider(settings.siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    const tokenResult = await appCheckModule.getToken(appCheck, true);
    const functions = functionsModule.getFunctions(app, 'europe-west3');
    const probe = functionsModule.httpsCallable(functions, 'verifyProductionAppCheckAttestation');
    const nonce = `${Date.now()}_${Math.random()}`;
    const response = await probe({ nonce });
    return {
      tokenLength: String(tokenResult?.token || '').length,
      debugTokenPresent: Boolean((globalThis as any).FIREBASE_APPCHECK_DEBUG_TOKEN || (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN),
      response: response.data,
    };
  }, config);

  expect(evidence.debugTokenPresent).toBe(false);
  expect(evidence.tokenLength).toBeGreaterThan(100);
  expect(evidence.response?.status).toBe('APP_CHECK_VERIFIED');
  expect(evidence.response?.appId).toBe(config.appId);
  expect(String(evidence.response?.nonceHash || '')).toMatch(/^[a-f0-9]{64}$/);

  const outputPath = path.resolve('launch_package/artifacts/clean-browser-appcheck-evidence.json');
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    status: 'passed',
    source: 'clean-production-browser-real-recaptcha-appcheck',
    projectId: config.projectId,
    appId: config.appId,
    repository: String(process.env.GITHUB_REPOSITORY || ''),
    commitSha: String(process.env.GITHUB_SHA || ''),
    workflowRunId: String(process.env.GITHUB_RUN_ID || ''),
    workflowRunAttempt: String(process.env.GITHUB_RUN_ATTEMPT || ''),
    baseUrl: String(process.env.E2E_BASE_URL || ''),
    debugTokenPresent: evidence.debugTokenPresent,
    appCheckTokenObtained: evidence.tokenLength > 100,
    protectedCallableVerified: evidence.response?.status === 'APP_CHECK_VERIFIED',
    verifiedAppId: evidence.response?.appId,
    nonceHash: evidence.response?.nonceHash,
    verifiedAt: evidence.response?.verifiedAt || new Date().toISOString(),
    sensitiveTokenExcluded: true,
    hardLaunchClaim: false,
  }, null, 2)}\n`, { mode: 0o600 });
});
