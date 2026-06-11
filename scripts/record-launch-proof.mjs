import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const gatePath = 'launch_package/launch-proof-gates.json';

function usage() {
  console.error(`Usage:\n  npm run launch:pass -- --gate <gateName> --proof "<live proof text>"\n\nExample:\n  npm run launch:pass -- --gate firebaseAuth --proof "Tested owner, tenant, technician, broker, and admin login on live production by Rashid AbdulGhani on 2026-06-10."`);
  process.exit(1);
}

function argValue(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return '';
  return String(process.argv[index + 1] || '').trim();
}

const gateName = argValue('gate');
const proof = argValue('proof');
const tester = argValue('tester') || 'Rashid AbdulGhani';
const testedAt = argValue('testedAt') || new Date().toISOString();

if (!gateName || !proof) usage();
if (proof.length < 30) {
  console.error('Proof text is too short. Include what was tested, where, by whom, and when.');
  process.exit(1);
}
if (!existsSync(gatePath)) {
  console.error(`Missing launch proof gate file: ${gatePath}`);
  process.exit(1);
}

const gates = JSON.parse(readFileSync(gatePath, 'utf8'));
const groups = ['deploymentProof', 'requiredProviderGates', 'requiredDeviceGates'];
let found = false;

for (const groupName of groups) {
  const group = gates[groupName] || {};
  if (!Object.prototype.hasOwnProperty.call(group, gateName)) continue;
  const gate = group[gateName] || {};

  if (gate.required === false && gate.status === 'waived') {
    console.error(`${gateName} is waived and does not need launch proof. Edit manually only if scope changes.`);
    process.exit(1);
  }

  group[gateName] = {
    ...gate,
    status: 'passed',
    proof,
    testedBy: tester,
    testedAt,
    updatedAt: new Date().toISOString(),
  };
  gates[groupName] = group;
  found = true;
  break;
}

if (!found) {
  console.error(`Unknown gate: ${gateName}`);
  console.error('Available gates:');
  for (const groupName of groups) {
    for (const name of Object.keys(gates[groupName] || {})) console.error(`- ${name}`);
  }
  process.exit(1);
}

gates.lastAuditUpdate = new Date().toISOString();
writeFileSync(gatePath, `${JSON.stringify(gates, null, 2)}\n`);
console.log(`Recorded launch proof for ${gateName}.`);
console.log('Run: npm run test:launch-clearance');
