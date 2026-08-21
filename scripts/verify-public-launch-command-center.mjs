import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'apps/admin-panel/src/pages/admin/PublicLaunchCommandCenterPage.tsx',
  'scripts/wire-public-launch-command-center.mjs',
  'scripts/lib/public-launch-evidence-rules.mjs',
  'scripts/record-firestore-evidence.js',
  'launch_package/PUBLIC_LAUNCH_EXECUTION_PLAN.md',
];

for (const file of requiredFiles) {
  if (!existsSync(file)) throw new Error(`Missing public launch command center file: ${file}`);
}

const page = readFileSync('apps/admin-panel/src/pages/admin/PublicLaunchCommandCenterPage.tsx', 'utf8');
const requiredTokens = [
  'launch_evidence',
  'Firebase Auth',
  'Storage upload/download/delete proof',
  'Functions live smoke test',
  'FCM / push notification proof',
  'Google Maps / GPS proof',
  'AI signed-in production proof',
  'Phase 1 Cash/Cheque activation proof',
  'Bank Transfer and Stripe remain disabled for Phase 1',
  'UAE data/privacy position',
  'Every-button audit',
  'Logout all dashboards',
  'Save proof record',
  'evidenceReadError',
  'smokeReadError',
  'EVIDENCE UNAVAILABLE',
  'allEvidenceReadable',
  'activeReleaseSha',
  'currentReleaseEvidence',
  'currentReleaseSmokeRecords',
  "item.source === 'github-actions'",
  'item.releaseSha === activeReleaseSha',
  'schemaVersion: 2',
  "source: 'admin-command-center'",
  'releaseSha',
  'workflowRunId',
  'evidenceHash',
  'canWriteEvidence',
  'canManageLaunchEvidence',
  'smokePassedCount === SIGNED_IN_SMOKE_CHECKS.length',
];
for (const token of requiredTokens) {
  if (!page.includes(token)) throw new Error(`Public launch command center missing token: ${token}`);
}
if (page.includes('Payment/manual bank activation proof')) throw new Error('Command center still advertises obsolete manual-bank Phase 1 evidence.');
if (page.includes('process.env.REACT_APP_RELEASE_SHA')) throw new Error('Command center must not trust an unscoped client build variable as active production evidence.');

const publisher = readFileSync('scripts/record-firestore-evidence.js', 'utf8');
for (const forbidden of [
  'firebase_auth_passed_20260620.png',
  'Rashid Bin Abdul Ghani',
  'Verified active authentication flow for all 5 system roles',
]) {
  if (publisher.includes(forbidden)) throw new Error(`Public launch evidence publisher contains fabricated legacy proof: ${forbidden}`);
}
for (const token of [
  '--manifest',
  '--write',
  'GITHUB_ACTIONS',
  'GITHUB_SHA',
  'GITHUB_RUN_ID',
  'GITHUB_REPOSITORY',
  "source: 'github-actions'",
  'evidenceHash',
  'EXPECTED_BACKFILL_WORKFLOW',
  'EXPECTED_BRIDGE_WORKFLOW',
]) {
  if (!publisher.includes(token)) throw new Error(`Public launch evidence publisher missing protected token: ${token}`);
}

console.log('Public launch command center exact-release fail-closed verification passed.');
