/**
 * Run all automatable launch gates except Stripe live AED charge (admin-only).
 * Seeds fixtures when credentials exist, runs E2E, records Firestore evidence only on real passes.
 */
import { execSync } from 'node:child_process';
import { hasFirebaseAdminCredentials, repoRoot, runNodeScript, runNpmScript } from './lib/run-script.mjs';

const VERIFIER = process.env.LAUNCH_VERIFIER_NAME || 'Rashid AbdulGhani';
const BANK_ONLY = process.env.LAUNCH_BANK_ONLY === '1' || process.env.LAUNCH_BANK_ONLY === 'true';

const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8', cwd: repoRoot }).trim();
  } catch {
    return 'unknown';
  }
})();
const ts = new Date().toISOString();

function record(gateKey, evidence) {
  if (!hasFirebaseAdminCredentials()) {
    console.log(`  (skip evidence ${gateKey}: no Firebase Admin credentials)`);
    return false;
  }
  const full = `${evidence}; commit=${commit}; utc=${ts}`;
  return runNodeScript('scripts/verify-launch-gate-live.mjs', [gateKey, VERIFIER, full], { inherit: true }).ok;
}

const results = [];

function step(label, fn) {
  process.stdout.write(`→ ${label}... `);
  let outcome;
  try {
    outcome = fn();
  } catch (err) {
    outcome = { ok: false, out: err?.message || String(err) };
  }
  if (!outcome || typeof outcome !== 'object') {
    outcome = { ok: false, out: 'step returned no outcome' };
  }
  const status = outcome.skipped ? 'SKIP' : outcome.ok ? 'PASS' : 'FAIL';
  console.log(status);
  if (!outcome.ok && !outcome.skipped && outcome.out) {
    console.log(outcome.out.split(/\r?\n/).slice(-8).join('\n'));
  }
  results.push({ label, ok: Boolean(outcome.ok), skipped: outcome.skipped === true });
  return outcome.ok;
}

console.log('\n=== Launch fix-all (excluding Stripe live charge) ===\n');
console.log(`commit=${commit} utc=${ts}`);
if (BANK_ONLY) console.log('LAUNCH_BANK_ONLY=1 — Stripe secret format check is advisory only\n');
else console.log('');

step('Seed Gate 11 + workflow fixtures', () => {
  if (!hasFirebaseAdminCredentials()) {
    return {
      ok: true,
      skipped: true,
      out:
        'No Firebase Admin credentials. Use gcloud auth application-default login, or set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON, then npm run seed:e2e:gate11',
    };
  }
  const r = runNodeScript('scripts/seed-gate11-fixtures.mjs');
  if (!r.ok) {
    const isCredError = r.out && (
      r.out.includes('credential') || 
      r.out.includes('permission') || 
      r.out.includes('unauthorized') || 
      r.out.includes('Access denied') || 
      r.out.includes('unauthenticated') ||
      r.out.includes('FirebaseAppError')
    );
    if (isCredError) {
      return {
        ok: true,
        skipped: true,
        out: `Skipped seeding due to credential or database permission issue:\n${r.out.trim()}`
      };
    }
  }
  return r;
});

const preflight = [
  { label: 'E2E environment', script: 'scripts/verify-e2e-env.mjs' },
  { label: 'Five-role REST auth', script: 'scripts/verify-e2e-auth-rest.mjs' },
  { label: 'Gate 12 controls', script: 'scripts/gate12-production-controls-check.mjs' },
  { label: 'SMTP secret formats', script: 'scripts/gate12-smtp-secrets-check.mjs' },
  { label: 'Stripe secret formats', script: 'scripts/gate12-stripe-live-check.mjs', bankSkip: true },
  { label: 'App Check code readiness', script: 'scripts/gate12-appcheck-status.mjs' },
  { label: 'Production route check', script: 'scripts/gate11-production-route-check.mjs' },
];

for (const item of preflight) {
  step(item.label, () => {
    const r = runNodeScript(item.script);
    if (item.bankSkip && BANK_ONLY && !r.ok) {
      return { ok: true, skipped: true, out: r.out };
    }
    return r;
  });
}

step('App Check console enforcement (REST API)', () => runNodeScript('scripts/gate12-enforce-appcheck.mjs'));
step('SMTP live delivery', () => runNodeScript('scripts/test-trigger-email.mjs'));
step('Production five-profile smoke', () => runNpmScript('test:e2e:gate11:production'));
step('Launch audit (production)', () => runNodeScript('scripts/run-live-launch-audit.mjs'));
step('Business workflows (owner/tenant/tech/broker/admin)', () => runNpmScript('test:e2e:business'));
step('Pilot window start', () => runNodeScript('scripts/pilot-launch-watch.mjs', ['start']));

console.log('\n=== Recording Firestore evidence (passed gates only) ===\n');

const byLabel = Object.fromEntries(results.map((r) => [r.label, r.ok && !r.skipped]));

if (byLabel['E2E environment']) record('mainCredentialLogin', 'Production E2E env guard ok; five dedicated smoke accounts');
if (byLabel['Five-role REST auth']) {
  record('mainCredentialLogin', 'Production REST signInWithPassword passed for all five E2E roles');
}
if (byLabel['SMTP live delivery']) record('brandedEmailSender', 'Production mail queue delivery.state=SUCCESS via SendGrid');
if (byLabel['Production five-profile smoke']) record('fiveProfileSmoke', 'Production five-profile Playwright smoke passed');
if (byLabel['Launch audit (production)']) record('adminCredentialLogin', 'Production launch-audit admin suite passed');
if (byLabel['Business workflows (owner/tenant/tech/broker/admin)']) {
  record('technicianGpsStorageProof', 'Technician E2E: GPS lifecycle + after-work photo upload on production');
  record('brokerCommissionLock', 'Broker E2E: lead + commission surface verified on production');
  record('tenantNotificationDelivery', 'Tenant business workflow E2E passed on production');
}
if (byLabel['App Check console enforcement (REST API)']) {
  record('appCheckProduction', 'Firestore + firebasestorage App Check enforcement enabled via firebaseappcheck REST API');
}

console.log('\n=== Summary ===\n');
for (const r of results) {
  const status = r.skipped ? 'SKIP' : r.ok ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${r.label}`);
}

console.log('\nAdmin-only / time gates remaining:');
console.log('- stripeLiveMode: real sk_live_ secrets + live AED checkout → npm run launch:verify-stripe');
if (BANK_ONLY) console.log('  (LAUNCH_BANK_ONLY=1 — bank transfer pilot defers card billing)');
console.log('- adminSecretRotation: rotate exposed E2E passwords + GitHub secrets (manual)');
console.log('- pilot: 24-48h monitoring → npm run launch:pilot:verify (after window elapses)');
console.log('- physical device: optional spot-check GPS on real handset');

const hardFailures = results.filter((r) => !r.ok && !r.skipped).length;
process.exit(hardFailures ? 1 : 0);
