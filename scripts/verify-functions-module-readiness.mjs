import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const runtimeAll = fs.readFileSync(path.join(root, 'functions/runtimeAll.ts'), 'utf8');
const packageJson = fs.readFileSync(path.join(root, 'functions/package.json'), 'utf8');
const nextLifecycle = fs.readFileSync(path.join(root, 'functions/ticketLifecycleV2.ts'), 'utf8');
const sla = fs.readFileSync(path.join(root, 'functions/slaPolicy.ts'), 'utf8');
const guards = fs.readFileSync(path.join(root, 'functions/completionGuards.ts'), 'utf8');

const missing = [];

if (!packageJson.includes('lib/runtimeAll.js')) {
  missing.push('functions/package.json does not point to lib/runtimeAll.js');
}

for (const token of ['updateTicketLifecycleV2', 'assertCompletionReady', 'buildSlaFields']) {
  if (!nextLifecycle.includes(token)) missing.push(`ticketLifecycleV2.ts missing ${token}`);
}

for (const token of ['functionsSlaMinutesForPriority', 'buildSlaFields']) {
  if (!sla.includes(token)) missing.push(`slaPolicy.ts missing ${token}`);
}

for (const token of ['assertCompletionReady', 'partsDisposition', 'residentReviewState']) {
  if (!guards.includes(token)) missing.push(`completionGuards.ts missing ${token}`);
}

if (!runtimeAll.includes('updateTicketLifecycleV2')) {
  missing.push('functions/runtimeAll.ts has not exposed the next lifecycle callable yet');
}

if (missing.length) {
  console.error('Functions module readiness verification failed:');
  missing.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Functions module readiness verification passed.');
