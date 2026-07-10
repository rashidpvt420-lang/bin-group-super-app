import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const OUTPUT_DIR = resolve(ROOT, 'artifacts', 'route-consolidation');
const ADMIN_ROOT = resolve(ROOT, 'apps', 'admin-panel');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const IGNORE = new Set(['node_modules', 'build', 'dist', 'coverage']);
const normalized = (value) => value.replaceAll('\\', '/');

function walk(dir, output = []) {
  if (!existsSync(dir)) return output;
  for (const entry of readdirSync(dir)) {
    if (IGNORE.has(entry)) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) walk(full, output);
    else output.push(normalized(relative(ROOT, full)));
  }
  return output;
}

const adminFiles = walk(ADMIN_ROOT).sort();
const adminSourceFiles = adminFiles.filter((path) => SOURCE_EXTENSIONS.has(extname(path)));
const adminPages = adminSourceFiles.filter((path) => path.startsWith('apps/admin-panel/src/pages/'));
const adminComponents = adminSourceFiles.filter((path) => path.startsWith('apps/admin-panel/src/components/'));
const rootSourceFiles = walk(resolve(ROOT, 'src')).filter((path) => SOURCE_EXTENSIONS.has(extname(path)));

const rootByBasename = new Map();
for (const path of rootSourceFiles) {
  const key = basename(path).toLowerCase();
  const group = rootByBasename.get(key) || [];
  group.push(path);
  rootByBasename.set(key, group);
}

const pageInventory = adminPages.map((path) => ({
  path,
  basename: basename(path),
  bytes: statSync(resolve(ROOT, path)).size,
  rootCandidates: rootByBasename.get(basename(path).toLowerCase()) || [],
}));

const componentInventory = adminComponents.map((path) => ({
  path,
  basename: basename(path),
  bytes: statSync(resolve(ROOT, path)).size,
  rootCandidates: rootByBasename.get(basename(path).toLowerCase()) || [],
}));

const navigationPath = resolve(ROOT, 'apps/admin-panel/src/components/Navigation.tsx');
const navigationSource = existsSync(navigationPath) ? readFileSync(navigationPath, 'utf8') : '';
const navigationDestinations = [...navigationSource.matchAll(/\bpath:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);

const historicalRouteManifest = [
  '/', '/login', '/dashboard', '/dashboard/full', '/financials', '/financials/payroll', '/transactions', '/broker',
  '/owners', '/owners/:id', '/tenants', '/control-center', '/properties/passport', '/bulk-import', '/tickets',
  '/technicians', '/technicians/map', '/sos', '/document-vault', '/audit-shield', '/reports', '/settings',
  '/manual-approvals', '/admin/payments', '/payments', '/profitability', '/compliance', '/pilot', '/ops/public',
  '/ops/whatsapp-triage', '/ops/rfq', '/ops/vendors', '/ops/data-governance', '/reports/institutional',
  '/ops/technicians', '/vault', '/orphans', '/onboard-property', '/design-studio', '/hr', '/audit',
  '/admin/pricing-matrix', '/admin/units', '/admin/unit-status', '/admin/bin-gpt-engineer',
];

const navigationOnlyRoutes = navigationDestinations.filter((path) => !historicalRouteManifest.includes(path));
const historicalOnlyRoutes = historicalRouteManifest.filter((path) => !navigationDestinations.includes(path) && path !== '/' && path !== '/login');

const likelyRouteComponent = (routePath) => {
  const words = routePath.split('/').filter(Boolean).map((part) => part.replace(/[:-].*$/, ''));
  const tokens = words.flatMap((word) => word.split('-')).filter(Boolean);
  const score = (file) => {
    const name = file.basename.toLowerCase();
    return tokens.reduce((total, token) => total + (name.includes(token.toLowerCase()) ? 1 : 0), 0);
  };
  return pageInventory
    .map((file) => ({ ...file, score: score(file) }))
    .filter((file) => file.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, 5);
};

const routeInventory = [...new Set([...historicalRouteManifest, ...navigationDestinations])].sort().map((path) => ({
  path,
  appearsInNavigation: navigationDestinations.includes(path),
  appearsInHistoricalApp: historicalRouteManifest.includes(path),
  likelyComponents: likelyRouteComponent(path),
}));

const report = {
  generatedAt: new Date().toISOString(),
  architecture: {
    dedicatedAdminApp: 'apps/admin-panel',
    currentDedicatedAppMode: 'redirect-only',
    competingUnifiedAdmin: 'src/admin/AdminTerminal.tsx',
    canonicalRecommendation: 'Restore apps/admin-panel as the only full admin application, migrate live launch evidence into its dashboard, and reduce src/admin/AdminTerminal.tsx to a redirect bridge.',
  },
  totals: {
    adminFiles: adminFiles.length,
    adminSourceFiles: adminSourceFiles.length,
    adminPages: adminPages.length,
    adminComponents: adminComponents.length,
    routesInNavigation: navigationDestinations.length,
    historicalRoutes: historicalRouteManifest.length,
    navigationOnlyRoutes: navigationOnlyRoutes.length,
    historicalOnlyRoutes: historicalOnlyRoutes.length,
    pagesWithRootBasenameCandidates: pageInventory.filter((page) => page.rootCandidates.length > 0).length,
    pagesWithoutRootBasenameCandidates: pageInventory.filter((page) => page.rootCandidates.length === 0).length,
  },
  navigationDestinations,
  historicalRouteManifest,
  navigationOnlyRoutes,
  historicalOnlyRoutes,
  routeInventory,
  pageInventory,
  componentInventory,
  adminFiles,
};

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(join(OUTPUT_DIR, 'admin-canonicalization-audit.json'), JSON.stringify(report, null, 2));

const lines = [
  '# Admin Canonicalization Audit',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  '## Architecture Decision',
  '',
  `- Dedicated admin folder: \`${report.architecture.dedicatedAdminApp}\``,
  `- Current mode: **${report.architecture.currentDedicatedAppMode}**`,
  `- Competing implementation: \`${report.architecture.competingUnifiedAdmin}\``,
  `- Recommendation: ${report.architecture.canonicalRecommendation}`,
  '',
  '## Totals',
  '',
  ...Object.entries(report.totals).map(([key, value]) => `- **${key}:** ${value}`),
  '',
  '## Navigation Routes Missing From Historical Full App',
  '',
  ...(navigationOnlyRoutes.length ? navigationOnlyRoutes.map((path) => `- \`${path}\``) : ['None.']),
  '',
  '## Historical Routes Missing From Current Navigation',
  '',
  ...(historicalOnlyRoutes.length ? historicalOnlyRoutes.map((path) => `- \`${path}\``) : ['None.']),
  '',
  '## Admin Pages Without Root Basename Candidate',
  '',
  ...pageInventory.filter((page) => page.rootCandidates.length === 0).map((page) => `- \`${page.path}\` (${page.bytes} bytes)`),
  '',
  '## Admin Pages With Competing Root Basename',
  '',
  ...pageInventory.filter((page) => page.rootCandidates.length > 0).flatMap((page) => [
    `- \`${page.path}\``,
    ...page.rootCandidates.map((candidate) => `  - Root candidate: \`${candidate}\``),
  ]),
];
writeFileSync(join(OUTPUT_DIR, 'admin-canonicalization-audit.md'), `${lines.join('\n')}\n`);

console.log(JSON.stringify(report.totals, null, 2));
