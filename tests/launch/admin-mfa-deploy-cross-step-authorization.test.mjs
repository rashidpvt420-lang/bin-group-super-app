import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { adminMfaBootstrapWorkflowState } from '../../scripts/verify-production-workflow-env.mjs';

test('deployment and domain repair recompute bounded bootstrap from original protected dispatch', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'bin-finance-bootstrap-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'event.json');
  const sha = 'a'.repeat(40);
  const refs = 'https://github.com/rashidpvt420-lang/bin-group-super-app/issues/434,https://github.com/rashidpvt420-lang/bin-group-super-app/pull/1738,GITHUB_PRODUCTION_RUN_37955986990';
  const payload = {
    incident_attestation: 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS',
    incident_active_json: '[]', incident_requires_rollback: 'false',
    incident_rollback_reason: '', incident_last_deployment_failed: 'true',
    incident_last_deployment_failed_at: '2026-10-09T16:18:31Z',
    incident_evidence_refs: refs, authorization_source_pr: '1738',
    hard_clearance_run_id: '', stripe_live_checkout_session_id: '', stripe_live_webhook_event_id: '',
  };
  const inputs = {
    confirmation: 'DEPLOY_PRODUCTION_BIN_GROUP_57C60',
    hard_launch_confirmation: 'AUTHORIZE_HARD_PUBLIC_LAUNCH_BIN_GROUP',
    expected_commit_sha: sha, authorization_actor: 'rashidpvt420-lang',
    founder_email: 'ceo@bin-groups.com', launch_mode: 'bank-pilot',
    payment_policy: 'phase1-manual', run_public_release_gate: 'false',
    deployment_payload_json: JSON.stringify(payload),
  };
  writeFileSync(file, JSON.stringify({inputs}));
  const env = {
    GITHUB_EVENT_PATH: file, GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sha,
    LAUNCH_MODE: 'bank-pilot', PAYMENT_POLICY: 'phase1-manual',
    RUN_PUBLIC_RELEASE_GATE: 'false',
    E2E_FOUNDER_TOTP_SECRET: 'JBSWY3DPEHPK3PXP',
    E2E_FINANCE_APPROVER_EMAIL: 'finance.admin@bin-groups.com',
    E2E_FINANCE_APPROVER_PASSWORD: 'nonsecret-fixture',
    E2E_FINANCE_APPROVER_TOTP_SECRET: '',
  };
  const verified = adminMfaBootstrapWorkflowState(env);
  assert.equal(verified.authorized, true);
  assert.equal(verified.requestSource, 'protected-finance-admin-bootstrap');
  const deployed = readFileSync(new URL('../../scripts/deploy-firebase-production.mjs', import.meta.url), 'utf8');
  const domains = readFileSync(new URL('../../scripts/verify-firebase-production-secrets.mjs', import.meta.url), 'utf8');
  assert.match(deployed, /adminBootstrapState = adminMfaBootstrapWorkflowState\(process\.env\)/);
  assert.match(deployed, /adminBootstrapState\.authorized/);
  assert.match(domains, /bootstrapState = adminMfaBootstrapWorkflowState\(env\)/);
  assert.match(domains, /!bootstrapState\.authorized/);
  assert.ok(deployed.indexOf("if (adminBootstrapRequested) {") < deployed.indexOf('adminMfaEvidence = await verifyAdminMfaProduction'), 'bounded bootstrap must precede real MFA check');
  assert.equal(adminMfaBootstrapWorkflowState({...env, RUN_PUBLIC_RELEASE_GATE: 'true'}).authorized, false);
  payload.incident_active_json = '[{"id":"active"}]';
  writeFileSync(file, JSON.stringify({inputs: {...inputs, deployment_payload_json: JSON.stringify(payload)}}));
  assert.equal(adminMfaBootstrapWorkflowState(env).authorized, false);
});
