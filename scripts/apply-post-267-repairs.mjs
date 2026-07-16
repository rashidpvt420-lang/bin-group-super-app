import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function replaceExactly(source, legacy, canonical, label) {
  const legacyCount = source.split(legacy).length - 1;
  const canonicalCount = source.split(canonical).length - 1;
  if (canonicalCount === 1 && legacyCount === 0) return source;
  if (legacyCount !== 1 || canonicalCount !== 0) {
    throw new Error(`[post-267] ${label}: legacy=${legacyCount}, canonical=${canonicalCount}`);
  }
  return source.replace(legacy, canonical);
}

const hardener = spawnSync(process.execPath, ['scripts/harden-suspension-access-rules.mjs'], {
  encoding: 'utf8',
});
if (hardener.status !== 0) {
  throw new Error(hardener.stderr || hardener.stdout || 'Suspension hardener failed.');
}
process.stdout.write(hardener.stdout);

const packagePath = 'package.json';
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
packageJson.scripts['harden:suspension-access'] = 'node scripts/harden-suspension-access-rules.mjs';
if (!packageJson.scripts['prepare:rules'].includes('harden:suspension-access')) {
  packageJson.scripts['prepare:rules'] += ' && npm run harden:suspension-access';
}
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const regressionPath = 'test/full-system-regressions.test.mjs';
let regression = readFileSync(regressionPath, 'utf8');
regression = replaceExactly(
  regression,
  `  assert.match(rules, /allow read: if participantCanRead\\(resource\\.data\\) \\|\\| canDispatchJobs\\(\\);/);`,
  `  assert.match(rules, /allow read: if isNotSuspended\\(\\) && \\(participantCanRead\\(resource\\.data\\) \\|\\| canDispatchJobs\\(\\)\\);/);\n  assert.match(rules, /function profileAllowsAccess\\(data\\)/);\n  assert.match(rules, /data\\.get\\('status', ''\\) in \\[/);\n  assert.match(rules, /match \\/\\{subcollection\\}\\/\\{document=\\*\\*\\} \\{/);`,
  'launch regression ticket and suspension contract',
);
writeFileSync(regressionPath, regression);

const securityPath = 'test/security-rules.test.js';
let security = readFileSync(securityPath, 'utf8');
security = replaceExactly(
  security,
  `    // User profile in firestore is suspended: true\n    await setDoc(doc(adminDb, 'users/suspended_user'), { suspended: true });`,
  `    // Production suspension callables write status='suspended' before the stale token refreshes.\n    await setDoc(doc(adminDb, 'users/suspended_user'), { status: 'suspended', suspended: false });`,
  'production-shaped suspended-user fixture',
);
writeFileSync(securityPath, security);

const verifierPath = 'scripts/verify-firestore-launch-hardening.mjs';
let verifier = readFileSync(verifierPath, 'utf8');
const forbiddenAnchor = `  {\n    label: 'tickets update rule still permits direct technician claiming',\n    text: '|| safeOpenMissionClaim()',\n  },\n];`;
const forbiddenCanonical = `  {\n    label: 'tickets update rule still permits direct technician claiming',\n    text: '|| safeOpenMissionClaim()',\n  },\n  {\n    label: 'boolean-only database suspension guard',\n    text: "get(/databases/$(database)/documents/users/$(request.auth.uid)).data.get('suspended', false) != true",\n  },\n  {\n    label: 'token-only directory list suspension guard',\n    text: "allow list: if (request.auth != null && request.auth.token.get('suspended', false) != true) && (",\n  },\n  {\n    label: 'directory roles can recursively read user subcollections',\n    text: 'allow read: if (signedIn() && request.auth.uid == userId) || canReadUserDirectory();',\n  },\n];`;
verifier = replaceExactly(verifier, forbiddenAnchor, forbiddenCanonical, 'verifier forbidden suspension fragments');

const requiredAnchor = `  {\n    label: 'AI quota records are server-only',\n    text: "match /ai_usage/{usageId} {\\n      allow read: if isAdmin();\\n      allow write: if false;",\n  },\n];`;
const requiredCanonical = `  {\n    label: 'AI quota records are server-only',\n    text: "match /ai_usage/{usageId} {\\n      allow read: if isAdmin();\\n      allow write: if false;",\n  },\n  {\n    label: 'production status-aware suspension helper',\n    text: 'function profileAllowsAccess(data) {',\n  },\n  {\n    label: 'production suspension status variants',\n    text: "data.get('status', '') in [",\n  },\n  {\n    label: 'directory list checks database-backed suspension once',\n    text: 'allow list: if isNotSuspended() && (',\n  },\n  {\n    label: 'user subcollections use an isolated nested path',\n    text: 'match /{subcollection}/{document=**} {',\n  },\n  {\n    label: 'user subcollections exclude finance and operations directory roles',\n    text: 'allow read: if isNotSuspended() && ((signedIn() && request.auth.uid == userId) || isAdmin() || isHr());',\n  },\n];`;
verifier = replaceExactly(verifier, requiredAnchor, requiredCanonical, 'verifier required suspension fragments');
writeFileSync(verifierPath, verifier);

console.log('[post-267] repaired rules, emulator fixture, launch regression, package pipeline, and verifier');
