import { existsSync, readFileSync } from 'node:fs';

const auditPath = 'artifacts/route-consolidation/duplicate-route-audit.json';
if (!existsSync(auditPath)) {
  console.error(`[duplicate-resolution] Missing ${auditPath}. Run npm run audit:duplicates first.`);
  process.exit(1);
}

const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
const failures = [];
const allowedSamePurpose = new Map([
  ['login', 'Dedicated Admin login wrapper + unified public login are separate application boundaries.'],
  ['owner', 'Owner Simple Mode and Advanced Dashboard are intentional distinct routes.'],
  ['tenant', 'Tenant Simple Mode and Advanced Dashboard are intentional distinct routes.'],
  ['technician', 'Technician Simple Mode and Advanced Dashboard are intentional distinct routes.'],
  ['broker', 'Broker Simple Mode and Advanced Dashboard are intentional distinct routes.'],
  ['profitability', 'Legacy financial route is a compatibility alias to the live CFO implementation.'],
  ['companyprofile', 'Company profile data/config module and rendered public page have different responsibilities.'],
  ['index', 'Application entrypoint and shared package barrel are separate boundaries.'],
  ['turnoverengine', 'Turnover page renders the canonical turnover calculation engine.'],
]);

if ((audit.routeCollisions || []).length) failures.push(`${audit.routeCollisions.length} same-router route collision(s) remain.`);
if ((audit.exactContentDuplicates || []).length) failures.push(`${audit.exactContentDuplicates.length} exact duplicate implementation group(s) remain.`);
if ((audit.normalizedContentDuplicates || []).length) failures.push(`${audit.normalizedContentDuplicates.length} normalized duplicate implementation group(s) remain.`);
if ((audit.legacyOwnerAllFiles || []).length) failures.push(`Legacy Owner workspace still contains ${audit.legacyOwnerAllFiles.length} file(s).`);

const unresolved = (audit.samePurposeCandidates || []).filter((candidate) => !allowedSamePurpose.has(candidate.purpose));
if (unresolved.length) {
  failures.push(`Unresolved same-purpose groups: ${unresolved.map((candidate) => candidate.purpose).join(', ')}`);
}

const report = {
  routeCollisions: (audit.routeCollisions || []).length,
  exactDuplicateGroups: (audit.exactContentDuplicates || []).length,
  normalizedDuplicateGroups: (audit.normalizedContentDuplicates || []).length,
  legacyOwnerFiles: (audit.legacyOwnerAllFiles || []).length,
  allowedSamePurposeGroups: (audit.samePurposeCandidates || []).filter((candidate) => allowedSamePurpose.has(candidate.purpose)).map((candidate) => ({
    purpose: candidate.purpose,
    reason: allowedSamePurpose.get(candidate.purpose),
    files: candidate.files.map((file) => file.path),
  })),
  unresolvedSamePurposeGroups: unresolved.map((candidate) => ({ purpose: candidate.purpose, files: candidate.files.map((file) => file.path) })),
};

console.log(JSON.stringify(report, null, 2));

if (failures.length) {
  console.error('\n[duplicate-resolution] Verification failed:\n');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[duplicate-resolution] Passed. No competing route or implementation remains outside the documented intentional architecture.');
