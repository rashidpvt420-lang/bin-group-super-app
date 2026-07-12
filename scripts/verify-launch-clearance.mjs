import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const gatePath = 'launch_package/launch-proof-gates.json';
const evidencePath = 'launch_package/launch-evidence-batch.json';
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

function waiverIsComplete(gate) {
  const waiver = gate?.waiver || {};
  return Boolean(waiver.waivedBy && waiver.waivedAt && waiver.riskNote && waiver.expiresAt);
}

function gitSha() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  return (result.stdout || '').trim() || 'unknown';
}

function validateGate(groupName, name, gate) {
  if (!gate || typeof gate !== 'object') {
    fail(`${groupName}.${name} is malformed or missing.`);
    return;
  }

  const required = gate.required === true;
  const status = String(gate.status || '').toLowerCase();
  const label = `${groupName}.${name}`;
  const pilotCanDefer = isPilotMode && groupName !== 'deploymentProof';

  if (status === 'passed') {
    if (!proofText(gate)) {
      fail(`${label} is marked passed but has no proof text.`);
    }
    return;
  }

  if (status === 'waived') {
    if (!waiverIsComplete(gate)) {
      fail(`${label} waiver is incomplete. Required: waivedBy, waivedAt, riskNote, expiresAt.`);
    }
    if (required) {
      warn(`${label} is required but waived. Confirm this is intentionally accepted by the CEO/admin owner.`);
    }
    return;
  }

  if (pilotCanDefer && required && status === 'pending') {
    warn(`${label} remains pending and is deferred for private pilot only. Public launch still requires passed proof or formal waiver.`);
    return;
  }

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

// Automation truthfulness: never treat controlled pilot as eligible while required automation is failing.
if (existsSync(statusPath)) {
  try {
    const status = JSON.parse(readFileSync(statusPath, 'utf8'));
    if (status.automationOk === false) {
      fail('launch-status reports automationOk=false. Pilot/public clearance blocked.');
    }
    if (status.hardLaunchClaim === true) {
      fail('launch-status incorrectly claims hard launch. Hard-launch claim is forbidden until all live proofs pass.');
    }
  } catch {
    warn('launch-status.json exists but could not be parsed.');
  }
}

if (isPilotMode) {
  const sha = gitSha();
  let adminEvidenceOk = false;
  if (existsSync(evidencePath)) {
    try {
      const batch = JSON.parse(readFileSync(evidencePath, 'utf8'));
      adminEvidenceOk = (batch.records || []).some(
        (r) => r.testName === 'adminCredentialLogin' && r.exitCode === 0 && r.commitSha === sha,
      );
    } catch {
      adminEvidenceOk = false;
    }
  }
  if (!adminEvidenceOk) {
    fail('Controlled pilot blocked: adminCredentialLogin evidence missing for current commit (must come from authenticated admin smoke, not route-only audit).');
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
    } catch {
      warn('pilot-start.lock.json exists but could not be parsed.');
    }
  }
}

if (failures.length) {
  console.error(`\n${isPilotMode ? 'PRIVATE PILOT CLEARANCE' : 'PUBLIC LAUNCH CLEARANCE'}: NO-GO\n`);
  for (const item of failures) console.error(`- ${item}`);
  if (warnings.length) {
    console.error('\nWarnings:');
    for (const item of warnings) console.error(`- ${item}`);
  }
  console.error('\nFor pilot use, run: npm run test:pilot-clearance');
  console.error('For public launch, record real passed evidence with: npm run launch:pass -- --gate <gateName> --proof "<live proof>"');
  console.error('For a formal waiver, edit launch_package/launch-proof-gates.json and include waivedBy, waivedAt, riskNote, and expiresAt.');
  process.exit(1);
}

if (warnings.length) {
  console.warn(`\n${isPilotMode ? 'PRIVATE PILOT CLEARANCE' : 'PUBLIC LAUNCH CLEARANCE'}: GO WITH WARNINGS\n`);
  for (const item of warnings) console.warn(`- ${item}`);
} else {
  console.log(`${isPilotMode ? 'PRIVATE PILOT CLEARANCE' : 'PUBLIC LAUNCH CLEARANCE'}: GO`);
}
