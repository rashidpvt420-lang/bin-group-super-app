import fs from 'node:fs';
import path from 'node:path';

const isPilotMode = process.argv.includes('--pilot') || process.env.LAUNCH_SCOPE === 'pilot';
const bankOnly = process.env.LAUNCH_BANK_ONLY === '1' || process.env.LAUNCH_BANK_ONLY === 'true';
const registerPath = path.resolve('launch_package', 'hard-launch-readiness.json');

if (!fs.existsSync(registerPath)) {
  console.error('[hard-launch] Missing launch_package/hard-launch-readiness.json');
  process.exit(1);
}

const register = JSON.parse(fs.readFileSync(registerPath, 'utf8'));
const gates = Array.isArray(register.hardLaunchGates) ? register.hardLaunchGates : [];
const required = gates.filter((gate) => gate.required !== false);
const acceptedStatuses = new Set(['passed', 'software_gate_present']);
const external = required.filter((gate) => gate.status === 'external_verification_required');
const attested = required.filter((gate) => gate.status === 'founder_attested');
const blocked = required.filter((gate) => ['blocked', 'failed', 'missing'].includes(gate.status));
const unknown = required.filter(
  (gate) =>
    !acceptedStatuses.has(gate.status) &&
    !['external_verification_required', 'founder_attested', 'blocked', 'failed', 'missing'].includes(gate.status)
);
const passed = required.filter((gate) => acceptedStatuses.has(gate.status));

const verifiedScore = Number(register?.scores?.overallVerified || 0);
const conditionalScore = Number(register?.scores?.overallConditional || 0);
const pilotScore = Number(register?.scores?.controlledPilotReadiness || conditionalScore);
const decision = String(register?.decision || '').trim();

console.log(`[hard-launch] Product: ${register.product}`);
console.log(`[hard-launch] Market: ${register.market}`);
console.log(`[hard-launch] Mode: ${isPilotMode ? 'controlled pilot' : bankOnly ? 'bank-only pilot scope' : 'unrestricted public launch'}`);
console.log(`[hard-launch] Decision register: ${decision || 'MISSING'}`);
console.log(`[hard-launch] Required gates: ${required.length}`);
console.log(`[hard-launch] Accepted production/software gates: ${passed.length}`);
console.log(`[hard-launch] External verification gates: ${external.length}`);
console.log(`[hard-launch] Founder-attested gates: ${attested.length}`);
console.log(`[hard-launch] Blocked gates: ${blocked.length}`);
console.log(`[hard-launch] Unknown-status gates: ${unknown.length}`);
console.log(`[hard-launch] Conditional score: ${conditionalScore}/10`);
console.log(`[hard-launch] Pilot score: ${pilotScore}/10`);
console.log(`[hard-launch] Verified score: ${verifiedScore}/10`);

if (isPilotMode) {
  if (pilotScore < 9) {
    console.error('[hard-launch] Controlled pilot score is below 9.0');
    process.exit(1);
  }
  if (!['CONTROLLED_PILOT_ONLY', 'CONTROLLED_PILOT_READY', 'PUBLIC_LAUNCH_READY'].includes(decision)) {
    console.warn('[hard-launch] Register decision is not a pilot-ready state — confirm evidence before inviting pilot users.');
  }
  const deferred = external.filter((gate) => gate.id === 'live_billing');
  const pilotExternal = external.filter((gate) => gate.id !== 'live_billing' || !bankOnly);
  if (bankOnly && deferred.length) {
    console.warn('[hard-launch] LAUNCH_BANK_ONLY=1 — Stripe live billing deferred for controlled bank-transfer pilot.');
  }
  if (pilotExternal.length > 0) {
    console.warn('[hard-launch] External verification still required before unrestricted public launch:');
    for (const gate of pilotExternal) console.warn(`- ${gate.id}: ${gate.label}`);
  }
  console.log('[hard-launch] Result: controlled pilot gate passed.');
  process.exit(0);
}

let failed = false;

if (attested.length > 0) {
  failed = true;
  console.error('[hard-launch] Founder attestation is not accepted as unrestricted production evidence:');
  for (const gate of attested) console.error(`- ${gate.id}: ${gate.label}`);
}

if (external.length > 0) {
  failed = true;
  console.error('[hard-launch] Live production verification is still required:');
  for (const gate of external) console.error(`- ${gate.id}: ${gate.label}`);
}

if (blocked.length > 0) {
  failed = true;
  console.error('[hard-launch] Blocked gates:');
  for (const gate of blocked) console.error(`- ${gate.id}: ${gate.label}`);
}

if (unknown.length > 0) {
  failed = true;
  console.error('[hard-launch] Unknown gate statuses must be resolved explicitly:');
  for (const gate of unknown) console.error(`- ${gate.id}: ${gate.label} (${gate.status || 'missing status'})`);
}

if (conditionalScore < 9) {
  failed = true;
  console.error('[hard-launch] Conditional launch score is below 9.0.');
}

if (verifiedScore < 9) {
  failed = true;
  console.error('[hard-launch] Verified launch score is below 9.0.');
}

if (decision !== 'PUBLIC_LAUNCH_READY') {
  failed = true;
  console.error(`[hard-launch] Decision must be PUBLIC_LAUNCH_READY, received ${decision || 'MISSING'}.`);
}

if (passed.length !== required.length) {
  failed = true;
  console.error(`[hard-launch] Only ${passed.length}/${required.length} required gates have accepted evidence.`);
}

if (failed) {
  console.error('[hard-launch] Result: NO-GO for unrestricted commercial launch. Use the controlled-pilot clearance process until every live gate is proven.');
  process.exit(1);
}

console.log('[hard-launch] Result: verified hard public launch gate passed.');
