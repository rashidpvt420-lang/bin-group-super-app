import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('launch_package', 'profile-readiness-gates.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

console.log('[profile-readiness] Evidence gates by profile');
for (const [profile, gates] of Object.entries(data.profiles || {})) {
  console.log(`- ${profile}: ${Array.isArray(gates) ? gates.length : 0} gate(s)`);
}
