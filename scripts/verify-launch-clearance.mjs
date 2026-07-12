import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  HARD_LAUNCH_CLAIM,
  REQUIRED_PILOT_EVIDENCE,
  assertGateNotWaivedForSecurity,
  deploymentEvidencePath,
  evidencePath,
  evaluatePilotEligibility,
  gitSha,
  readJsonSafe,
} from './lib/launch-honesty.mjs';

const gatePath = 'launch_package/launch-proof-gates.json';
const statusPath = 'launch_package/launch-status.json';
const pilotLockPath = 'launch_package/pilot-start.lock.json';
const failures = [];
const warnings = [];
const isPilotMode = process.argv.includes('--pilot') || process.env.LAUNCH_SCOPE === 'pilot';

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function proofText(gate) {
  return String(gate?.proof || '').trim();
}

function validateGate(groupName, name, gate) {
  if (!gate || typeof gate !== 'object') {
    fail(`${groupName}.${name} is malformed or missing.`);
    return;
  }

  const required = gate.required === true;
  const status = String(gate.status || '').toLowerCase();
  const label = `${groupName}.${name}`;

  const waivedBlocked = assertGateNotWaivedForSecurity(groupName, name, gate);
  if (waivedBlocked) {
    fail(waivedBlocked);
    return;
  }

  if (status === 'passed') {
    if (!proofText(gate)) {
      fail(`${label} is marked passed but has no proof text.`);
    }
    return;
  }

  if (status === 'waived') {
    // Non-security gates may still warn; security ones already failed above.
    if (required) {
      warn(`${label} is required but waived. Confirm this is intentionally accepted by the CEO/admin owner.`);
    }
    return;
  }

  // Pilot mode no longer defers deployment/auth/App Check — those are required via evidence.
  if (required) {
    fail(`${name} is not launch-clear. Current status: ${gate.status || 'missing'}`);
  }
}

if (!existsSync(gatePath)) {
  fail(`Missing launch proof gates file: ${gatePath}`);
} else {
  const gates = JSON.parse(readFileSync(gatePath, 'utf8'));
  const gateGroups = {
    deploymentProof: gates.deploymentProof || {},
    requiredProviderGates: gates.requiredProviderGates || {},
    requiredDeviceGates: gates.requiredDeviceGates || {},
  };

  for (const [groupName, group] of Object.entries(gateGroups)) {
    for (const [name, gate] of Object.entries(group)) {
      validateGate(groupName, name, gate);
    }
  }
}

if (existsSync(statusPath)) {
  try {
    const status = JSON.parse(readFileSync(statusPath, 'utf8'));
    if (status.hardLaunchClaim === true) {
      fail('launch-status incorrectly claims hard launch. hardLaunchClaim must remain false.');
    }
  } catch {
    warn('launch-status.json exists but could not be parsed.');
  }
}

// Always evaluate execution evidence for pilot; also useful for public NO-GO honesty.
const sha = gitSha();
const evidence = readJsonSafe(evidencePath(), { records: [] });
const deploymentDoc = readJsonSafe(deploymentEvidencePath(), null);
const eligibility = evaluatePilotEligibility({
  evidenceBatch: evidence,
  commitSha: sha,
  deploymentDoc,
});

if (isPilotMode) {
  for (const key of eligibility.missing) {
    fail(`Controlled pilot blocked: missing current-commit evidence for ${key}`);
  }
  for (const item of eligibility.invalid) {
    fail(`Controlled pilot blocked: invalid evidence — ${item}`);
  }
  if (eligibility.missing.includes('adminCredentialLogin') === false &&
      eligibility.missing.length === REQUIRED_PILOT_EVIDENCE.length - 1) {
    fail('Controlled pilot blocked: adminCredentialLogin alone cannot make pilot eligible');
  }

  if (existsSync(pilotLockPath)) {
    try {
      const lock = JSON.parse(readFileSync(pilotLockPath, 'utf8'));
      if (lock.status === 'invalidated') {
        fail(`Pilot start lock is invalidated: ${lock.reason || 'unknown reason'}`);
      }
      if (lock.status === 'started' && lock.commitSha && lock.commitSha !== sha) {
        fail('Pilot start lock belongs to a different commit SHA and must be revalidated.');
      }
      if (lock.hardLaunchClaim === true) {
        fail('Pilot lock incorrectly claims hard launch.');
      }
    } catch {
      warn('pilot-start.lock.json exists but could not be parsed.');
    }
  }
} else if (eligibility.missing.length || eligibility.invalid.length) {
  // Public clearance also fails closed on missing critical live evidence.
  for (const key of eligibility.missing) {
    fail(`Public launch blocked: missing current-commit evidence for ${key}`);
  }
  for (const item of eligibility.invalid) {
    fail(`Public launch blocked: invalid evidence — ${item}`);
  }
}

if (failures.length) {
  console.error(`\n${isPilotMode ? 'PRIVATE PILOT CLEARANCE' : 'PUBLIC LAUNCH CLEARANCE'}: NO-GO\n`);
  for (const item of failures) console.error(`- ${item}`);
  if (warnings.length) {
    console.error('\nWarnings:');
    for (const item of warnings) console.error(`- ${item}`);
  }
  console.error(`\nhardLaunchClaim=${HARD_LAUNCH_CLAIM}`);
  console.error('Record critical evidence only via: node scripts/run-critical-evidence.mjs --suite <suite>');
  process.exit(1);
}

if (warnings.length) {
  console.warn(`\n${isPilotMode ? 'PRIVATE PILOT CLEARANCE' : 'PUBLIC LAUNCH CLEARANCE'}: GO WITH WARNINGS\n`);
  for (const item of warnings) console.warn(`- ${item}`);
  console.warn(`hardLaunchClaim=${HARD_LAUNCH_CLAIM}`);
} else {
  console.log(`${isPilotMode ? 'PRIVATE PILOT CLEARANCE' : 'PUBLIC LAUNCH CLEARANCE'}: GO`);
  console.log(`hardLaunchClaim=${HARD_LAUNCH_CLAIM}`);
}
