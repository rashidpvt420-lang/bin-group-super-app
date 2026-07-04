import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const policy = fs.readFileSync(path.join(root, 'functions/slaPolicy.ts'), 'utf8');
const doc = fs.readFileSync(path.join(root, 'docs/SLA_BACKEND_ALIGNMENT_TARGET.md'), 'utf8');

const requiredPolicyTokens = [
  'EMERGENCY: 30',
  'HIGH: 120',
  'MEDIUM: 240',
  'STANDARD: 480',
  'LOW: 1440',
  'functionsSlaMinutesForPriority',
  'buildSlaFields',
];

const requiredDocTokens = ['EMERGENCY', 'HIGH', 'MEDIUM', 'STANDARD', 'LOW'];
const missing = [];

for (const token of requiredPolicyTokens) {
  if (!policy.includes(token)) missing.push(`functions/slaPolicy.ts missing ${token}`);
}
for (const token of requiredDocTokens) {
  if (!doc.includes(token)) missing.push(`SLA_BACKEND_ALIGNMENT_TARGET.md missing ${token}`);
}

if (missing.length) {
  console.error('Functions SLA policy verification failed:');
  missing.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Functions SLA policy verification passed.');
