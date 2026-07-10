import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const OUTPUT_DIR = resolve(ROOT, 'artifacts', 'route-consolidation');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const normalize = (value) => value.replaceAll('\\', '/');

function walk(dir, output = []) {
  if (!existsSync(dir)) return output;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) walk(full, output);
    else if (SOURCE_EXTENSIONS.has(extname(entry))) output.push(normalize(relative(ROOT, full)));
  }
  return output;
}

const profileRoots = {
  owner: 'src/owner',
  tenant: 'src/tenant',
  technician: 'src/technician',
  broker: 'src/broker',
};

const findings = [];
const add = (severity, profile, file, rule, detail) => findings.push({ severity, profile, file, rule, detail });

for (const [profile, root] of Object.entries(profileRoots)) {
  for (const file of walk(resolve(ROOT, root))) {
    const source = readFileSync(resolve(ROOT, file), 'utf8');

    // Firestore /users collection listing is intentionally limited to Admin/HR/Ops.
    if (/collection\(\s*db\s*,\s*['"]users['"]\s*\)/.test(source)) {
      add('error', profile, file, 'no-global-user-list', `${profile} portal must use a role-scoped domain collection or individual user document, not list /users.`);
    }

    // Brokers must never browse private owner portfolio collections. They submit
    // owner-provided references which Admin matches server-side.
    if (profile === 'broker') {
      for (const collectionName of ['properties', 'owners', 'tenants', 'units']) {
        if (new RegExp(`collection\\(\\s*db\\s*,\\s*['"]${collectionName}['"]\\s*\\)`).test(source)) {
          add('error', profile, file, 'broker-private-portfolio-list', `Broker portal cannot list /${collectionName}; use attributed lead/referral records and Admin matching.`);
        }
      }
    }

    // Client-side direct set/update/delete against server-only audit collections
    // bypasses the callable addDoc compatibility bridge and will fail rules.
    if (/(?:setDoc|updateDoc|deleteDoc)\s*\(\s*doc\(\s*db\s*,\s*['"]audit_?logs['"]/.test(source)) {
      add('error', profile, file, 'server-only-audit-write', 'Use logAuditAction or the addDoc compatibility bridge for audit events.');
    }

    // Raw unfiltered snapshots on sensitive collections are almost always rejected
    // by query-aware Firestore rules. Specific domain exceptions are explicit below.
    const sensitive = ['properties', 'contracts', 'maintenanceTickets', 'payment_transactions', 'staffDocuments', 'broker_commissions'];
    for (const collectionName of sensitive) {
      const rawCollection = `collection\\(\\s*db\\s*,\\s*['"]${collectionName}['"]\\s*\\)`;
      const rawSnapshot = new RegExp(`onSnapshot\\(\\s*${rawCollection}`);
      const rawGetDocs = new RegExp(`getDocs\\(\\s*${rawCollection}`);
      if (rawSnapshot.test(source) || rawGetDocs.test(source)) {
        add('warning', profile, file, 'unfiltered-sensitive-list', `Unfiltered list access to /${collectionName} requires manual review against Firestore rules.`);
      }
    }

    if (/http:\/\/localhost:5000|127\.0\.0\.1:5000/.test(source)) {
      add('error', profile, file, 'localhost-api-fallback', 'Production portal must not depend on a nonexistent localhost REST API.');
    }
  }
}

const allowedWarnings = new Set([
  // Open mission pool is intentionally query-filtered by status in the surrounding code.
  'technician:src/technician/pages/TechnicianJobsPage.tsx:maintenanceTickets',
]);
const unresolved = findings.filter((finding) => {
  if (finding.severity === 'error') return true;
  const collectionMatch = finding.detail.match(/\/([^ ]+)/);
  const key = `${finding.profile}:${finding.file}:${collectionMatch?.[1] || ''}`;
  return !allowedWarnings.has(key);
});

const report = {
  generatedAt: new Date().toISOString(),
  scannedFiles: Object.values(profileRoots).flatMap((root) => walk(resolve(ROOT, root))).length,
  findings,
  unresolved,
  totals: {
    errors: findings.filter((finding) => finding.severity === 'error').length,
    warnings: findings.filter((finding) => finding.severity === 'warning').length,
    unresolved: unresolved.length,
  },
};

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(join(OUTPUT_DIR, 'role-firestore-access-audit.json'), JSON.stringify(report, null, 2));
writeFileSync(join(OUTPUT_DIR, 'role-firestore-access-audit.md'), [
  '# Role Firestore Access Audit',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  `- Scanned files: ${report.scannedFiles}`,
  `- Errors: ${report.totals.errors}`,
  `- Warnings: ${report.totals.warnings}`,
  `- Unresolved: ${report.totals.unresolved}`,
  '',
  '## Findings',
  ...(findings.length ? findings.map((finding) => `- **${finding.severity.toUpperCase()}** \`${finding.file}\` — ${finding.rule}: ${finding.detail}`) : ['None.']),
].join('\n') + '\n');

console.log(JSON.stringify(report.totals, null, 2));
if (unresolved.length) {
  console.error('Role Firestore access audit found unresolved access patterns.');
  process.exit(1);
}
