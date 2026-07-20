import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  mergeAuthorizedDomains,
  REQUIRED_ADMIN_MFA_DOMAINS,
} from '../../scripts/ensure-admin-mfa-authorized-domains.mjs';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Admin MFA recovery workflow is protected and does not deploy the full production stack', async () => {
  const workflow = await read('.github/workflows/admin-mfa-recovery-deploy.yml');
  assert.match(workflow, /name: RECOVERY - Deploy Admin MFA Enrollment/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /DEPLOY_ADMIN_MFA_RECOVERY/);
  assert.match(workflow, /RESTORE_ADMIN_MFA_ENROLLMENT_UI/);
  assert.match(workflow, /AUTHORIZED_FOUNDER_ACTORS/);
  assert.match(workflow, /AUTHORIZED_FOUNDER_EMAILS/);
  assert.match(workflow, /google-github-actions\/auth@v2/);
  assert.match(workflow, /hosting:admin,functions:registerAdminSecuritySession,functions:getAdminSecurityProfile,functions:revokeAdminSessions,functions:lockOwnAdminAccount,functions:finalizeOwnAdminMfaRecovery/);
  assert.doesNotMatch(workflow, /--only ['"]functions,hosting,firestore/);
  assert.doesNotMatch(workflow, /firestore:rules|firestore:indexes|storage:rules|hosting:app/);
  assert.match(workflow, /mfaGateBypassed: false/);
  assert.match(workflow, /hardLaunchClaim: false/);
});

test('Admin MFA recovery verifies the profile route, enrollment card, Phone Auth and live entrypoint', async () => {
  const workflow = await read('.github/workflows/admin-mfa-recovery-deploy.yml');
  assert.match(workflow, /path=\"\/profile\"/);
  assert.match(workflow, /AdminMfaEnrollmentCard/);
  assert.match(workflow, /ensure-admin-mfa-authorized-domains\.mjs/);
  assert.match(workflow, /verify-firebase-phone-auth-production\.mjs/);
  assert.match(workflow, /bin-group-admin-panel\.web\.app\/profile\?mfa=enroll/);
  assert.match(workflow, /cache-control:.*no-store/);
});

test('authorized-domain repair preserves existing domains and adds both Admin Hosting domains', () => {
  assert.deepEqual(REQUIRED_ADMIN_MFA_DOMAINS, [
    'bin-group-57c60.web.app',
    'bin-group-57c60.firebaseapp.com',
    'bin-group-admin-panel.web.app',
    'bin-group-admin-panel.firebaseapp.com',
  ]);
  const merged = mergeAuthorizedDomains([
    'example.com',
    'BIN-GROUP-57C60.WEB.APP',
    'example.com',
  ]);
  assert.deepEqual(merged, [
    'example.com',
    'bin-group-57c60.web.app',
    'bin-group-57c60.firebaseapp.com',
    'bin-group-admin-panel.web.app',
    'bin-group-admin-panel.firebaseapp.com',
  ]);
});

test('authorized-domain repair changes only the Identity Toolkit authorizedDomains field', async () => {
  const source = await read('scripts/ensure-admin-mfa-authorized-domains.mjs');
  assert.match(source, /updateMask=authorizedDomains/);
  assert.match(source, /JSON\.stringify\(\{ authorizedDomains \}\)/);
  assert.doesNotMatch(source, /updateMask=.*(?:mfa|signIn|smsRegionConfig)/);
  assert.match(source, /hardLaunchClaim: false/);
  assert.match(source, /sensitiveValuesExcluded: true/);
});
