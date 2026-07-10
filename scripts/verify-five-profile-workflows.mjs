import { existsSync, readFileSync } from 'node:fs';

const path = 'artifacts/route-consolidation/five-profile-workflow-audit.json';
if (!existsSync(path)) {
  console.error(`[five-profile] Missing ${path}. Run node scripts/audit-five-profile-workflows.mjs first.`);
  process.exit(1);
}

const report = JSON.parse(readFileSync(path, 'utf8'));
const failures = [];

for (const [profile, result] of Object.entries(report.profiles || {})) {
  if ((result.missingRequiredRoutes || []).length) failures.push(`${profile}: missing required routes ${result.missingRequiredRoutes.join(', ')}`);
  if ((result.missingRecommendedRoutes || []).length) failures.push(`${profile}: missing recommended compatibility routes ${result.missingRecommendedRoutes.join(', ')}`);
  if ((result.unregisteredPages || []).length) failures.push(`${profile}: unreachable page files ${result.unregisteredPages.join(', ')}`);

  for (const dashboard of result.dashboardEvidence || []) {
    if (!dashboard.exists) failures.push(`${profile}: dashboard missing at ${dashboard.path}`);
    if (dashboard.hardCodedSampleRisk) failures.push(`${profile}: dashboard contains hard-coded sample portfolio/financial data at ${dashboard.path}`);
    if (!dashboard.arabicAware) failures.push(`${profile}: dashboard is not connected to bilingual/RTL context at ${dashboard.path}`);
    if (dashboard.firestoreReads && !dashboard.loadingState) failures.push(`${profile}: data-backed dashboard lacks an explicit loading state at ${dashboard.path}`);
  }
}

for (const [name, value] of Object.entries(report.onboarding?.checks || {})) {
  if (Array.isArray(value) ? value.length > 0 : value !== true) {
    failures.push(`onboarding: ${name} failed${Array.isArray(value) && value.length ? ` (${value.join(', ')})` : ''}`);
  }
}

if (failures.length) {
  console.error('\nFive-profile workflow verification failed:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Five-profile workflow verification passed: routes are reachable, dashboards are bilingual and sample-free, and onboarding security/payment checks are intact.');
