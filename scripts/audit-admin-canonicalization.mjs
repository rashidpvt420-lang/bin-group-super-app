import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const OUTPUT_DIR = resolve(ROOT, 'artifacts', 'route-consolidation');
const ADMIN_ROOT = resolve(ROOT, 'apps', 'admin-panel');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const IGNORE = new Set(['node_modules', 'build', 'dist', 'coverage', 'artifacts']);
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
const adminAppPath = resolve(ROOT, 'apps/admin-panel/src/App.tsx');
const rootAdminPath = resolve(ROOT, 'src/admin/AdminTerminal.tsx');
const navigationPath = resolve(ROOT, 'apps/admin-panel/src/components/Navigation.tsx');
const adminAppSource = existsSync(adminAppPath) ? readFileSync(adminAppPath, 'utf8') : '';
const rootAdminSource = existsSync(rootAdminPath) ? readFileSync(rootAdminPath, 'utf8') : '';
const navigationSource = existsSync(navigationPath) ? readFileSync(navigationPath, 'utf8') : '';

const routePaths = [...adminAppSource.matchAll(/<Route\b[\s\S]*?\bpath=['"]([^'"]+)['"]/g)].map((match) => match[1]);
const navigationDestinations = [...navigationSource.matchAll(/\bpath:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
const routeSet = new Set(routePaths);
const navigationSet = new Set(navigationDestinations);
const navigationMissingRoutes = [...navigationSet].filter((path) => !routeSet.has(path));
const routesMissingNavigation = [...routeSet].filter((path) => !navigationSet.has(path) && !['/', '/login', '*'].includes(path));

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

const fullAdminApplication = adminAppSource.includes('<Routes>') && routePaths.length >= 30 && adminAppSource.includes("from './components/Navigation'");
const rootIsRedirectBridge = rootAdminSource.includes('ADMIN_PANEL_URL') && rootAdminSource.includes('window.location.replace') && !rootAdminSource.includes("collection(db, 'users')");
const dashboardPath = resolve(ROOT, 'apps/admin-panel/src/pages/dashboard/DashboardPage.tsx');
const dashboardSource = existsSync(dashboardPath) ? readFileSync(dashboardPath, 'utf8') : '';
const dashboardIsEvidenceBacked = dashboardSource.includes("doc(db, 'system_health', 'admin_summaries')") && dashboardSource.includes('getCountFromServer');
const mode = fullAdminApplication ? 'canonical-full-application' : adminAppSource.includes('window.location.replace') ? 'redirect-only' : 'unknown';

const failures = [];
if (!fullAdminApplication) failures.push('Dedicated Admin App is not a complete routed application.');
if (!rootIsRedirectBridge) failures.push('Root AdminTerminal must be a redirect bridge, not a competing dashboard.');
if (!dashboardIsEvidenceBacked) failures.push('Canonical Admin dashboard must read live counts and system_health/admin_summaries.');
if (navigationMissingRoutes.length) failures.push(`Navigation links without routes: ${navigationMissingRoutes.join(', ')}`);

const report = {
  generatedAt: new Date().toISOString(),
  architecture: {
    dedicatedAdminApp: 'apps/admin-panel',
    currentDedicatedAppMode: mode,
    rootAdminBridge: 'src/admin/AdminTerminal.tsx',
    fullAdminApplication,
    rootIsRedirectBridge,
    dashboardIsEvidenceBacked,
    canonicalDecision: fullAdminApplication && rootIsRedirectBridge && dashboardIsEvidenceBacked ? 'PASS' : 'FAIL',
  },
  totals: {
    adminFiles: adminFiles.length,
    adminSourceFiles: adminSourceFiles.length,
    adminPages: adminPages.length,
    adminComponents: adminComponents.length,
    registeredRoutes: routePaths.length,
    navigationRoutes: navigationDestinations.length,
    navigationMissingRoutes: navigationMissingRoutes.length,
    routesMissingNavigation: routesMissingNavigation.length,
    pagesWithRootBasenameCandidates: pageInventory.filter((page) => page.rootCandidates.length > 0).length,
  },
  routePaths,
  navigationDestinations,
  navigationMissingRoutes,
  routesMissingNavigation,
  pageInventory,
  failures,
};

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(join(OUTPUT_DIR, 'admin-canonicalization-audit.json'), JSON.stringify(report, null, 2));
writeFileSync(join(OUTPUT_DIR, 'admin-canonicalization-audit.md'), [
  '# Admin Canonicalization Audit',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  `- Dedicated Admin mode: **${mode}**`,
  `- Root admin is redirect bridge: **${rootIsRedirectBridge}**`,
  `- Dashboard is evidence-backed: **${dashboardIsEvidenceBacked}**`,
  `- Decision: **${report.architecture.canonicalDecision}**`,
  '',
  '## Totals',
  ...Object.entries(report.totals).map(([key, value]) => `- **${key}:** ${value}`),
  '',
  '## Navigation Links Without Route',
  ...(navigationMissingRoutes.length ? navigationMissingRoutes.map((path) => `- \`${path}\``) : ['None.']),
  '',
  '## Registered Routes Not Shown In Navigation',
  ...(routesMissingNavigation.length ? routesMissingNavigation.map((path) => `- \`${path}\``) : ['None.']),
  '',
  '## Failures',
  ...(failures.length ? failures.map((failure) => `- ${failure}`) : ['None.']),
].join('\n') + '\n');

console.log(JSON.stringify({ ...report.totals, architecture: report.architecture }, null, 2));
if (failures.length) process.exit(1);
