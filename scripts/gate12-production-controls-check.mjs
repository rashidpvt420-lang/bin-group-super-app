/**
 * Gate 12 — Production controls automated proof (metadata + code + reachability).
 * Does not expose secret values. Live payment/email proof still requires manual evidence.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { validateStripeSecretName } from './lib/stripe-secret-format.mjs';

const PROJECT = 'bin-group-57c60';
const REGION = 'europe-west3';
const BANK_ONLY = process.env.LAUNCH_BANK_ONLY === '1' || process.env.LAUNCH_BANK_ONLY === 'true';
const REQUIRED_SECRETS = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
];

const results = [];
const blockers = [];
const manual = [];

function pass(label, detail = '') {
  results.push({ status: 'PASS', label, detail });
}

function fail(label, detail = '') {
  results.push({ status: 'FAIL', label, detail });
  blockers.push(`${label}: ${detail}`);
}

function stripeAdvisory(label, detail = '') {
  if (BANK_ONLY) {
    warn(label, `${detail} (advisory — LAUNCH_BANK_ONLY=1 bank-transfer pilot defers Stripe card billing)`);
    return;
  }
  fail(label, detail);
}

function warn(label, detail = '') {
  results.push({ status: 'WARN', label, detail });
  manual.push(`${label}: ${detail}`);
}

function read(path) {
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf8');
}

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function secretHasEnabledVersion(name) {
  try {
    const out = run(`gcloud secrets versions list ${name} --project=${PROJECT} --filter="state:enabled" --format="value(name)" --limit=1`);
    return Boolean(out);
  } catch {
    return false;
  }
}

// ── 1. Firebase project context ─────────────────────────────────────────────
try {
  const use = run('firebase use');
  if (use.includes(PROJECT)) pass('Firebase project context', PROJECT);
  else fail('Firebase project context', `Expected ${PROJECT}, got: ${use}`);
} catch (err) {
  fail('Firebase project context', err.message);
}

// ── 1b. Blaze billing ─────────────────────────────────────────────────────────
try {
  const billingEnabled = run(`gcloud billing projects describe ${PROJECT} --format="value(billingEnabled)"`);
  if (billingEnabled === 'True') pass('Blaze billing enabled', 'billingEnabled=true');
  else fail('Blaze billing enabled', `billingEnabled=${billingEnabled || 'unknown'}`);
} catch (err) {
  fail('Blaze billing enabled', err.message);
}

// ── 2. Secret Manager metadata (no values) ────────────────────────────────────
for (const secret of REQUIRED_SECRETS) {
  if (secretHasEnabledVersion(secret)) pass(`Secret enabled: ${secret}`);
  else fail(`Secret enabled: ${secret}`, 'No enabled version in Secret Manager');
}

// ── 2b. Stripe secret value formats (prefix only) ───────────────────────────
for (const secret of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']) {
  try {
    const raw = run(`gcloud secrets versions access latest --secret=${secret} --project=${PROJECT}`);
    const result = validateStripeSecretName(secret, raw);
    if (result.ok) pass(`Stripe format: ${secret}`, result.detail);
    else stripeAdvisory(`Stripe format: ${secret}`, result.detail);
  } catch (err) {
    stripeAdvisory(`Stripe format: ${secret}`, err.message);
  }
}

// ── 3. Stripe webhook code contract ───────────────────────────────────────────
const stripePayment = read('functions/stripePayment.ts');
if (stripePayment.includes('defineSecret("STRIPE_WEBHOOK_SECRET")') && stripePayment.includes('constructEvent')) {
  pass('Stripe webhook signature verification', 'constructEvent + STRIPE_WEBHOOK_SECRET');
} else {
  fail('Stripe webhook signature verification', 'Missing constructEvent or webhook secret binding');
}

// ── 4. App Check on Functions ─────────────────────────────────────────────────
const indexTs = read('functions/index.ts');
if (indexTs.includes('enforceAppCheck: true')) pass('Functions App Check enforcement', 'setGlobalOptions enforceAppCheck: true');
else fail('Functions App Check enforcement', 'enforceAppCheck not set globally');

const firebaseRuntime = read('src/lib/firebase.ts');
if (firebaseRuntime.includes("readEnv('VITE_ENABLE_FIREBASE_APPCHECK') === 'true'")) {
  pass('Client App Check gate', 'VITE_ENABLE_FIREBASE_APPCHECK check present');
} else {
  fail('Client App Check gate', 'Missing VITE_ENABLE_FIREBASE_APPCHECK gate');
}

// ── 5. Mail delivery secret wiring ────────────────────────────────────────────
const mailDelivery = read('functions/mailDelivery.ts');
if (mailDelivery.includes('defineSecret("SMTP_FROM")') && mailDelivery.includes('secrets: SMTP_SECRETS')) {
  pass('Mail delivery SMTP secret binding', 'SMTP_FROM + secrets array on triggers');
} else {
  fail('Mail delivery SMTP secret binding', 'SMTP_FROM or secrets binding missing');
}
if (!indexTs.includes("host: 'smtp.gmail.com'") && indexTs.includes('@deprecated Mail delivery is handled by sendQueuedMailOnCreate')) {
  pass('Single mail delivery path', 'processMailQueue deprecated no-op; mailDelivery.ts owns SMTP');
} else if (!indexTs.includes('export const processMailQueue')) {
  pass('Single mail delivery path', 'No processMailQueue in index.ts');
} else {
  fail('Single mail delivery path', 'Duplicate Gmail processMailQueue still active in index.ts');
}

// ── 6. Deployed function reachability (stripe webhook) ──────────────────────
const webhookUrl = `https://${REGION}-${PROJECT}.cloudfunctions.net/stripeWebhook`;
try {
  const res = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    pass('Stripe webhook endpoint reachable', `HTTP ${res.status} (expected without Stripe-Signature)`);
  } else if (res.status === 404) {
    fail('Stripe webhook endpoint reachable', `HTTP 404 at ${webhookUrl}`);
  } else {
    warn('Stripe webhook endpoint reachable', `HTTP ${res.status} — confirm manually in Stripe Dashboard`);
  }
} catch (err) {
  fail('Stripe webhook endpoint reachable', err.message);
}

// ── 7. Production hosting reachability ───────────────────────────────────────
for (const [label, url] of [
  ['Main app hosting', 'https://bin-group-57c60.web.app'],
  ['Admin panel hosting', 'https://bin-group-admin-panel.web.app'],
]) {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (res.status < 500) pass(`${label} reachable`, `HTTP ${res.status}`);
    else fail(`${label} reachable`, `HTTP ${res.status}`);
  } catch (err) {
    fail(`${label} reachable`, err.message);
  }
}

// ── 8. Manual-only Gate 12 items ──────────────────────────────────────────────
manual.push('Live Stripe payment + webhook Firestore mutation: needs real transaction evidence');
manual.push('App Check console enforcement: enable for Firestore, Storage, Functions after metrics review');
manual.push('Branded email send proof: trigger mail queue and confirm delivery.state=SUCCESS with branded from');
manual.push('Admin password rotation: rotate, update .env.e2e only, re-run Gate 11');

// ── Report ────────────────────────────────────────────────────────────────────
console.log('\n=== Gate 12 Production Controls Check ===\n');
if (BANK_ONLY) console.log('LAUNCH_BANK_ONLY=1 — Stripe format failures are advisory for bank-transfer pilot only.\n');
for (const row of results) {
  console.log(`[${row.status}] ${row.label}${row.detail ? ` — ${row.detail}` : ''}`);
}

if (manual.length) {
  console.log('\nManual proof still required:\n');
  for (const item of manual) console.log(`- ${item}`);
}

const passed = results.filter((r) => r.status === 'PASS').length;
const failed = results.filter((r) => r.status === 'FAIL').length;
const warned = results.filter((r) => r.status === 'WARN').length;
console.log(`\nSummary: ${passed} passed, ${failed} failed, ${warned} warnings`);

if (blockers.length) {
  console.log('\nAutomated blockers:\n');
  for (const item of blockers) console.log(`- ${item}`);
  process.exit(1);
}

console.log('\nGate 12 automated checks: PASS (manual proofs still required for full GO).');
process.exit(0);
