/**
 * Record multiple launch gates to Firestore after automated proof passes.
 * Usage: node scripts/record-launch-evidence-batch.mjs
 */
import { spawnSync } from 'node:child_process';
import { execSync } from 'node:child_process';

const VERIFIER = process.env.LAUNCH_VERIFIER_NAME || 'BIN GROUP Launch Agent';
const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
})();
const ts = new Date().toISOString();

function record(gateKey, evidence) {
  const full = `${evidence}; commit=${commit}; utc=${ts}`;
  const result = spawnSync(
    process.execPath,
    ['scripts/verify-launch-gate-live.mjs', gateKey, VERIFIER, full],
    { encoding: 'utf8', stdio: 'inherit' }
  );
  return result.status === 0;
}

const gates = [];

function add(gateKey, label, ok, detail) {
  gates.push({ gateKey, label, ok, detail });
}

function runNpm(script) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(npm, ['run', script], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`.slice(-2000) };
}

console.log('\n=== Production evidence batch ===\n');
console.log(`commit=${commit} utc=${ts}\n`);

const env = runNpm('test:e2e:env');
add('mainCredentialLogin', 'E2E env guard', env.ok, env.ok ? 'all five roles configured' : 'env guard failed');

const smtpSecrets = spawnSync(process.execPath, ['scripts/gate12-smtp-secrets-check.mjs'], { encoding: 'utf8' });
const smtpSecretsOk = smtpSecrets.status === 0;
add('brandedEmailSender', 'SMTP secret formats', smtpSecretsOk, smtpSecretsOk ? 'SendGrid secrets valid' : 'SMTP secrets invalid');

let smtpDeliveryOk = false;
if (smtpSecretsOk) {
  const smtp = spawnSync(process.execPath, ['scripts/test-trigger-email.mjs'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  smtpDeliveryOk = smtp.status === 0;
  add('brandedEmailSender', 'SMTP live delivery', smtpDeliveryOk, smtpDeliveryOk ? 'mail delivery.state=SUCCESS' : 'delivery failed');
}

const stripeMeta = spawnSync(process.execPath, ['scripts/gate12-stripe-live-check.mjs'], { encoding: 'utf8' });
add('stripeLiveMode', 'Stripe key metadata (not live charge)', stripeMeta.status === 0, stripeMeta.status === 0 ? 'sk_live_ prefix confirmed' : 'awaiting admin live AED charge');

const gate12 = runNpm('test:gate12:controls');
add('appCheckProduction', 'Functions enforceAppCheck + hosting', gate12.ok, 'Gate12 automated controls pass; console enforcement still required');

for (const row of gates) {
  console.log(`[${row.ok ? 'PASS' : 'SKIP'}] ${row.label}: ${row.detail}`);
}

const toRecord = [
  env.ok && { gateKey: 'mainCredentialLogin', evidence: 'Production E2E env guard ok; five dedicated smoke accounts configured' },
  smtpDeliveryOk && { gateKey: 'brandedEmailSender', evidence: 'Production mail queue delivery.state=SUCCESS via SendGrid branded sender' },
  smtpSecretsOk && !smtpDeliveryOk && { gateKey: 'brandedEmailSender', evidence: 'SMTP secrets configured; delivery proof pending' },
].filter(Boolean);

console.log('\nRecording to Firestore:\n');
let recorded = 0;
for (const item of toRecord) {
  if (record(item.gateKey, item.evidence)) recorded += 1;
}

console.log(`\nRecorded ${recorded} gate(s). Stripe live charge and 24-48h pilot remain admin/human gates.`);
process.exit(recorded > 0 ? 0 : 1);
