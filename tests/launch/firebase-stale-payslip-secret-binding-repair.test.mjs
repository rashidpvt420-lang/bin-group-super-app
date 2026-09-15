import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isProtectedProductionSecretReconciliationContext,
  reconcileRetiredPayslipSecretBindings,
} from '../../scripts/verify-firebase-deployed-function-secret-contract.mjs';

const verifier = readFileSync('scripts/verify-firebase-deployed-function-secret-contract.mjs', 'utf8');
const workflow = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');
const functionsIndex = readFileSync('functions/index.ts', 'utf8');
const canonicalProjectId = 'bin-group-57c60';

function serviceWithSecretBindings(names) {
  return {
    spec: {
      template: {
        spec: {
          containers: [{
            env: names.map((name, index) => ({
              name,
              valueFrom: {
                secretKeyRef: {
                  name,
                  key: String(index + 1),
                },
              },
            })),
          }],
        },
      },
    },
  };
}

test('stale payslip repair is enabled only in the exact protected production deploy job', () => {
  const canonical = {
    GITHUB_ACTIONS: 'true',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_WORKFLOW: 'Firebase Production Deploy',
    GITHUB_JOB: 'deploy-firebase-production-stack',
    DEPLOYMENT_ENVIRONMENT: 'production',
    GCP_PROJECT_ID: canonicalProjectId,
  };
  assert.equal(isProtectedProductionSecretReconciliationContext(canonical), true);
  for (const [key, value] of [
    ['GITHUB_REF', 'refs/heads/feature'],
    ['GITHUB_WORKFLOW', 'PR Validation'],
    ['GITHUB_JOB', 'validate-production-build'],
    ['DEPLOYMENT_ENVIRONMENT', 'staging'],
    ['GCP_PROJECT_ID', 'other-project'],
  ]) {
    assert.equal(
      isProtectedProductionSecretReconciliationContext({ ...canonical, [key]: value }),
      false,
      `${key} must fail closed outside the canonical production context`,
    );
  }
});

test('payslip repair removes only obsolete SMTP secret bindings and verifies the result', () => {
  const calls = [];
  const responses = [
    { status: 0, stdout: JSON.stringify(serviceWithSecretBindings(['SMTP_HOST', 'SMTP_PASS', 'SMTP_USER', 'UNRELATED_SECRET'])) },
    { status: 0, stdout: '' },
    { status: 0, stdout: JSON.stringify(serviceWithSecretBindings(['UNRELATED_SECRET'])) },
  ];
  const spawnSyncImpl = (command, args) => {
    calls.push({ command, args });
    return responses.shift();
  };

  const result = reconcileRetiredPayslipSecretBindings({
    projectId: canonicalProjectId,
    spawnSyncImpl,
    discoverEndpointSecretNames: () => [],
  });

  assert.equal(result.status, 'passed');
  assert.equal(result.action, 'removed-obsolete-bindings');
  assert.deepEqual(result.removedBindingNames, ['SMTP_HOST', 'SMTP_PASS', 'SMTP_USER']);
  assert.equal(result.secretValuesExcluded, true);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].args.slice(0, 4), ['run', 'services', 'describe', 'generateandemailpayslip']);
  assert.deepEqual(calls[1].args.slice(0, 4), ['run', 'services', 'update', 'generateandemailpayslip']);
  assert.ok(calls[1].args.includes('--region'));
  assert.ok(calls[1].args.includes('europe-west3'));
  assert.ok(calls[1].args.includes('--project'));
  assert.ok(calls[1].args.includes(canonicalProjectId));
  assert.ok(calls[1].args.includes('--remove-secrets=SMTP_HOST,SMTP_PASS,SMTP_USER'));
  assert.equal(calls[1].args.some((arg) => String(arg).includes('UNRELATED_SECRET')), false);
});

test('payslip repair is a no-op when no retired binding exists', () => {
  const calls = [];
  const result = reconcileRetiredPayslipSecretBindings({
    projectId: canonicalProjectId,
    spawnSyncImpl: (command, args) => {
      calls.push({ command, args });
      return { status: 0, stdout: JSON.stringify(serviceWithSecretBindings(['UNRELATED_SECRET'])) };
    },
    discoverEndpointSecretNames: () => [],
  });
  assert.equal(result.action, 'no-op');
  assert.deepEqual(result.removedBindingNames, []);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args[2], 'describe');
});

test('payslip repair refuses to remove a secret still required by compiled endpoint metadata', () => {
  let gcloudCalled = false;
  assert.throws(
    () => reconcileRetiredPayslipSecretBindings({
      projectId: canonicalProjectId,
      discoverEndpointSecretNames: () => ['SMTP_PASS'],
      spawnSyncImpl: () => {
        gcloudCalled = true;
        return { status: 0, stdout: '{}' };
      },
    }),
    /still required by current compiled code/,
  );
  assert.equal(gcloudCalled, false);
});

test('payslip repair refuses every non-canonical project, region, service, or endpoint', () => {
  for (const override of [
    { projectId: 'wrong-project' },
    { region: 'us-central1' },
    { serviceName: 'other-service' },
    { endpointName: 'otherEndpoint' },
  ]) {
    assert.throws(
      () => reconcileRetiredPayslipSecretBindings({
        projectId: canonicalProjectId,
        ...override,
        discoverEndpointSecretNames: () => [],
        spawnSyncImpl: () => ({ status: 0, stdout: '{}' }),
      }),
      /canonical payslip production target/,
    );
  }
});

test('repair never re-enables or accesses retired secret versions and runs before Firebase deploy', () => {
  assert.match(verifier, /gcloud['"], \[\s*['"]run['"], ['"]services['"], ['"]update['"]/s);
  assert.match(verifier, /--remove-secrets=/);
  assert.doesNotMatch(verifier, /versions\s+(?:enable|access)|secrets\s+versions\s+(?:enable|access)|--update-secrets=.*SMTP_PASS|--set-secrets=.*SMTP_PASS/);

  const gcloudSetup = workflow.indexOf('Set up Google Cloud CLI for protected Secret Manager checks');
  const contractCheck = workflow.indexOf('Verify compiled Firebase Function secret contract');
  const firebaseDeploy = workflow.indexOf('Deploy and verify Firebase production stack');
  assert.ok(gcloudSetup >= 0 && contractCheck > gcloudSetup, 'gcloud authentication/setup must precede reconciliation');
  assert.ok(firebaseDeploy > contractCheck, 'stale binding reconciliation must happen before Firebase production deployment');
});

test('current payslip endpoint source does not declare legacy SMTP secrets', () => {
  const start = functionsIndex.indexOf('export const generateAndEmailPayslip');
  assert.ok(start >= 0, 'generateAndEmailPayslip export must exist');
  const nextExport = functionsIndex.indexOf('\nexport const ', start + 1);
  const payslipSource = functionsIndex.slice(start, nextExport > start ? nextExport : functionsIndex.length);
  assert.doesNotMatch(payslipSource, /SMTP_HOST|SMTP_USER|SMTP_PASS|secrets\s*:/);
});
