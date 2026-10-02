import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolvePublicAppCheckBuildEnv } from '../../scripts/resolve-public-appcheck-build-env.mjs';
import {
  findAppCheckDebugLeaks,
  scanProductionAppCheckBundle,
} from '../../scripts/verify-production-appcheck-bundle.mjs';

const firebaseSource = readFileSync('src/lib/firebase.ts', 'utf8');
const workflow = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');
const liveRoleSmokeWorkflow = readFileSync('.github/workflows/live-role-smoke.yml', 'utf8');
const ENTERPRISE_SITE_KEY = '6LenterprisePublicSiteKeyExample1234567890';
const LEGACY_SITE_KEY = '6LlegacyPublicV3SiteKeyExample12345678901';

test('public production source selects reCAPTCHA Enterprise and does not assign a debug token outside dev', () => {
  assert.match(firebaseSource, /import\.meta\.env\.VITE_APP_CHECK_SITE_KEY/);
  assert.match(firebaseSource, /import\.meta\.env\.VITE_APP_CHECK_PROVIDER/);
  assert.match(firebaseSource, /productionPublicWeb/);
  assert.match(firebaseSource, /firebaseConfig\.projectId === 'bin-group-57c60'/);
  assert.match(firebaseSource, /new ReCaptchaEnterpriseProvider\(appCheckSiteKey\)/);
  assert.match(firebaseSource, /new ReCaptchaV3Provider\(appCheckSiteKey\)/);
  assert.doesNotMatch(firebaseSource, /import\.meta as unknown as \{ env/);

  const devBlock = firebaseSource.slice(
    firebaseSource.indexOf('if (import.meta.env.DEV)'),
    firebaseSource.indexOf('const provider = webAppCheckProvider'),
  );
  assert.match(devBlock, /FIREBASE_APPCHECK_DEBUG_TOKEN = true/);
  assert.equal(
    firebaseSource.replace(devBlock, '').includes('FIREBASE_APPCHECK_DEBUG_TOKEN ='),
    false,
  );
});

test('production deploy workflow forces Enterprise and keeps the debug token out of the web build', () => {
  assert.match(workflow, /VITE_APP_CHECK_PROVIDER:\s*enterprise/);
  assert.match(workflow, /FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY:\s*\$\{\{\s*secrets\.FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY\s*\}\}/);
  const buildSteps = [...workflow.matchAll(/- name: Build unified public app[\s\S]*?\n\s*npm run build/g)].map((match) => match[0]);
  assert.equal(buildSteps.length, 2);
  for (const step of buildSteps) {
    assert.match(step, /unset VITE_FIREBASE_APPCHECK_DEBUG_TOKEN/);
    assert.match(step, /unset FIREBASE_APPCHECK_DEBUG_TOKEN/);
  }
});

test('live-role-smoke expects Enterprise App Check when verifying the hosted production bundle', () => {
  assert.match(liveRoleSmokeWorkflow, /VITE_APP_CHECK_PROVIDER:\s*enterprise/);
  assert.match(
    liveRoleSmokeWorkflow,
    /FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY:\s*\$\{\{\s*secrets\.FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY\s*\}\}/,
  );
  assert.match(
    liveRoleSmokeWorkflow,
    /REACT_APP_APP_CHECK_SITE_KEY:\s*\$\{\{\s*secrets\.FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY\s*\}\}/,
  );
});

test('production deploy resolves the Enterprise site key and fails closed without one', () => {
  const resolved = resolvePublicAppCheckBuildEnv({
    mode: 'production',
    env: {
      GITHUB_WORKFLOW: 'Firebase Production Deploy',
      VITE_ENABLE_FIREBASE_APPCHECK: 'true',
      VITE_APP_CHECK_SITE_KEY: LEGACY_SITE_KEY,
      FIREBASE_APPCHECK_ENTERPRISE_SITE_KEY: ENTERPRISE_SITE_KEY,
      VITE_FIREBASE_APPCHECK_DEBUG_TOKEN: '123e4567-e89b-42d3-a456-426614174000',
    },
  });
  assert.deepEqual(resolved.failures, []);
  assert.equal(resolved.siteKey, ENTERPRISE_SITE_KEY);
  assert.equal(resolved.provider, 'enterprise');
  assert.equal(resolved.stripDebugToken, true);

  const missing = resolvePublicAppCheckBuildEnv({
    mode: 'production',
    env: {
      GITHUB_WORKFLOW: 'Firebase Production Deploy',
      VITE_ENABLE_FIREBASE_APPCHECK: 'true',
      VITE_APP_CHECK_SITE_KEY: LEGACY_SITE_KEY,
    },
  });
  assert.match(missing.failures.join('\n'), /no site key is present/);
  assert.equal(missing.siteKey, '');
});

test('validation placeholder and non-production builds keep their own site-key sources', () => {
  const validation = resolvePublicAppCheckBuildEnv({
    mode: 'production',
    env: {
      GITHUB_WORKFLOW: 'Firebase Production Deploy',
      VITE_ENABLE_FIREBASE_APPCHECK: 'true',
      VITE_APP_CHECK_SITE_KEY: LEGACY_SITE_KEY,
    },
    productionEnv: [
      'VITE_APP_CHECK_PROVIDER=enterprise',
      'VITE_APP_CHECK_SITE_KEY=BIN_GROUP_VALIDATION_ONLY_ENTERPRISE_SITE_KEY',
      'VITE_ENABLE_FIREBASE_APPCHECK=true',
    ].join('\n'),
  });
  assert.deepEqual(validation.failures, []);
  assert.equal(validation.siteKey, 'BIN_GROUP_VALIDATION_ONLY_ENTERPRISE_SITE_KEY');
  assert.equal(validation.provider, 'enterprise');

  const mobile = resolvePublicAppCheckBuildEnv({
    mode: 'production',
    env: {
      GITHUB_WORKFLOW: 'Android Store Release',
      VITE_ENABLE_FIREBASE_APPCHECK: 'true',
      VITE_APP_CHECK_SITE_KEY: LEGACY_SITE_KEY,
    },
  });
  assert.deepEqual(mobile.failures, []);
  assert.equal(mobile.siteKey, LEGACY_SITE_KEY);
  assert.equal(mobile.provider, 'v3');

  const poisoned = resolvePublicAppCheckBuildEnv({
    mode: 'production',
    env: { VITE_ENABLE_FIREBASE_APPCHECK: 'true', VITE_APP_CHECK_SITE_KEY: LEGACY_SITE_KEY },
    productionEnv: 'VITE_FIREBASE_APPCHECK_DEBUG_TOKEN=123e4567-e89b-42d3-a456-426614174000\n',
  });
  assert.match(poisoned.failures.join('\n'), /must not assign an App Check debug token/);
  assert.equal(poisoned.failures.join('\n').includes('123e4567'), false);
});

test('production bundle scan rejects a debug token or assignment and ignores a read', () => {
  assert.deepEqual(findAppCheckDebugLeaks('self.FIREBASE_APPCHECK_DEBUG_TOKEN'), []);
  assert.deepEqual(findAppCheckDebugLeaks("typeof globals.FIREBASE_APPCHECK_DEBUG_TOKEN !== 'string' && globals.FIREBASE_APPCHECK_DEBUG_TOKEN !== true"), []);
  assert.deepEqual(findAppCheckDebugLeaks("typeof globals.FIREBASE_APPCHECK_DEBUG_TOKEN === 'string'"), []);
  assert.deepEqual(
    findAppCheckDebugLeaks('VITE_FIREBASE_APPCHECK_DEBUG_TOKEN:"123e4567-e89b-42d3-a456-426614174000"'),
    ['VITE_FIREBASE_APPCHECK_DEBUG_TOKEN'],
  );
  assert.ok(findAppCheckDebugLeaks('self.FIREBASE_APPCHECK_DEBUG_TOKEN=true').includes('FIREBASE_APPCHECK_DEBUG_TOKEN assignment'));
  assert.ok(findAppCheckDebugLeaks('["FIREBASE_APPCHECK_DEBUG_TOKEN"]=!0').includes('FIREBASE_APPCHECK_DEBUG_TOKEN assignment'));

  const directory = mkdtempSync(path.join(tmpdir(), 'appcheck-bundle-'));
  try {
    mkdirSync(path.join(directory, 'assets'));
    writeFileSync(path.join(directory, 'assets', 'index.js'), 'initializeAppCheck(ReCaptchaEnterpriseProvider)');
    assert.deepEqual(scanProductionAppCheckBundle(directory), []);
    writeFileSync(
      path.join(directory, 'assets', 'leaky.js'),
      'FIREBASE_APPCHECK_DEBUG_TOKEN="123e4567-e89b-42d3-a456-426614174000"',
    );
    const leaks = scanProductionAppCheckBundle(directory);
    assert.equal(leaks.length, 1);
    assert.equal(leaks[0].reasons.includes('FIREBASE_APPCHECK_DEBUG_TOKEN assignment'), true);
    assert.equal(JSON.stringify(leaks).includes('123e4567'), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
