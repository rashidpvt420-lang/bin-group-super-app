import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const securityGuide = readFileSync('SECURITY_REGISTRATION.md', 'utf8');
const adminFirebase = readFileSync('apps/admin-panel/src/lib/firebase.ts', 'utf8');
const productionWorkflow = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');
const firebaseRc = readFileSync('.firebaserc', 'utf8');

const canonical = Object.freeze({
  projectId: 'bin-group-57c60',
  projectNumber: '123413252227',
  adminAppId: '1:123413252227:web:285cb53bc26626d699f3b6',
  adminHost: 'bin-group-admin-panel.web.app',
  publicHost: 'bin-group-57c60.web.app',
  authDomain: 'bin-group-57c60.firebaseapp.com',
});

const staleIdentifiers = [
  '1:716065348125:web:676fa520a293b858c104f4',
  '1:716468579332:web:a15577fd9a6c53b00360ba',
  'bin-group-global',
];

test('production security guide names the exact Admin Firebase identity and hosts', () => {
  for (const value of Object.values(canonical)) {
    assert.ok(securityGuide.includes(value), `SECURITY_REGISTRATION.md must include ${value}`);
  }

  for (const stale of staleIdentifiers) {
    assert.equal(securityGuide.includes(stale), false, `security guide must not contain stale identifier ${stale}`);
  }
});

test('security guide does not instruct operators to commit App Check credentials', () => {
  assert.match(securityGuide, /Do not paste a secret key into source code/i);
  assert.match(securityGuide, /Do not commit a debug token/i);
  assert.doesNotMatch(securityGuide, /ReCaptchaV3Provider\(['"]YOUR_ACTUAL/i);
});

test('Admin source and protected workflow agree on the production Firebase app', () => {
  assert.ok(adminFirebase.includes(`const ADMIN_FIREBASE_APP_ID = '${canonical.adminAppId}'`));
  assert.ok(adminFirebase.includes(`'${canonical.projectId}'`));
  assert.ok(adminFirebase.includes(`'${canonical.authDomain}'`));
  assert.match(adminFirebase, /ReCaptchaEnterpriseProvider/);
  assert.doesNotMatch(adminFirebase, /new\s+ReCaptchaV3Provider\s*\(/);
  assert.ok(adminFirebase.includes('process.env.REACT_APP_APP_CHECK_SITE_KEY'));
  assert.equal(adminFirebase.includes('process.env.VITE_FIREBASE_APPCHECK_SITE_KEY'), false);

  assert.ok(productionWorkflow.includes(`GCP_PROJECT_ID || '${canonical.projectId}'`));
  assert.ok(productionWorkflow.includes(`https://${canonical.adminHost}`));
  assert.ok(productionWorkflow.includes('VITE_APP_CHECK_SITE_KEY'));
  assert.ok(productionWorkflow.includes('REACT_APP_ENABLE_FIREBASE_APPCHECK'));
});

test('Firebase Hosting targets remain bound to the production project and Admin site', () => {
  const parsed = JSON.parse(firebaseRc);
  assert.equal(parsed.projects.default, canonical.projectId);
  assert.deepEqual(parsed.targets[canonical.projectId].hosting.app, [canonical.projectId]);
  assert.deepEqual(parsed.targets[canonical.projectId].hosting.admin, ['bin-group-admin-panel']);
});
