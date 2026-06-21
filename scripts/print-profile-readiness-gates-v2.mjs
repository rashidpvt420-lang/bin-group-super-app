import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync('launch_package/profile-readiness-gates-v2.json', 'utf8'));
console.log('[profile-readiness-v2] profiles:', data.profiles.join(', '));
console.log('[profile-readiness-v2] gates:', data.gates.length);
for (const profile of data.profiles) console.log(`- ${profile}: ${data.scores[profile]}/10 target`);
