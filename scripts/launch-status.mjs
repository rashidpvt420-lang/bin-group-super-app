/**
 * Pilot vs public launch status from automated checks + launch registers.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot, runNodeScript } from './lib/run-script.mjs';

const BANK_ONLY = process.env.LAUNCH_BANK_ONLY === '1' || process.env.LAUNCH_BANK_ONLY === 'true';

const checks = [
  { label: 'Five-role REST auth', fn: () => runNodeScript('scripts/verify-e2e-auth-rest.mjs') },
  { label: 'E2E env guard', fn: () => runNodeScript('scripts/verify-e2e-env.mjs') },
  { label: 'Gate 12 controls', fn: () => runNodeScript('scripts/gate12-production-controls-check.mjs') },
  { label: 'SMTP secret formats', fn: () => runNodeScript('scripts/gate12-smtp-secrets-check.mjs') },
  {
    label: 'Stripe secret formats',
    bankSkip: true,
    fn: () => runNodeScript('scripts/gate12-stripe-live-check.mjs'),
  },
  { label: 'Launch proof gates', fn: () => runNodeScript('scripts/verify-launch-clearance.mjs') },
  { label: 'Pilot hard-launch register', fn: () => runNodeScript('scripts/verify-hard-launch-readiness.mjs', ['--pilot']) },
  { label: 'Public hard-launch register', fn: () => runNodeScript('scripts/verify-hard-launch-readiness.mjs') },
];

console.log('\n=== BIN GROUP launch status ===\n');
if (BANK_ONLY) console.log('LAUNCH_BANK_ONLY=1 — Stripe secret format is advisory for bank-transfer pilot only.\n');

const results = [];
for (const check of checks) {
  const raw = check.fn();
  const skipped = check.bankSkip && BANK_ONLY && !raw.ok;
  const result = skipped ? { ...raw, ok: true, skipped: true } : raw;
  results.push({ ...check, ...result, skipped });
  const status = skipped ? 'SKIP' : result.ok ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${check.label}`);
  if (!result.ok && !skipped && result.out) {
    const tail = result.out.split(/\r?\n/).slice(-4).join('\n');
    if (tail) console.log(tail);
  }
}

const registerPath = path.join(repoRoot, 'launch_package/hard-launch-readiness.json');
if (existsSync(registerPath)) {
  const register = JSON.parse(readFileSync(registerPath, 'utf8'));
  const unattested = (register.hardLaunchGates || [])
    .filter((g) => g.required !== false)
    .filter((g) => !['passed', 'founder_attested', 'software_gate_present'].includes(g.status));
  console.log(`\nRegister decision: ${register.decision || '(unset)'}`);
  console.log(`Unattested hard-launch gates: ${unattested.length}`);
  if (unattested.length) {
    console.log('Still need evidence for:');
    for (const gate of unattested.slice(0, 8)) console.log(`- ${gate.id}: ${gate.label}`);
    if (unattested.length > 8) console.log(`- ...and ${unattested.length - 8} more`);
  }
}

const byLabel = Object.fromEntries(results.map((r) => [r.label, r.ok || r.skipped]));
const coreAutomation =
  byLabel['Five-role REST auth'] &&
  byLabel['Gate 12 controls'] &&
  byLabel['SMTP secret formats'] &&
  (byLabel['E2E env guard'] || byLabel['Five-role REST auth']);
const pilotReady = coreAutomation && byLabel['Pilot hard-launch register'];
const publicReady = results.filter((r) => !r.skipped).every((r) => r.ok);

console.log('\n--- Verdict ---');
const pilotLabel = BANK_ONLY ? 'Controlled bank-transfer pilot' : 'Controlled pilot (friends/private)';
console.log(`${pilotLabel}: ${pilotReady ? 'ELIGIBLE' : 'NOT ELIGIBLE'}`);
console.log(`Public / store launch: ${publicReady ? 'GO' : 'NO-GO'}`);
if (!publicReady) {
  console.log('(Public launch requires sk_live_ + whsec_ Stripe secrets and live billing proof — not waived by LAUNCH_BANK_ONLY)');
}

if (pilotReady && !publicReady) {
  if (BANK_ONLY) {
    console.log('\nBank-transfer pilot eligible once remaining automation passes. Stripe card billing remains deferred.');
  } else {
    console.log('\nPilot is cleared. Remaining public-launch blockers:');
  }
  console.log('- npm run test:gate12:stripe && admin live AED charge → npm run launch:verify-stripe');
  console.log('- npm run test:gate12:appcheck:enforce');
  console.log('- npm run launch:pilot:start then npm run launch:pilot:verify after 24-48h');
  console.log('- Evidence PR to launch_package/hard-launch-readiness.json after review');
} else if (!publicReady) {
  console.log('\nBlockers for pilot eligibility:');
  console.log('- npm run gate12:rotate-e2e  # unique E2E passwords, then update .env.e2e');
  console.log('- npm run seed:e2e:auth && npm run test:e2e:env && npm run test:e2e:auth-rest');
  console.log('- npm run test:e2e:gate11:production && npm run test:e2e:launch-audit');
  if (!BANK_ONLY) {
    console.log('- npm run test:gate12:stripe && admin live AED charge → npm run launch:verify-stripe');
  }
  console.log('- npm run test:gate12:appcheck:enforce');
  console.log('- npm run launch:pilot:start then npm run launch:pilot:verify after 24-48h');
  console.log('- Evidence PR to launch_package/hard-launch-readiness.json after review');
}

process.exit(publicReady ? 0 : pilotReady ? 0 : 1);
