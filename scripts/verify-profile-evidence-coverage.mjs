import fs from 'node:fs';
import path from 'node:path';

const registerPath = path.resolve('launch_package', 'hard-launch-readiness.json');
const register = fs.existsSync(registerPath)
  ? JSON.parse(fs.readFileSync(registerPath, 'utf8'))
  : { hardLaunchGates: [], profileScores: {} };

const gates = Array.isArray(register.hardLaunchGates) ? register.hardLaunchGates : [];
const profiles = ['owner', 'tenant', 'technician', 'broker', 'admin'];

console.log('[profile-evidence] Profile evidence coverage');
for (const profile of profiles) {
  const profileScore = register?.profileScores?.[profile];
  const explicit = Array.isArray(profileScore?.evidenceGates) ? profileScore.evidenceGates : [];
  const inferred = gates.filter((gate) => gate.profile === profile || String(gate.id || '').toLowerCase().startsWith(profile));
  console.log(`- ${profile}: ${Math.max(explicit.length, inferred.length)} gate(s)`);
}
