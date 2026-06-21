import fs from 'node:fs';
import path from 'node:path';

const registerPath = path.resolve('launch_package', 'hard-launch-readiness.json');

if (!fs.existsSync(registerPath)) {
  console.error('[hard-launch] Missing launch_package/hard-launch-readiness.json');
  process.exit(1);
}

const register = JSON.parse(fs.readFileSync(registerPath, 'utf8'));
const gates = Array.isArray(register.hardLaunchGates) ? register.hardLaunchGates : [];
const required = gates.filter((gate) => gate.required !== false);
const passedStatuses = new Set(['passed', 'founder_attested', 'software_gate_present']);
const external = required.filter((gate) => gate.status === 'external_verification_required');
const blocked = required.filter((gate) => ['blocked', 'failed', 'missing'].includes(gate.status));
const passed = required.filter((gate) => passedStatuses.has(gate.status));

const verifiedScore = Number(register?.scores?.overallVerified || 0);
const conditionalScore = Number(register?.scores?.overallConditional || 0);

console.log(`[hard-launch] Product: ${register.product}`);
console.log(`[hard-launch] Market: ${register.market}`);
console.log(`[hard-launch] Required gates: ${required.length}`);
console.log(`[hard-launch] Passed/founder-attested/software gates: ${passed.length}`);
console.log(`[hard-launch] External verification gates: ${external.length}`);
console.log(`[hard-launch] Blocked gates: ${blocked.length}`);
console.log(`[hard-launch] Conditional score: ${conditionalScore}/10`);
console.log(`[hard-launch] Verified score: ${verifiedScore}/10`);

if (blocked.length > 0) {
  console.error('[hard-launch] Blocked gates:');
  for (const gate of blocked) console.error(`- ${gate.id}: ${gate.label}`);
  process.exit(1);
}

if (conditionalScore < 9) {
  console.error('[hard-launch] Conditional launch score is below 9.0');
  process.exit(1);
}

if (external.length > 0) {
  console.warn('[hard-launch] External verification still required before unrestricted public launch:');
  for (const gate of external) console.warn(`- ${gate.id}: ${gate.label}`);
  console.warn('[hard-launch] Result: controlled public beta allowed; unrestricted commercial launch still requires external proof.');
  process.exit(0);
}

if (verifiedScore < 9) {
  console.error('[hard-launch] Verified launch score is below 9.0');
  process.exit(1);
}

console.log('[hard-launch] Result: verified hard public launch gate passed.');
