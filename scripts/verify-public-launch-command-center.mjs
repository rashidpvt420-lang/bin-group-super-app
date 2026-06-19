import { existsSync, readFileSync } from 'node:fs';

const requiredFiles = [
  'apps/admin-panel/src/pages/admin/PublicLaunchCommandCenterPage.tsx',
  'scripts/wire-public-launch-command-center.mjs',
  'launch_package/PUBLIC_LAUNCH_EXECUTION_PLAN.md',
];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    throw new Error(`Missing public launch command center file: ${file}`);
  }
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
  'Payment/manual bank activation proof',
  'UAE data/privacy position',
  'Every-button audit',
  'Logout all dashboards',
  'Save proof record',
];

for (const token of requiredTokens) {
  if (!page.includes(token)) {
    throw new Error(`Public launch command center missing token: ${token}`);
  }
}

console.log('Public launch command center static verification passed.');
