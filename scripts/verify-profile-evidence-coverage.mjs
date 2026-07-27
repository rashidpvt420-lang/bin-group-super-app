import fs from 'node:fs';
import path from 'node:path';

const registerPath = path.resolve('launch_package', 'hard-launch-readiness.json');
const register = fs.existsSync(registerPath)
  ? JSON.parse(fs.readFileSync(registerPath, 'utf8'))
  : { hardLaunchGates: [] };

const gates = Array.isArray(register.hardLaunchGates) ? register.hardLaunchGates : [];
const profiles = ['owner', 'tenant', 'technician', 'broker', 'admin'];
const failures = [];

if ('scores' in register || 'profileScores' in register) {
  failures.push('Static readiness scores are prohibited; profile clearance must come from protected runtime evidence.');
}

console.log('[profile-evidence] Profile evidence coverage');
for (const profile of profiles) {
  const mapped = gates.filter((gate) =>
    gate?.profile === profile || String(gate?.id || '').toLowerCase().startsWith(profile),
  );
  const runtimeBacked = mapped.filter((gate) => String(gate?.source || '').includes('protected_runtime'));

  console.log(`- ${profile}: ${mapped.length} mapped gate(s), ${runtimeBacked.length} protected-runtime gate(s)`);
  if (mapped.length === 0) failures.push(`${profile} has no mapped evidence gate.`);
  if (runtimeBacked.length === 0) failures.push(`${profile} has no protected-runtime evidence gate.`);
}

if (failures.length > 0) {
  console.error('[profile-evidence] Coverage verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[profile-evidence] All five profiles have explicit protected-runtime launch-gate coverage. Gate acceptance is enforced by verify-hard-launch-readiness.mjs.');
