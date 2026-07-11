/**
 * Pilot vs public launch status from automated checks + launch registers.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot, runNodeScript } from './lib/run-script.mjs';

const checks = [
  { label: 'Five-role REST auth', fn: () => runNodeScript('scripts/verify-e2e-auth-rest.mjs') },
  { label: 'E2E env guard', fn: () => runNodeScript('scripts/verify-e2e-env.mjs') },
  { label: 'Gate 12 controls', fn: () => runNodeScript('scripts/gate12-production-controls-check.mjs') },
  { label: 'SMTP secret formats', fn: () => runNodeScript('scripts/gate12-smtp-secrets-check.mjs') },
  { label: 'Launch proof gates', fn: () => runNodeScript('scripts/verify-launch-clearance.mjs') },
  { label: 'Pilot hard-launch register', fn: () => runNodeScript('scripts/verify-hard-launch-readiness.mjs', ['--pilot']) },
  { label: 'Public hard-launch register', fn: () => runNodeScript('scripts/verify-hard-launch-readiness.mjs') },
];

console.log('\n=== BIN GROUP launch status ===\n');

const results = [];
for (const check of checks) {
  const result = check.fn();
  results.push({ ...check, ...result });
  console.log(`[${result.ok ? 'PASS' : 'FAIL'}] ${check.label}`);
  if (!result.ok && result.out) {
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

const byLabel = Object.fromEntries(results.map((r) => [r.label, r.ok]));
const coreAutomation =
  byLabel['Five-role REST auth'] &&
  byLabel['Gate 12 controls'] &&
  byLabel['SMTP secret formats'] &&
  (byLabel['E2E env guard'] || byLabel['Five-role REST auth']);
const pilotReady = coreAutomation && byLabel['Pilot hard-launch register'];
const publicReady = results.every((r) => r.ok);

console.log('\n--- Verdict ---');
console.log(`Controlled pilot (friends/private): ${pilotReady ? 'GO' : 'NO-GO'}`);
console.log(`Public / store launch: ${publicReady ? 'GO' : 'NO-GO'}`);

if (pilotReady && !publicReady) {
  console.log('\nPilot is cleared. Remaining public-launch blockers:');
  console.log('- npm run test:gate12:stripe && admin live AED charge → npm run launch:verify-stripe');
  console.log('- npm run test:gate12:appcheck:enforce');
  console.log('- npm run launch:pilot:start then npm run launch:pilot:verify after 24-48h');
  console.log('- Evidence PR to launch_package/hard-launch-readiness.json after review');
} else if (!publicReady) {
  console.log('\nPublic launch still requires:');
  console.log('- npm run test:e2e:auth-rest && npm run test:e2e:gate11:production && npm run test:e2e:launch-audit');
  console.log('- npm run test:gate12:stripe && admin live AED charge → npm run launch:verify-stripe');
  console.log('- npm run test:gate12:appcheck:enforce');
  console.log('- npm run launch:pilot:start then npm run launch:pilot:verify after 24-48h');
  console.log('- Evidence PR to launch_package/hard-launch-readiness.json after review');
}

process.exit(publicReady ? 0 : pilotReady ? 0 : 1);
