/**
 * Post-deploy production evidence blocker report.
 * Does not modify hard-launch-readiness.json — only reports what still needs proof.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot, runNodeScript } from './lib/run-script.mjs';

const BANK_ONLY = process.env.LAUNCH_BANK_ONLY === '1' || process.env.LAUNCH_BANK_ONLY === 'true';

const PRODUCTION = {
  main: 'https://bin-group-57c60.web.app',
  admin: 'https://bin-group-admin-panel.web.app',
};

function heading(title) {
  console.log(`\n=== ${title} ===\n`);
}

heading('Production deploy targets');
console.log(`Main app:  ${PRODUCTION.main}`);
console.log(`Admin panel: ${PRODUCTION.admin}`);

heading('Five-role REST auth (no browser)');
const authRest = runNodeScript('scripts/verify-e2e-auth-rest.mjs');
console.log(authRest.out.trim() || '(no output)');
console.log(authRest.ok ? '\nREST auth: PASS' : '\nREST auth: FAIL — run npm run seed:e2e:auth then retry');

heading('Automated production controls');
if (BANK_ONLY) console.log('LAUNCH_BANK_ONLY=1 — Stripe format is advisory for bank-transfer pilot.\n');
const gate12 = runNodeScript('scripts/gate12-production-controls-check.mjs');
console.log(gate12.out.trim() || '(no output)');
console.log(gate12.ok ? '\nGate 12 automated: PASS' : '\nGate 12 automated: FAIL — fix blockers above');

heading('SMTP secret formats');
const smtpSecrets = runNodeScript('scripts/gate12-smtp-secrets-check.mjs');
console.log(smtpSecrets.out.trim() || '(no output)');

heading('Stripe live key metadata');
const stripe = runNodeScript('scripts/gate12-stripe-live-check.mjs');
console.log(stripe.out.trim() || '(no output)');
if (BANK_ONLY && !stripe.ok) console.log('\nStripe metadata: SKIP (LAUNCH_BANK_ONLY=1 bank-transfer pilot)');

heading('Hard-launch register (read-only)');
const registerPath = path.join(repoRoot, 'launch_package/hard-launch-readiness.json');
if (existsSync(registerPath)) {
  const register = JSON.parse(readFileSync(registerPath, 'utf8'));
  const gates = Array.isArray(register.hardLaunchGates) ? register.hardLaunchGates : [];
  const required = gates.filter((g) => g.required !== false);
  const unattested = required.filter((g) => !['passed', 'founder_attested', 'software_gate_present'].includes(g.status));
  console.log(`decision: ${register.decision || '(unset)'}`);
  console.log(`overallVerified: ${register?.scores?.overallVerified ?? '(unset)'}`);
  console.log(`required gates: ${required.length}, unattested in register: ${unattested.length}`);
  if (register.decision === 'PUBLIC_LAUNCH_READY' && (!gate12.ok || !smtpSecrets.ok)) {
    console.warn('\n⚠ Register claims PUBLIC_LAUNCH_READY but automated checks still fail.');
    console.warn('  Do not treat the JSON decision as truth until evidence is recorded and reviewed.');
  }
} else {
  console.warn('Missing launch_package/hard-launch-readiness.json');
}

heading('Evidence chain — run in order (production URLs)');
const steps = [
  'Ensure .env or .env.local has VITE_FIREBASE_API_KEY (REST auth reads it after .env.e2e)',
  'Update .env.e2e: E2E_BASE_URL=https://bin-group-57c60.web.app and E2E_ADMIN_BASE_URL=https://bin-group-admin-panel.web.app',
  'npm run test:e2e:env && npm run test:e2e:auth-rest',
  'npm run seed:e2e:gate11 && npm run launch:fix-all',
  'npm run test:gate12:stripe        # sk_live_ prefix check',
  'npm run launch:verify-stripe      # after admin live AED charge',
  'npm run test:gate12:appcheck          # code + REST enforcement status',
  'npm run test:gate12:appcheck:enforce  # enforce Firestore + Storage via REST',
  'Record each proven gate: node scripts/verify-launch-gate-live.mjs adminCredentialLogin "Your Name" "evidence text"',
  'npm run launch:pilot:start then npm run launch:pilot:verify after 48h',
  'Human-only: Stripe live AED charge, physical handset GPS spot-check',
  'Evidence-only PR to hard-launch-readiness.json after review',
  'npm run launch:hard-gate',
];

for (const [index, step] of steps.entries()) {
  console.log(`${index + 1}. ${step}`);
}

heading('PowerShell example — record a gate (no angle brackets)');
console.log('node scripts/verify-launch-gate-live.mjs adminCredentialLogin "Rashid AbdulGhani" "Playwright run 2026-07-11; production admin login passed"');

const blocked = !authRest.ok || !gate12.ok || !smtpSecrets.ok || (!stripe.ok && !BANK_ONLY);
process.exit(blocked ? 1 : 0);
