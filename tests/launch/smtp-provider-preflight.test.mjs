import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  classifySmtpProviderFailure,
  runSmtpProviderPreflight,
} from '../../scripts/lib/smtp-provider-preflight.mjs';

const predeploy = readFileSync('scripts/predeploy-approval-gate.mjs', 'utf8');
const source = readFileSync('scripts/lib/smtp-provider-preflight.mjs', 'utf8');

const secrets = new Map([
  ['SMTP_USER', 'apikey'],
  ['SMTP_PASS', 'p'.repeat(64)],
]);

test('SMTP preflight authenticates without sending an email', async () => {
  let calls = 0;
  const result = await runSmtpProviderPreflight({
    env: {
      GCP_PROJECT_ID: 'bin-group-57c60',
      SMTP_HOST: 'smtp.sendgrid.net',
      SMTP_PORT: '465',
    },
    resolveSecret: (name) => secrets.get(name) || '',
    verifySmtp: async ({ user, pass }) => {
      calls += 1;
      assert.equal(user, 'apikey');
      assert.equal(pass.length, 64);
    },
  });

  assert.equal(calls, 1);
  assert.equal(result.authVerified, true);
  assert.equal(result.sendAttempted, false);
  assert.equal(result.secretValuesLogged, false);
  assert.equal(result.providerHost, 'smtp.sendgrid.net');
  assert.equal(result.providerPort, 465);
});

test('SMTP preflight fails closed on the exact maximum-credits provider error from production run 31857473860', async () => {
  await assert.rejects(
    runSmtpProviderPreflight({
      env: { GCP_PROJECT_ID: 'bin-group-57c60' },
      resolveSecret: (name) => secrets.get(name) || '',
      verifySmtp: async () => {
        throw new Error('Invalid login: 451 Authentication failed: Maximum credits exceeded');
      },
    }),
    /SMTP provider capacity is exhausted\. Restore outbound email credits\/quota before production deployment\./,
  );
});

test('SMTP failure diagnostics distinguish auth, capacity and connectivity without echoing provider details', () => {
  assert.match(
    classifySmtpProviderFailure(new Error('451 Authentication failed: Maximum credits exceeded')),
    /capacity is exhausted/,
  );
  assert.match(
    classifySmtpProviderFailure(new Error('535 5.7.8 Authentication failed for sensitive-user')),
    /authentication failed/,
  );
  assert.doesNotMatch(
    classifySmtpProviderFailure(new Error('535 5.7.8 Authentication failed for sensitive-user')),
    /sensitive-user/,
  );
  assert.match(
    classifySmtpProviderFailure(new Error('ETIMEDOUT while connecting to provider.example')),
    /connectivity verification failed/,
  );
});

test('production predeploy runs the SMTP readiness probe before authorization can succeed', () => {
  const smtpCall = predeploy.indexOf('await runSmtpProviderPreflight()');
  const approvalCall = predeploy.indexOf('const result = runPredeployApprovalGate()');
  assert.ok(smtpCall >= 0 && approvalCall > smtpCall);
});

test('SMTP readiness source never sends mail, logs credentials, or depends on root-level hoisting', () => {
  assert.doesNotMatch(source, /sendMail\s*\(/);
  assert.doesNotMatch(source, /console\.(?:log|error|warn)/);
  assert.match(source, /createRequire\(new URL\('\.\.\/\.\.\/functions\/package\.json'/);
  assert.match(source, /requireFunctionsDependency\('nodemailer'\)/);
  assert.match(source, /transport\.verify\(\)/);
  assert.match(source, /sendAttempted:\s*false/);
  assert.match(source, /secretValuesLogged:\s*false/);
});
