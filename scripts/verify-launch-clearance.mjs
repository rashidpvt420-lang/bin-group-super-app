import { existsSync, readFileSync } from 'node:fs';

const gatePath = 'launch_package/launch-proof-gates.json';
const failures = [];
const warnings = [];

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

function validateGate(groupName, name, gate) {
  if (!gate || typeof gate !== 'object') {
    fail(`${groupName}.${name} is malformed or missing.`);
    return;
  }

  const required = gate.required === true;
  const status = String(gate.status || '').toLowerCase();
  const label = `${groupName}.${name}`;

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

if (failures.length) {
  console.error('\nPUBLIC LAUNCH CLEARANCE: NO-GO\n');
  for (const item of failures) console.error(`- ${item}`);
  if (warnings.length) {
    console.error('\nWarnings:');
    for (const item of warnings) console.error(`- ${item}`);
  }
  console.error('\nFor pilot use, record real passed evidence with: npm run launch:pass -- --gate <gateName> --proof "<live proof>"');
  console.error('For a formal waiver, edit launch_package/launch-proof-gates.json and include waivedBy, waivedAt, riskNote, and expiresAt.');
  process.exit(1);
}

if (warnings.length) {
  console.warn('\nPUBLIC LAUNCH CLEARANCE: GO WITH WAIVERS\n');
  for (const item of warnings) console.warn(`- ${item}`);
} else {
  console.log('PUBLIC LAUNCH CLEARANCE: GO');
}
