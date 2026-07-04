import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const fn = fs.readFileSync(path.join(root, 'functions/index.ts'), 'utf8');
const guard = fs.readFileSync(path.join(root, 'functions/completionGuards.ts'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'src/technician/pages/TechnicianJobDetailPage.tsx'), 'utf8');

const requiredInFunction = [
  ['Before', ' photo ', 'proof'].join(''),
  ['After', ' photo ', 'proof'].join(''),
  ['completion', ' notes'].join(''),
];

const requiredInGuard = ['partsDisposition', 'residentReviewState', 'assertCompletionReady'];
const requiredInUi = ['proofChecks', 'closeBlockers', 'hasPartsDisposition', 'tenantApprovalStatus'];
const missing = [];

for (const token of requiredInFunction) {
  if (!fn.includes(token)) missing.push(`functions/index.ts missing ${token}`);
}
for (const token of requiredInGuard) {
  if (!guard.includes(token)) missing.push(`completionGuards.ts missing ${token}`);
}
for (const token of requiredInUi) {
  if (!ui.includes(token)) missing.push(`TechnicianJobDetailPage.tsx missing ${token}`);
}

if (missing.length) {
  console.error('Technician close gate verification failed:');
  missing.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Technician close gate verification passed.');
