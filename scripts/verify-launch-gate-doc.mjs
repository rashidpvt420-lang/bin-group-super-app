import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const content = fs.readFileSync(path.join(root, 'docs/LAUNCH_GATE_SINGLE_TRUTH.md'), 'utf8');

const required = [
  'Controlled pilot',
  'Public beta',
  'Full commercial launch',
  'Payment route',
  'Five-role smoke test result',
  'Firestore rules pass',
  'Storage rules pass',
  'Functions deploy pass',
  'Main app deploy pass',
  'Admin deploy pass',
];

const missing = required.filter((text) => !content.includes(text));

if (missing.length) {
  console.error('Launch gate documentation verification failed:');
  missing.forEach((text) => console.error(`- Missing: ${text}`));
  process.exit(1);
}

console.log('Launch gate documentation verification passed.');
