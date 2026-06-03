import { existsSync, readFileSync } from 'node:fs';

const gatePath = 'launch_package/launch-proof-gates.json';
const failures = [];

function fail(message) {
  failures.push(message);
}

if (!existsSync(gatePath)) {
  fail(`Missing launch proof gates file: ${gatePath}`);
} else {
  const gates = JSON.parse(readFileSync(gatePath, 'utf8'));
  const providerGates = gates.requiredProviderGates || {};
  const deviceGates = gates.requiredDeviceGates || {};
  const allGates = { ...providerGates, ...deviceGates };

  for (const [name, gate] of Object.entries(allGates)) {
    if (!gate.required) continue;
    const status = String(gate.status || '').toLowerCase();
    const hasValidClosure = ['passed', 'waived'].includes(status);
    if (!hasValidClosure) {
      fail(`${name} is not launch-clear. Current status: ${gate.status || 'missing'}`);
    }
    if (status === 'waived') {
      const waiver = gate.waiver || {};
      if (!waiver.waivedBy || !waiver.waivedAt || !waiver.riskNote || !waiver.expiresAt) {
        fail(`${name} waiver is incomplete. Required: waivedBy, waivedAt, riskNote, expiresAt.`);
      }
    }
  }
}

if (failures.length) {
  console.error('\nPUBLIC LAUNCH CLEARANCE: NO-GO\n');
  for (const item of failures) console.error(`- ${item}`);
  console.error('\nFor pilot use, update launch_package/launch-proof-gates.json with real passed evidence or explicit CEO/admin waivers.');
  process.exit(1);
}

console.log('PUBLIC LAUNCH CLEARANCE: GO');
