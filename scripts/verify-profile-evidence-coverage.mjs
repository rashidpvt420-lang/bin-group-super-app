import fs from 'node:fs';
import path from 'node:path';

const registerPath = path.resolve('launch_package', 'hard-launch-readiness.json');
const register = fs.existsSync(registerPath)
  ? JSON.parse(fs.readFileSync(registerPath, 'utf8'))
  : { hardLaunchGates: [], profileScores: {} };

const gates = Array.isArray(register.hardLaunchGates) ? register.hardLaunchGates : [];
const profiles = ['owner', 'tenant', 'technician', 'broker', 'admin'];
const failures = [];

console.log('[profile-evidence] Profile evidence coverage');
for (const profile of profiles) {
  const profileScore = register?.profileScores?.[profile];
  const explicit = Array.isArray(profileScore?.evidenceGates) ? profileScore.evidenceGates : [];
  const inferred = gates.filter((gate) => gate.profile === profile || String(gate.id || '').toLowerCase().startsWith(profile));
  const coverage = Math.max(explicit.length, inferred.length);
  const accepted = [...explicit, ...inferred].filter((gate) => {
    if (typeof gate === 'string') {
      const matched = gates.find((candidate) => candidate.id === gate);
      return matched && ['passed', 'software_gate_present'].includes(matched.status);
    }
    return gate && ['passed', 'software_gate_present'].includes(gate.status);
  }).length;

  console.log(`- ${profile}: ${coverage} mapped gate(s), ${accepted} accepted evidence gate(s)`);
  if (coverage === 0) failures.push(`${profile} has no mapped evidence gate.`);
  if (!profileScore || !Number.isFinite(Number(profileScore.verified))) {
    failures.push(`${profile} is missing a numeric verified score.`);
  }
}

if (failures.length > 0) {
  console.error('[profile-evidence] Coverage verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[profile-evidence] All five profiles have explicit launch-gate coverage. Gate acceptance is enforced by verify-hard-launch-readiness.mjs.');
