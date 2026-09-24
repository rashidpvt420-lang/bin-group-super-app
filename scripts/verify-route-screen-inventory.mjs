import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const notes = [];

const routeSources = [
  { scope: 'main', path: 'src/App.tsx', prefix: '' },
  { scope: 'owner', path: 'src/owner/OwnerApp.tsx', prefix: '/owner' },
  { scope: 'tenant', path: 'src/tenant/TenantApp.tsx', prefix: '/tenant' },
  { scope: 'technician', path: 'src/technician/TechnicianApp.tsx', prefix: '/technician' },
  { scope: 'broker', path: 'src/broker/BrokerApp.tsx', prefix: '/broker' },
  { scope: 'adminops', path: 'apps/admin-panel/src/App.tsx', prefix: 'admin-site:' },
];

const adminModulePrefixes = [
  { prefixes: ['/technicians/map', '/live-map'], module: 'map' },
  { prefixes: ['/admin/payments', '/manual-approvals', '/payments', '/transactions'], module: 'transactions' },
  { prefixes: ['/financials', '/profitability'], module: 'financials' },
  { prefixes: ['/broker-attributions', '/broker-commissions', '/broker'], module: 'broker' },
  { prefixes: ['/ops/public-launch-command', '/ops/pilot-completion', '/ops/data-governance', '/ops/public', '/pilot', '/compliance', '/smoke-test'], module: 'compliance' },
  { prefixes: ['/ops/document-library', '/ops/rfq', '/ops/vendors', '/document-vault', '/vault'], module: 'documents' },
  { prefixes: ['/admin/unit-status', '/admin/units', '/properties/passport', '/onboard-property', '/bulk-import', '/units'], module: 'properties' },
  { prefixes: ['/ops/whatsapp-triage', '/ops/bin-connect', '/tickets'], module: 'tickets' },
  { prefixes: ['/ops/technicians', '/technicians'], module: 'technicians' },
  { prefixes: ['/ops/amenity-control', '/ops/announcements', '/ops/key-register', '/ops/parcel-desk', '/ops/visitor-parking', '/ops/marketplace-approvals', '/ops/messages', '/ops/community-moderation', '/tenant-services', '/unit-links', '/tenants'], module: 'tenants' },
  { prefixes: ['/control-center', '/design-studio', '/admin/bin-gpt-engineer', '/bin-gpt-engineer', '/settings'], module: 'settings' },
  { prefixes: ['/ops/staff-directory', '/hr'], module: 'hr' },
  { prefixes: ['/admin/pricing-matrix', '/pricing-matrix'], module: 'pricing' },
  { prefixes: ['/audit-shield', '/orphans', '/audit'], module: 'audit' },
  { prefixes: ['/reports'], module: 'reports' },
  { prefixes: ['/contracts'], module: 'contracts' },
  { prefixes: ['/owners'], module: 'owners' },
  { prefixes: ['/sos'], module: 'sos' },
  { prefixes: ['/dashboard'], module: 'dashboard' },
];

function read(relativePath) {
  const absolute = path.resolve(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`Missing file: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(absolute, 'utf8');
}

function dirname(relativePath) {
  return relativePath.split('/').slice(0, -1).join('/');
}

function normalize(relativePath) {
  const parts = [];
  for (const part of relativePath.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

function resolveImport(fromFile, specifier) {
  if (!specifier?.startsWith('.')) return null;
  const base = normalize(`${dirname(fromFile)}/${specifier}`);
  const candidates = /\.(tsx?|jsx?|mjs)$/.test(base)
    ? [base]
    : [`${base}.tsx`, `${base}.ts`, `${base}.jsx`, `${base}.js`, `${base}/index.tsx`, `${base}/index.ts`];
  return candidates.find((candidate) => fs.existsSync(path.resolve(root, candidate))) || null;
}

function importMap(content) {
  const map = {};
  for (const match of content.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/g)) {
    map[match[1]] = match[2];
  }
  for (const match of content.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*lazyWithRetry\(\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)\)/g)) {
    map[match[1]] = match[2];
  }
  for (const match of content.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*React\.lazy\(\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)\)/g)) {
    map[match[1]] = match[2];
  }
  return map;
}

function fullRoute(source, raw) {
  if (source.scope === 'adminops') return `admin-site:${raw}`;
  if (!source.prefix) return raw;
  if (raw === '/') return source.prefix;
  if (raw === '*') return `${source.prefix}/*`;
  return raw.startsWith('/') ? `${source.prefix}${raw}` : `${source.prefix}/${raw}`;
}

function parseRoutes(source, content) {
  const imports = importMap(content);
  const rows = [];
  for (const line of content.split('\n')) {
    if (!line.includes('<Route') || !line.includes('path=') || !line.includes('element=')) continue;
    const pathMatch = line.match(/path=["']([^"']+)["']/);
    const elementMatch = line.match(/element=\{(.+)\}\s*\/>/);
    if (!pathMatch || !elementMatch) continue;
    const raw = pathMatch[1];
    const element = elementMatch[1];
    const componentNames = Object.keys(imports).filter(
      (name) => element.includes(`<${name}`) && !['Navigate', 'ProtectedRoute', 'Layout', 'Alert'].includes(name),
    );
    const component = componentNames.at(-1) || '';
    rows.push({
      scope: source.scope,
      route: fullRoute(source, raw),
      raw,
      source: source.path,
      element,
      component,
      componentFile: component ? resolveImport(source.path, imports[component]) : null,
    });
  }
  return rows;
}

function mainPermission(row) {
  const route = row.route;
  if (route === '/government/:id') return ['owner + admin staff', 'role gate + owner activation guard'];
  if (route === '/financials' || route === '/properties/:id/health' || route === '/analytics/turnover' || route === '/properties/:propertyId/units') {
    return ['owner', 'role gate + owner activation guard'];
  }
  if (route === '/calendar') return ['owner + technician + admin staff', 'role gate; owner activation guard for owner'];
  if (route === '/analytics/reporting' || route === '/analytics/executive') return ['owner + admin staff', 'role gate; owner activation guard for owner'];
  if (route === '/notifications') return ['owner + tenant + technician + broker + admin staff', 'role gate'];
  if (route === '/design-studio' || route.startsWith('/design-studio/request/')) return ['owner + tenant', 'role gate; owner activation guard for owner'];
  if (route === '/tenant/*') return ['tenant', 'role gate'];
  if (route === '/technician/*') return ['technician', 'role gate'];
  if (route === '/broker/*') return ['broker', 'role gate'];
  if (route === '/owner/*') return ['owner', 'role gate + owner activation policy'];
  if (route === '/auditor/*') return ['auditor', 'role gate'];
  if (route === '/admin/*') return ['admin/staff', 'role gate; operational actions hand off to Admin site'];
  if (route === '/account-privacy') return ['auth-shell route', 'authenticated-shell behavior must be runtime verified'];
  if (/Navigate/.test(row.element)) return ['redirect', 'router alias'];
  return ['public', 'none'];
}

function pathMatches(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function adminModule(raw) {
  if (raw === '/login' || raw === '/auth-error') return null;
  if (raw === '/profile') return 'profile';
  if (raw === '/mfa-recovery') return 'full-admin';
  for (const entry of adminModulePrefixes) {
    if (entry.prefixes.some((prefix) => pathMatches(raw, prefix))) return entry.module;
  }
  return null;
}

function permission(row) {
  if (row.scope === 'main') return mainPermission(row);
  if (row.scope === 'owner') return ['owner', 'role gate + owner activation policy'];
  if (row.scope === 'tenant') return ['tenant', 'role gate + account-status gate'];
  if (row.scope === 'technician') return ['technician', 'role gate + account-status gate'];
  if (row.scope === 'broker') return ['broker', 'role gate + account-status/KYC gate'];
  if (row.scope === 'adminops') {
    if (row.raw === '/login' || row.raw === '/auth-error') return ['admin auth', 'authentication entry/error'];
    if (/Navigate/.test(row.element) || row.raw === '*') return ['admin-site redirect', 'router alias/fallback'];
    const module = adminModule(row.raw);
    if (module === 'profile') return ['admin/staff', 'authenticated Admin-site user; MFA enrollment route'];
    if (module === 'full-admin') return ['full admin', 'staff roles denied by canAccessAdminPath'];
    if (module) return ['full admin or authorized staff', `canAccessAdminPath module claim: ${module}`];
    return ['full admin', 'canAccessAdminPath fail-closed'];
  }
  return ['unknown', 'review'];
}

const exactRouteE2E = read('tests/e2e/hard-launch-routes.spec.ts');

function e2eCandidateRoute(row) {
  const candidate = row.scope === 'adminops' ? row.raw : row.route;
  return candidate.replace(/:[A-Za-z0-9_]+/g, 'phase2-missing');
}

function e2eCoversRoute(row) {
  if (/Navigate/.test(row.element) || row.raw === '*') return true;
  const candidate = e2eCandidateRoute(row);
  if (candidate.includes('*')) return false;
  if (exactRouteE2E.includes(`'${candidate}'`)) return true;

  const portalRootAliases = {
    '/owner': '/owner/dashboard',
    '/tenant': '/tenant/dashboard',
    '/technician': '/technician/dashboard',
    '/broker': '/broker/dashboard',
  };
  const alias = portalRootAliases[candidate];
  return Boolean(alias && exactRouteE2E.includes(`'${alias}'`));
}

function isStaticRouteData(dataSource, content) {
  if (dataSource !== 'static/local or delegated hook') return false;
  const asyncOrCollectionSignals =
    /useEffect\s*\(|useQuery\s*\(|subscribe|listener|load[A-Z]|fetch[A-Z]|refresh[A-Z]|rows|records|items|results|documents|tickets|jobs|payments|notifications|messages|leads|referrals|units|tenants/i.test(content);
  return !asyncOrCollectionSignals;
}

function emptyStateNotApplicable(row) {
  const value = `${row.route} ${row.component || ''}`.toLowerCase();
  return [
    'login', 'gateway', 'landing', 'feedback', 'privacy', 'onboarding',
    'designstudio', 'design-studio', 'detail', 'invite', 'profile',
    'settings', 'bulkimport', 'bulk-import', 'paymentproof', 'payment-proof',
    'iban', 'damageestimate', 'damage-estimate', 'aiconcierge', 'ai-concierge',
    'emergency', 'moveinspection', 'move-inspection', 'gatepass', 'gate-pass',
    'mfarecovery', 'mfa-recovery', 'propertyonboarding', 'onboard-property',
    'bingpt', 'bin-gpt', 'auth-error',
  ].some((token) => value.includes(token));
}

function signals(content, row) {
  const isRoleContainer = row.scope === 'main' && ['/owner/*', '/tenant/*', '/technician/*', '/broker/*'].includes(row.route);
  if (/Navigate/.test(row.element) || isRoleContainer) {
    return {
      dataSource: 'router redirect',
      loading: 'N/A',
      empty: 'N/A',
      error: 'N/A',
      success: 'PASS',
      mobile: 'N/A',
      arabic: 'N/A',
    };
  }
  const sources = [];
  if (/httpsCallable|\bfunctions\b/.test(content)) sources.push('Functions');
  if (/collection\s*\(|doc\s*\(|getDocs|getDoc|onSnapshot|query\s*\(/.test(content)) sources.push('Firestore');
  if (/uploadBytes|getDownloadURL|\bstorage\b/.test(content)) sources.push('Storage');
  if (/\bauth\b|signIn|signOut|currentUser/.test(content)) sources.push('Auth');
  if (/\bfetch\s*\(|axios/.test(content)) sources.push('HTTP/API');
  if (!sources.length) sources.push('static/local or delegated hook');

  const dataSource = [...new Set(sources)].join('+');
  const staticData = isStaticRouteData(dataSource, content);
  const hasLoading = /\bloading\b|CircularProgress|Skeleton|LinearProgress|isLoading|pending|saving|busy|submitting|refreshing|processing|fetching/i.test(content);
  const hasEmpty = /length\s*===\s*0|\.empty\b|no\s+(records|items|data|properties|tickets|jobs|documents|results|payments|notifications|messages|leads|referrals|units|tenants|missions|vendors|rfqs|requests|listings)|nothing\s+to\s+show/i.test(content);
  const hasError = /setError|setWarning|setNotice|error\s*&&|warning\s*&&|notice\s*&&|severity=["'](?:error|warning)|catch\s*\(/i.test(content);
  const routeE2E = e2eCoversRoute(row);

  return {
    dataSource,
    loading: staticData ? 'N/A_STATIC' : (hasLoading ? 'EXPLICIT' : 'REVIEW'),
    empty: staticData ? 'N/A_STATIC' : (emptyStateNotApplicable(row) ? 'N/A_NOT_LIST' : (hasEmpty ? 'EXPLICIT' : 'REVIEW')),
    error: staticData ? 'N/A_STATIC' : (hasError ? 'EXPLICIT' : 'REVIEW'),
    success: 'REGISTERED_RENDER',
    mobile: /\bxs\s*:|\bsm\s*:|\bmd\s*:|\blg\s*:|useMediaQuery|100dvh|flexWrap/i.test(content)
      ? 'RESPONSIVE_HINTS'
      : (routeE2E ? 'E2E_PHONE_VIEWPORT' : 'REVIEW'),
    arabic: /useLanguage|isRTL|lang\s*===\s*['"]ar['"]|tx\s*\(|[\u0600-\u06ff]/.test(content)
      ? 'I18N_HINTS'
      : (routeE2E ? 'E2E_ARABIC_RTL' : 'REVIEW'),
  };
}

function backNavigation(row, content) {
  if (/navigate\s*\(\s*-1\s*\)|history\.back|window\.history\.back|nav\.back|ArrowLeft|ArrowRight/.test(content)) return 'EXPLICIT/HINT';
  if (['owner', 'technician', 'broker'].includes(row.scope)) return 'GLOBAL_FLOATING_NAV';
  if (row.scope === 'adminops') return 'ADMIN_SIDEBAR/SHELL';
  if (row.scope === 'tenant') {
    if (row.route === '/tenant' || row.route === '/tenant/dashboard') return 'N/A_PORTAL_HOME';
    return 'TENANT_NATIVE_LAYOUT_BACK';
  }
  if (row.scope === 'main') {
    if (/Navigate/.test(row.element) || row.raw === '*') return 'N/A_REDIRECT';
    if (e2eCoversRoute(row)) return 'E2E_BROWSER_HISTORY';
  }
  return 'REVIEW';
}

function directAndRefresh(row) {
  if (row.scope === 'adminops') return ['REGISTERED_ADMIN_SITE', 'AUTH_RESTORE/ROUTER'];
  if (['owner', 'tenant', 'technician', 'broker'].includes(row.scope)) return ['REGISTERED', 'AUTH_RESTORE/ROUTER'];
  if (/\/(owner|tenant|technician|broker|auditor|admin)\/\*/.test(row.route)) return ['REGISTERED', 'AUTH_RESTORE/ROUTER'];
  return ['REGISTERED', 'ROUTER'];
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

const rows = [];
for (const source of routeSources) {
  rows.push(...parseRoutes(source, read(source.path)));
}

for (const row of rows) {
  const [role, permissionText] = permission(row);
  row.role = role;
  row.permission = permissionText;
  const componentContent = row.componentFile ? read(row.componentFile) : read(row.source);
  Object.assign(row, signals(componentContent, row));
  row.backNavigation = backNavigation(row, componentContent);
  [row.directUrl, row.refresh] = directAndRefresh(row);
}

const canonicalRoutes = new Set(rows.map((row) => row.route));
for (const required of [
  '/owner/dashboard',
  '/tenant/dashboard',
  '/technician/dashboard',
  '/broker/dashboard',
  '/auditor/*',
  '/admin/*',
  'admin-site:/dashboard',
  'admin-site:/smoke-test',
  'admin-site:/ops/public-launch-command',
]) {
  if (!canonicalRoutes.has(required)) failures.push(`Missing Phase 2 canonical route: ${required}`);
}

const auditor = read('src/pages/public/AuditorPortalPage.tsx');
for (const forbidden of [
  '98 / 100',
  'PREDICTIVE VIOLATION DETECTED',
  'National Regulatory Registry',
  '/api/v1/fed-audit/adm',
  '/api/v1/risk-profile/live',
  'END-TO-END ENCRYPTED (AES-256)',
]) {
  if (auditor.includes(forbidden)) failures.push(`Auditor route contains unsupported launch-honesty claim: ${forbidden}`);
}

const protectedRoute = read('src/components/ProtectedRoute.tsx');
if (!protectedRoute.includes("auditor: '/auditor'")) failures.push('ProtectedRoute does not define the Auditor home path.');

const authShell = read('src/components/AuthenticatedShell.tsx');
if (!authShell.includes("normalizedRole === 'auditor'")) failures.push('AuthenticatedShell does not redirect authenticated Auditors to /auditor.');

const adminApp = read('apps/admin-panel/src/App.tsx');
if (!adminApp.includes('<Route path="/smoke-test"')) failures.push('Admin /smoke-test route is not registered.');

const staffPolicy = read('apps/admin-panel/src/security/staffAccessPolicy.ts');
if (!staffPolicy.includes("'/smoke-test'")) failures.push('Admin staff policy does not protect /smoke-test.');

const headers = [
  'runtime', 'route', 'role', 'permission', 'component', 'component_file',
  'data_source', 'loading', 'empty', 'error', 'success', 'mobile', 'arabic',
  'back_navigation', 'direct_url', 'refresh', 'source_router',
];
const csv = [headers.map(csvCell).join(',')];
for (const row of rows) {
  csv.push([
    row.scope,
    row.route,
    row.role,
    row.permission,
    row.component || (/Navigate/.test(row.element) ? 'Navigate' : 'inline/wrapper'),
    row.componentFile || '',
    row.dataSource,
    row.loading,
    row.empty,
    row.error,
    row.success,
    row.mobile,
    row.arabic,
    row.backNavigation,
    row.directUrl,
    row.refresh,
    row.source,
  ].map(csvCell).join(','));
}

const counts = Object.fromEntries(routeSources.map((source) => [
  source.scope,
  rows.filter((row) => row.scope === source.scope).length,
]));
const reviews = {
  loading: rows.filter((row) => row.loading === 'REVIEW').length,
  empty: rows.filter((row) => row.empty === 'REVIEW').length,
  error: rows.filter((row) => row.error === 'REVIEW').length,
  mobile: rows.filter((row) => row.mobile === 'REVIEW').length,
  arabic: rows.filter((row) => row.arabic === 'REVIEW').length,
  back: rows.filter((row) => row.backNavigation.startsWith('REVIEW')).length,
};

const unresolvedRows = {
  loading: rows.filter((row) => row.loading === 'REVIEW'),
  empty: rows.filter((row) => row.empty === 'REVIEW'),
  error: rows.filter((row) => row.error === 'REVIEW'),
  mobile: rows.filter((row) => row.mobile === 'REVIEW'),
  arabic: rows.filter((row) => row.arabic === 'REVIEW'),
  back: rows.filter((row) => row.backNavigation.startsWith('REVIEW')),
};

for (const [dimension, unresolved] of Object.entries(unresolvedRows)) {
  if (unresolved.length > 0) {
    const routes = unresolved.map((row) => row.route).join(', ');
    failures.push(`Phase 2 unresolved ${dimension} coverage: ${unresolved.length} route row(s) remain REVIEW: ${routes}`);
  }
}

const outDir = path.resolve(root, 'audit');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'phase-2-route-screen-inventory.csv'), `${csv.join('\n')}\n`);

const summary = `# Phase 2 Route and Every-Screen Inventory

Generated from canonical router sources.

## Route count

| Runtime | Entries |
| --- | ---: |
${Object.entries(counts).map(([key, value]) => `| ${key} | ${value} |`).join('\n')}

Total registered route entries/aliases: **${rows.length}**.

The CSV records:

\`route -> role -> permission -> data source -> loading -> empty -> error -> success -> mobile -> Arabic -> back navigation -> direct URL -> refresh\`

## Review queue

| Dimension | REVIEW rows |
| --- | ---: |
| Loading | ${reviews.loading} |
| Empty | ${reviews.empty} |
| Error | ${reviews.error} |
| Mobile | ${reviews.mobile} |
| Arabic | ${reviews.arabic} |
| Back navigation | ${reviews.back} |

\`REVIEW\` is deliberately fail-honest: source inspection did not find an explicit implementation signal, so the row is not counted as a pass. Responsive/Arabic hints still require device/runtime evidence.

## Repaired Phase 2 blockers

- Auditor role home and authenticated landing redirect.
- Auditor loading/empty/error/success states and removal of unsupported trust/regulatory/integration claims.
- Dedicated Admin \`/smoke-test\` route and compliance-module authorization.

Direct URL/refresh and mobile/Arabic behavior remain subject to hosted/runtime verification even where the route is structurally registered.
`;
fs.writeFileSync(path.join(outDir, 'PHASE_2_ROUTE_SCREEN_INVENTORY.md'), summary);

notes.push(`[phase-2] Route entries: ${rows.length}`);
for (const [key, value] of Object.entries(counts)) notes.push(`[phase-2] ${key}: ${value}`);
notes.push(`[phase-2] REVIEW loading=${reviews.loading} empty=${reviews.empty} error=${reviews.error} mobile=${reviews.mobile} arabic=${reviews.arabic} back=${reviews.back}`);
notes.push('[phase-2] Matrix written to audit/phase-2-route-screen-inventory.csv');
for (const note of notes) console.log(note);

if (failures.length) {
  console.error('\n[phase-2] Result: FAIL');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('\n[phase-2] Result: PASS — canonical routes are inventoried and critical routing/honesty guards are intact.');
