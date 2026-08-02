import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  adminMfaBootstrapWorkflowState,
  normalizeAdminMfaBootstrapWorkflowEvent,
  productionWorkflowEnvSummary,
  validateProductionWorkflowEnv,
} from '../../scripts/verify-production-workflow-env.mjs';

const marker = 'ADMIN_MFA_BOOTSTRAP_HOSTING';

function validEnv() {
  return {
    GCP_PROJECT_ID: 'bin-group-57c60',
    GCP_WORKLOAD_IDENTITY_PROVIDER: 'projects/123413252227/locations/global/workloadIdentityPools/github/providers/bin-group',
    GCP_SERVICE_ACCOUNT: 'github-production@bin-group-57c60.iam.gserviceaccount.com',
    HARD_LAUNCH_APPROVAL_HMAC_KEY: 'h'.repeat(48),
    AUTHORIZED_FOUNDER_ACTORS: 'rashidpvt420-lang',
    AUTHORIZED_FOUNDER_EMAILS: 'ceo@bin-groups.com',
    PRODUCTION_APPROVED_BY: 'ceo@bin-groups.com',
    VITE_FIREBASE_API_KEY: `AIza${'A'.repeat(35)}`,
    VITE_FIREBASE_APP_ID: '1:123413252227:web:285cb53bc26626d699f3b6',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '123413252227',
    VITE_FIREBASE_VAPID_KEY: `B${'C'.repeat(86)}`,
    VITE_GOOGLE_MAPS_API_KEY: `AIza${'M'.repeat(35)}`,
    VITE_APP_CHECK_SITE_KEY: `6L${'R'.repeat(38)}`,
    VITE_ENABLE_FIREBASE_APPCHECK: 'true',
    VITE_FIREBASE_APPCHECK_DEBUG_TOKEN: '123e4567-e89b-42d3-a456-426614174000',
    E2E_BASE_URL: 'https://bin-group-57c60.web.app',
    E2E_ADMIN_BASE_URL: 'https://bin-group-admin-panel.web.app',
    E2E_ADMIN_EMAIL: 'admin-e2e@bin-groups.com',
    E2E_ADMIN_PASSWORD: 'admin-password',
    E2E_FOUNDER_EMAIL: 'ceo@bin-groups.com',
    E2E_FOUNDER_PASSWORD: 'founder-password',
    E2E_FOUNDER_TOTP_SECRET: '',
    E2E_FOUNDER_REAL_MFA_CODE: '',
    E2E_OWNER_MAILBOX_EMAIL: 'owner-e2e@bin-groups.com',
    E2E_OWNER_PASSWORD: 'owner-password',
    E2E_TENANT_EMAIL: 'tenant-e2e@bin-groups.com',
    E2E_TENANT_PASSWORD: 'tenant-password',
    E2E_TECHNICIAN_EMAIL: 'technician-e2e@bin-groups.com',
    E2E_TECHNICIAN_PASSWORD: 'technician-password',
    E2E_BROKER_MAILBOX_EMAIL: 'broker-e2e@bin-groups.com',
    E2E_BROKER_PASSWORD: 'broker-password',
    E2E_TECHNICIAN_B_EMAIL: '',
    E2E_TECHNICIAN_B_PASSWORD: '',
    LAUNCH_MODE: 'bank-pilot',
    RUN_PUBLIC_RELEASE_GATE: 'false',
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: 'a'.repeat(40),
  };
}

function withDispatchEvent(t, env, incidentEvidenceRefs = marker) {
  const directory = mkdtempSync(path.join(tmpdir(), 'admin-mfa-bootstrap-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const eventPath = path.join(directory, 'event.json');
  writeFileSync(eventPath, JSON.stringify({
    inputs: {
      launch_mode: env.LAUNCH_MODE,
      run_public_release_gate: env.RUN_PUBLIC_RELEASE_GATE,
      deployment_payload_json: JSON.stringify({
        incident_evidence_refs: incidentEvidenceRefs,
      }),
    },
  }));
  env.GITHUB_EVENT_PATH = eventPath;
  return eventPath;
}

test('exact protected bank-pilot bootstrap authorizes missing Founder automation code and normalizes the nested marker', (t) => {
  const env = validEnv();
  const eventPath = withDispatchEvent(t, env);

  assert.deepEqual(validateProductionWorkflowEnv(env), []);
  assert.deepEqual(adminMfaBootstrapWorkflowState(env), {
    marker,
    requested: true,
    authorized: true,
    eventPath,
    dispatchError: null,
  });

  const before = productionWorkflowEnvSummary(env);
  assert.equal(before.founderMfaConfigured, false);
  assert.equal(before.adminMfaBootstrapRequested, true);
  assert.equal(before.adminMfaBootstrapAuthorized, true);

  assert.equal(normalizeAdminMfaBootstrapWorkflowEvent(env), true);
  const normalized = JSON.parse(readFileSync(eventPath, 'utf8'));
  assert.equal(normalized.inputs.incident_evidence_refs, marker);
  assert.equal(JSON.parse(normalized.inputs.deployment_payload_json).incident_evidence_refs, marker);
  assert.equal(normalizeAdminMfaBootstrapWorkflowEvent(env), false);
});

test('bootstrap marker never relaxes Founder MFA outside exact-main protected bank-pilot scope', (t) => {
  const cases = [
    ['public mode', { LAUNCH_MODE: 'public', RUN_PUBLIC_RELEASE_GATE: 'true' }],
    ['public gate enabled', { RUN_PUBLIC_RELEASE_GATE: 'true' }],
    ['non-dispatch event', { GITHUB_EVENT_NAME: 'pull_request' }],
    ['non-main ref', { GITHUB_REF: 'refs/heads/fix/not-main' }],
    ['invalid SHA', { GITHUB_SHA: 'abc' }],
    ['outside Actions', { GITHUB_ACTIONS: 'false' }],
  ];

  for (const [name, overrides] of cases) {
    const env = { ...validEnv(), ...overrides };
    withDispatchEvent(t, env);
    const failures = validateProductionWorkflowEnv(env).join('\n');
    assert.match(failures, /Admin MFA bootstrap is allowed only/, name);
    assert.match(failures, /valid E2E_FOUNDER_TOTP_SECRET or six-digit E2E_FOUNDER_REAL_MFA_CODE/, name);
    assert.equal(normalizeAdminMfaBootstrapWorkflowEvent(env), false, name);
  }
});

test('normal bank-pilot deployment without the exact marker still requires real Founder MFA proof', (t) => {
  const env = validEnv();
  withDispatchEvent(t, env, 'https://github.com/rashidpvt420-lang/bin-group-super-app/issues/434');

  const failures = validateProductionWorkflowEnv(env).join('\n');
  assert.doesNotMatch(failures, /Admin MFA bootstrap is allowed only/);
  assert.match(failures, /valid E2E_FOUNDER_TOTP_SECRET or six-digit E2E_FOUNDER_REAL_MFA_CODE/);
  assert.equal(adminMfaBootstrapWorkflowState(env).requested, false);
});
