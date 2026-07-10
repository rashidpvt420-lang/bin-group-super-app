import fs from 'node:fs';
import path from 'node:path';

const registerPath = path.resolve('launch_package', 'hard-launch-readiness.json');

if (!fs.existsSync(registerPath)) {
  console.error('[hard-launch:blockers] Missing launch_package/hard-launch-readiness.json');
  process.exit(1);
}

const register = JSON.parse(fs.readFileSync(registerPath, 'utf8'));
const gates = Array.isArray(register.hardLaunchGates) ? register.hardLaunchGates : [];
const required = gates.filter((gate) => gate.required !== false);
const acceptedStatuses = new Set(['passed', 'software_gate_present']);
const accepted = required.filter((gate) => acceptedStatuses.has(gate.status));
const external = required.filter((gate) => gate.status === 'external_verification_required');
const blocked = required.filter((gate) => ['blocked', 'failed', 'missing'].includes(gate.status));
const attested = required.filter((gate) => gate.status === 'founder_attested');
const unknown = required.filter((gate) => !acceptedStatuses.has(gate.status) && !['external_verification_required', 'founder_attested', 'blocked', 'failed', 'missing'].includes(gate.status));

const verifiedScore = Number(register?.scores?.overallVerified || 0);
const conditionalScore = Number(register?.scores?.overallConditional || 0);
const decision = String(register?.decision || '').trim() || 'MISSING';

const groups = {
  five_profile_live_workflow: ['admin_login', 'main_login', 'owner_onboarding', 'tenant_photo_request', 'technician_evidence_completion', 'broker_commission_state', 'admin_core_pages', 'admin_staff_create', 'payment_unlock'],
  external_services_and_security: ['live_billing', 'app_integrity', 'access_rotation', 'branded_email'],
  operations_pilot: ['renewal_watch', 'pilot_no_p0_p1'],
};

function gateLine(gate) {
  const canonical = gate.canonicalGate ? ` · canonical: ${gate.canonicalGate}` : '';
  return `- ${gate.id}: ${gate.label} [${gate.status}]${canonical}`;
}

console.log('\n[hard-launch:blockers] BIN GROUP Super App');
console.log(`[hard-launch:blockers] Decision: ${decision}`);
console.log(`[hard-launch:blockers] Conditional score: ${conditionalScore}/10`);
console.log(`[hard-launch:blockers] Verified score: ${verifiedScore}/10`);
console.log(`[hard-launch:blockers] Required gates accepted: ${accepted.length}/${required.length}`);
console.log(`[hard-launch:blockers] External verification gates: ${external.length}`);
console.log(`[hard-launch:blockers] Blocked/failed/missing gates: ${blocked.length}`);
console.log(`[hard-launch:blockers] Founder-attested gates: ${attested.length}`);
console.log(`[hard-launch:blockers] Unknown-status gates: ${unknown.length}`);

if (accepted.length > 0) {
  console.log('\nAccepted software/production gates:');
  for (const gate of accepted) console.log(gateLine(gate));
}

for (const [group, ids] of Object.entries(groups)) {
  const groupGates = external.filter((gate) => ids.includes(gate.id));
  if (groupGates.length === 0) continue;
  console.log(`\n${group.replaceAll('_', ' ').toUpperCase()}:`);
  for (const gate of groupGates) console.log(gateLine(gate));
}

const otherExternal = external.filter((gate) => !Object.values(groups).flat().includes(gate.id));
if (otherExternal.length > 0) {
  console.log('\nOTHER EXTERNAL VERIFICATION GATES:');
  for (const gate of otherExternal) console.log(gateLine(gate));
}

if (blocked.length > 0) {
  console.log('\nBLOCKED / FAILED / MISSING:');
  for (const gate of blocked) console.log(gateLine(gate));
}

if (attested.length > 0) {
  console.log('\nFOUNDER ATTESTATION IS NOT ACCEPTED FOR HARD LAUNCH:');
  for (const gate of attested) console.log(gateLine(gate));
}

if (unknown.length > 0) {
  console.log('\nUNKNOWN STATUS GATES:');
  for (const gate of unknown) console.log(gateLine(gate));
}

console.log('\nWhat changes the hard-launch decision to PUBLIC_LAUNCH_READY:');
console.log('1. Every required external verification gate must be backed by timestamped production evidence.');
console.log('2. Each verified external gate status must be updated from external_verification_required to passed.');
console.log('3. overallVerified must be raised to at least 9.0 only after evidence exists.');
console.log('4. decision must be changed to PUBLIC_LAUNCH_READY only after every required gate is accepted.');
console.log('5. system_health/admin_summaries must contain the canonical evidence for the admin dashboard.');

if (external.length > 0 || blocked.length > 0 || attested.length > 0 || unknown.length > 0 || verifiedScore < 9 || decision !== 'PUBLIC_LAUNCH_READY' || accepted.length !== required.length) {
  console.log('\n[hard-launch:blockers] Result: NO-GO for unrestricted public hard launch.');
  process.exitCode = 1;
} else {
  console.log('\n[hard-launch:blockers] Result: GO for unrestricted public hard launch.');
}
