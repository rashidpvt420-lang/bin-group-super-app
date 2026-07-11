/**
 * Gate 12 — Stripe live-key metadata check (prefix only; never prints secret values).
 */
import { execSync } from 'node:child_process';
import { validateStripeSecretName } from './lib/stripe-secret-format.mjs';

const PROJECT = 'bin-group-57c60';
const SECRETS = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];

function maskedPrefix(secretName, raw) {
  const result = validateStripeSecretName(secretName, raw);
  if (!result.ok && result.detail.includes('email/login')) {
    return {
      ok: false,
      detail:
        'contaminated — value looks like an email/login (e.g. name@domain), not a Stripe key. A password or account credential was likely pasted into Secret Manager by mistake.',
    };
  }
  if (!result.ok && result.detail.includes('human password')) {
    return {
      ok: false,
      detail: 'contaminated — value looks like a human password, not a Stripe API key (expected sk_live_… or whsec_…).',
    };
  }
  return result;
}

function readSecret(secretName) {
  return execSync(
    `gcloud secrets versions access latest --secret=${secretName} --project=${PROJECT}`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
}

let failed = 0;
console.log('\n=== Gate 12 Stripe Live Key Check ===\n');
for (const secret of SECRETS) {
  try {
    const raw = readSecret(secret);
    const result = maskedPrefix(secret, raw);
    if (result.ok) console.log(`[PASS] ${secret} — ${result.detail}`);
    else {
      console.log(`[FAIL] ${secret} — ${result.detail}`);
      failed += 1;
    }
  } catch (err) {
    console.log(`[FAIL] ${secret} — ${err.message}`);
    failed += 1;
  }
}

if (failed) {
  console.log('\nStripe live proof still required: complete a real AED checkout and confirm webhook updates Firestore.');
  console.log('\nAdmin fix — replace contaminated GCP Secret Manager values (never paste passwords/emails):');
  console.log('  1. Stripe Dashboard → Developers → API keys → Reveal live secret → copy sk_live_… only');
  console.log('  2. Stripe Dashboard → Developers → Webhooks → endpoint signing secret → copy whsec_… only');
  console.log('  3. GCP Console → Secret Manager → STRIPE_SECRET_KEY → + New version → paste sk_live_…');
  console.log('  4. GCP Console → Secret Manager → STRIPE_WEBHOOK_SECRET → + New version → paste whsec_…');
  console.log('     Or CLI: firebase functions:secrets:set STRIPE_SECRET_KEY --project bin-group-57c60');
  console.log('  5. npm run build:functions && firebase deploy --only functions --project bin-group-57c60');
  console.log('  6. Re-run: npm run test:gate12:stripe');
  console.log('\nIf a personal password was stored in STRIPE_SECRET_KEY, rotate that password immediately.');
  process.exit(1);
}

console.log('\nStripe secret metadata: PASS (live transaction proof still manual).');
process.exit(0);
