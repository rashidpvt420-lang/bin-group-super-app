import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const diagnosticsSource = read('src/technician/utils/technicianAccessDiagnostics.ts');
const registrationComponent = read('src/technician/components/TechnicianInstallationRegistration.tsx');
const registrationClient = read('src/technician/utils/technicianInstallationBinding.ts');
const jobsPage = read('src/technician/pages/TechnicianJobsPage.tsx');
const backend = read('functions/technicianInstallationBinding.ts');

function load(source) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', output)(module.exports, module);
  return module.exports;
}

const d = load(diagnosticsSource);
const functionsError = (code, details) => Object.assign(new Error(code), { code, details });

test('01 the exact production error (functions/permission-denied, no reason) is not reported as a Play Integrity failure', () => {
  const failure = d.classifyTechnicianRegistrationFailure(functionsError('functions/permission-denied'));
  assert.equal(failure.kind, 'ACCOUNT_REFUSED');
  assert.equal(failure.diagnostic, 'FUNCTIONS_PERMISSION-DENIED');
  assert.doesNotMatch(failure.message, /could not be verified through Google Play Integrity/);
  assert.match(failure.message, /Diagnostic: FUNCTIONS_PERMISSION-DENIED$/);
});

test('02 server account reasons classify as ACCOUNT_INACTIVE', () => {
  for (const reason of ['TECHNICIAN_ACCOUNT_DISABLED_OR_SUSPENDED', 'TECHNICIAN_PROFILE_SUSPENDED', 'TECHNICIAN_ROLE_REQUIRED']) {
    const failure = d.classifyTechnicianRegistrationFailure(functionsError('functions/permission-denied', { reason }));
    assert.equal(failure.kind, 'ACCOUNT_INACTIVE', reason);
    assert.equal(failure.diagnostic, `FUNCTIONS_PERMISSION-DENIED__${reason}`);
    assert.doesNotMatch(failure.message, /Google Play Integrity/);
  }
  const local = d.classifyTechnicianRegistrationFailure(functionsError(d.TECHNICIAN_ACCOUNT_INACTIVE_CODE));
  assert.equal(local.kind, 'ACCOUNT_INACTIVE');
});

test('03 genuine integrity failures keep the Play Integrity message', () => {
  const cases = [
    functionsError('functions/permission-denied', { reason: 'APP_CHECK_APP_ID_MISMATCH' }),
    functionsError('functions/unauthenticated'),
    functionsError('INSTALLER_NOT_GOOGLE_PLAY'),
    functionsError('PLAY_SIGNING_IDENTITY_MISMATCH'),
    functionsError('ATTEST403__I_OK__S_OK__V13'),
    functionsError('app-check/unavailable'),
  ];
  for (const error of cases) {
    const failure = d.classifyTechnicianRegistrationFailure(error);
    assert.equal(failure.kind, 'INTEGRITY', error.code);
    assert.match(failure.message, /could not be verified through Google Play Integrity/);
  }
});

test('04 installation rotation keeps the controlled re-registration message', () => {
  const failure = d.classifyTechnicianRegistrationFailure(functionsError('functions/failed-precondition', { reason: 'REJECTED_ROTATION' }));
  assert.equal(failure.kind, 'DEVICE_ROTATION');
  assert.match(failure.message, /bound to another installation/);
});

test('05 suspended claims are detected; absent or false claims are not', () => {
  assert.equal(d.isTechnicianAccountInactiveClaims({ role: 'technician', suspended: true }), true);
  assert.equal(d.isTechnicianAccountInactiveClaims({ role: 'technician', suspended: false }), false);
  assert.equal(d.isTechnicianAccountInactiveClaims({ role: 'technician' }), false);
  assert.equal(d.isTechnicianAccountInactiveClaims(null), false);
});

test('06 jobs listener permission-denied is an account-access message, not a connection message', () => {
  const denied = d.classifyTechnicianJobsLoadError({ code: 'permission-denied' });
  assert.equal(denied.kind, 'ACCOUNT_ACCESS');
  assert.doesNotMatch(denied.fallback, /Check your connection/);
  assert.equal(d.classifyTechnicianJobsLoadError({ code: 'failed-precondition' }).kind, 'QUERY_INDEX');
  const offline = d.classifyTechnicianJobsLoadError({ code: 'unavailable' });
  assert.equal(offline.kind, 'CONNECTION');
  assert.equal(offline.key, 'tech.jobs.load_error');
});

test('07 registration checks the refreshed suspended claim before App Check refresh and the callable', () => {
  const authRefresh = registrationClient.indexOf('currentUser.getIdToken(true)');
  const claimCheck = registrationClient.indexOf('isTechnicianAccountInactiveClaims(claims)');
  const nativeRefresh = registrationClient.indexOf('forceNativeAppCheckRefresh()');
  const callable = registrationClient.indexOf("httpsCallable(functions, 'registerTechnicianDevice')");
  assert.ok(authRefresh >= 0 && claimCheck > authRefresh && nativeRefresh > claimCheck && callable > nativeRefresh);
});

test('08 UI uses the classifiers and the server tags every permission-denied gate', () => {
  assert.match(registrationComponent, /classifyTechnicianRegistrationFailure\(error\)/);
  assert.match(jobsPage, /classifyTechnicianJobsLoadError\(error\)/);
  for (const reason of ['APP_CHECK_APP_ID_MISMATCH', 'ACCOUNT_DISABLED_OR_SUSPENDED', 'ROLE_REQUIRED', 'PROFILE_SUSPENDED']) {
    assert.ok(backend.includes(`TECHNICIAN_REGISTRATION_DENIAL.${reason}`), `backend tags ${reason}`);
  }
  assert.match(backend, /enforceAppCheck: true/);
});
