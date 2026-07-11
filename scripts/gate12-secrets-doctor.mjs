/**
 * Gate 12 — Diagnose contaminated Stripe/SMTP secrets (format only; no values printed).
 */
import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = 'bin-group-57c60';

function runNode(script) {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8', stdio: 'pipe' });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  return result.status ?? 1;
}

console.log('\n=== Gate 12 Secrets Doctor ===\n');
console.log(`Project: ${PROJECT}\n`);

let failed = 0;

try {
  const use = execSync('firebase use', { encoding: 'utf8' }).trim();
  if (!use.includes(PROJECT)) {
    console.log(`[WARN] Active Firebase project may not be ${PROJECT}: ${use}`);
  } else {
    console.log(`[PASS] Firebase project — ${PROJECT}`);
  }
} catch (err) {
  console.log(`[FAIL] firebase use — ${err.message}`);
  failed += 1;
}

const stripeCode = runNode(path.join(__dirname, 'gate12-stripe-live-check.mjs'));
if (stripeCode !== 0) failed += 1;

const smtpCode = runNode(path.join(__dirname, 'gate12-smtp-secrets-check.mjs'));
if (smtpCode !== 0) failed += 1;

console.log('\n--- Remediation ---');
console.log('Never put Gmail passwords or personal emails into SMTP_HOST, SMTP_USER, or Stripe secrets.');
console.log('Stripe: sk_live_... and whsec_... only.');
console.log('SendGrid: host=smtp.sendgrid.net, port=587, user=apikey, pass=SG....');

if (failed) {
  console.log('\nSecrets doctor: FAIL — fix secrets, then: npm run build:functions && firebase deploy --only functions');
  process.exit(1);
}

console.log('\nSecrets doctor: PASS (live SMTP send + Stripe checkout still required).');
process.exit(0);
