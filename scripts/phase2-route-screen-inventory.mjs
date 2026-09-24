import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, '.phase2-route-inventory');
const strict = process.argv.includes('--strict');

const ROUTERS = [
  { file: 'src/App.tsx', surface: 'consumer', prefix: '', inheritedRole: null, layout: null },
  { file: 'src/owner/OwnerApp.tsx', surface: 'consumer', prefix: '/owner', inheritedRole: 'owner', layout: 'owner-shell' },
  { file: 'src/tenant/TenantApp.tsx', surface: 'consumer', prefix: '/tenant', inheritedRole: 'tenant', layout: 'tenant-shell' },
  { file: 'src/technician/TechnicianApp.tsx', surface: 'consumer', prefix: '/technician', inheritedRole: 'technician', layout: 'technician-shell' },
  { file: 'src/broker/BrokerApp.tsx', surface: 'consumer', prefix: '/broker', inheritedRole: 'broker', layout: 'broker-shell' },
  { file: 'apps/admin-panel/src/App.tsx', surface: 'admin', prefix: '', inheritedRole: null, layout: 'admin-shell' },
];

const ADMIN_MODULE_PREFIXES = parseAdminPathModules();

const FULL_ADMIN_ROLES = parseFullAdminRoles();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function parseAdminPathModules() {
  const source = read('apps/admin-panel/src/security/staffAccessPolicy.ts');
  const block = source.match(/const\s+PATH_MODULES[^=]*=\s*\[([\s\S]*?)\n\];/);
  if (!block) throw new Error('Unable to parse canonical Admin PATH_MODULES policy.');
  const entries = [];
  for (const match of block[1].matchAll(/\{\s*prefixes:\s*\[([^\]]+)\],\s*module:\s*['"]([^'"]+)['"]\s*\}/g)) {
    const prefixes = [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((item) => item[1]);
    if (prefixes.length) entries.push([prefixes, match[2]]);
  }
  if (!entries.length) throw new Error('Canonical Admin PATH_MODULES policy parsed with zero entries.');
  return entries;
}

function parseFullAdminRoles() {
  const source = read('apps/admin-panel/src/security/staffAccessPolicy.ts');
  const match = source.match(/FULL_ADMIN_ROLES\s*=\s*new Set\(\[([^\]]+)\]\)/);
  if (!match) throw new Error('Unable to parse canonical FULL_ADMIN_ROLES policy.');
  const roles = [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((item) => item[1]);
  if (!roles.length) throw new Error('Canonical FULL_ADMIN_ROLES policy parsed with zero roles.');
  return roles;
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function normalizeSlashes(value) {
  return value.replaceAll('\\\\', '/').replace(/\/+/g, '/');
}

function fullRoute(prefix, localRoute) {
  if (!prefix) return localRoute;
  if (localRoute === '/') return prefix;
  return normalizeSlashes(prefix + (localRoute.startsWith('/') ? localRoute : '/' + localRoute));
}

function parseImports(routerFile, source) {
  const map = new Map();
  for (const match of source.matchAll(/^import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"];?/gm)) {
    map.set(match[1], match[2]);
  }
  for (const match of source.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*lazyWithRetry\(\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)\)/g)) {
    map.set(match[1], match[2]);
  }
  return map;
}

function resolveRelativeFile(fromFile, specifier) {
  if (!specifier || !specifier.startsWith('.')) return null;
  const base = normalizeSlashes(path.posix.join(path.posix.dirname(fromFile), specifier));
  const candidates = [
    base,
    base + '.tsx',
    base + '.ts',
    base + '.jsx',
    base + '.js',
    base + '.mjs',
    base + '/index.tsx',
    base + '/index.ts',
    base + '/index.jsx',
    base + '/index.js',
  ];
  return candidates.find(exists) || null;
}

function adminModuleForPath(route) {
  const clean = String(route || '/').split(/[?#]/, 1)[0] || '/';
  for (const [prefixes, moduleName] of ADMIN_MODULE_PREFIXES) {
    if (prefixes.some((prefix) => clean === prefix || clean.startsWith(prefix + '/'))) return moduleName;
  }
  return null;
}

function parseRootPermission(line) {
  if (line.includes('<Navigate')) return { role: 'redirect', permission: 'redirect' };
  if (line.includes('publicOrPilot')) return { role: 'public/pilot', permission: 'public-or-pilot-mode' };
  if (line.includes('publicAuth: true')) return { role: 'public/optional-auth', permission: 'public' };
  if (line.includes('NOTIFICATION_ROLES')) return { role: 'owner|tenant|technician|broker|admin-staff', permission: 'authenticated-role' };
  if (line.includes('ADMIN_STAFF_ROLES')) {
    if (line.includes("['owner'")) return { role: 'owner|admin-staff', permission: 'role-gated' };
    if (line.includes("'technician'")) return { role: 'owner|technician|admin-staff', permission: 'role-gated' };
    return { role: 'admin-staff', permission: 'role-gated' };
  }
  const protectedMatch = line.match(/protected(?:Owner)?Route\(\[([^\]]+)\]/);
  if (protectedMatch) {
    const roles = protectedMatch[1]
      .replace(/\.\.\.ADMIN_STAFF_ROLES/g, 'admin-staff')
      .replace(/['"\s]/g, '')
      .split(',')
      .filter(Boolean)
      .join('|');
    return { role: roles || 'authenticated', permission: 'role-gated' };
  }
  if (line.includes('withAuth(') && !line.includes('publicAuth: true')) return { role: 'authenticated', permission: 'authenticated' };
  return { role: 'public', permission: 'public' };
}

function parsePermission(router, line, route) {
  if (router.inheritedRole) return { role: router.inheritedRole, permission: 'parent-role-gate:' + router.inheritedRole };
  if (router.surface === 'consumer') return parseRootPermission(line);
  if (line.includes('<Navigate')) return { role: 'redirect', permission: 'redirect' };
  if (route === '/login' || route === '/auth-error') return { role: 'public', permission: 'public' };
  const moduleName = adminModuleForPath(route);
  if (!moduleName) return { role: FULL_ADMIN_ROLES.join('|'), permission: 'full-admin' };
  return {
    role: FULL_ADMIN_ROLES.join('|') + '|staff[module=' + moduleName + ']',
    permission: 'full-admin OR claims.modules contains ' + moduleName,
  };
}

function componentFromRouteLine(line) {
  if (line.includes('<Navigate')) return 'Navigate';
  const tags = [...line.matchAll(/<([A-Z][A-Za-z0-9_$]*)\b/g)]
    .map((match) => match[1])
    .filter((name) => !['Route','ProtectedRoute','OwnerActivationGuard','AuthenticatedShell','Layout'].includes(name));
  return tags.at(-1) || 'inline';
}

function detectDataSources(text) {
  const sources = new Set();
  for (const match of text.matchAll(/collection\(\s*(?:db|firestore)\s*,\s*['"`]([^'"`]+)['"`]/g)) sources.add('firestore:' + match[1]);
  for (const match of text.matchAll(/doc\(\s*(?:db|firestore)\s*,\s*['"`]([^'"`]+)['"`]/g)) sources.add('firestore:' + match[1]);
  for (const match of text.matchAll(/\.collection\(\s*['"`]([^'"`]+)['"`]\s*\)/g)) sources.add('firestore:' + match[1]);
  for (const match of text.matchAll(/httpsCallable\([^,]+,\s*['"`]([^'"`]+)['"`]\)/g)) sources.add('function:' + match[1]);
  for (const match of text.matchAll(/httpsCallable<[^>]+>\([^,]+,\s*['"`]([^'"`]+)['"`]\)/g)) sources.add('function:' + match[1]);
  if (/\bgetDownloadURL\s*\(|\buploadBytes\s*\(|\bref\(\s*storage\b/.test(text)) sources.add('firebase-storage');
  if (/\bfetch\s*\(/.test(text)) sources.add('http-fetch');
  if (/\baxios\.(?:get|post|put|patch|delete)\s*\(/.test(text)) sources.add('http-axios');
  if (/\bonSnapshot\s*\(/.test(text)) sources.add('firestore-realtime');
  return [...sources].sort();
}

function relatedText(file, source) {
  let combined = source;
  const imports = parseImports(file, source);
  for (const specifier of imports.values()) {
    if (!specifier.startsWith('.')) continue;
    if (!/(?:hooks|services|service|api|lib|context|firebase|repository|store)/i.test(specifier)) continue;
    const resolved = resolveRelativeFile(file, specifier);
    if (!resolved) continue;
    combined += '\n' + read(resolved);
  }
  return combined;
}

function uiEvidenceText(file, source) {
  let combined = source;
  if (!file) return combined;
  const imports = parseImports(file, source);
  for (const specifier of imports.values()) {
    if (!specifier.startsWith('.')) continue;
    const resolved = resolveRelativeFile(file, specifier);
    if (!resolved || !/\.(?:tsx|jsx)$/.test(resolved)) continue;
    const child = read(resolved);
    // Follow direct presentation wrappers without recursively traversing the whole app.
    if (source.length < 2500 || /return\s*<\s*[A-Z][A-Za-z0-9_]*/.test(source)) {
      combined += '\n' + child;
    }
  }
  return combined;
}

function hasLoading(text) {
  return /\b(?:loading|isLoading|isPending|pending)\b|CircularProgress|LinearProgress|Skeleton|Suspense|role=["']status["']/.test(text);
}

function hasAsyncRead(text) {
  return /onSnapshot\s*\(|await\s+getDocs?\s*\(|\bgetDocs?\s*\([^)]*\)\.then\s*\(|\bfetch\s*\(|axios\.(?:get|post)\s*\(/.test(text);
}

function hasCollectionState(text) {
  const arrayStates = [...text.matchAll(/const\s*\[\s*([A-Za-z_$][\w$]*)\s*,[^\]]+\]\s*=\s*(?:React\.)?useState(?:<[^;=]+>)?\(\s*\[\s*\]\s*\)/g)]
    .map((match) => match[1]);
  return arrayStates.some((name) => new RegExp('\\\\b' + name + '\\\\.(?:map|filter|length)\\\\b').test(text));
}

function isNestedRouter(text) {
  return /<Routes\b/.test(text) && /<Route\b/.test(text);
}

function hasEmpty(text) {
  return /\.length\s*===?\s*0|!\s*[A-Za-z_$][\w$.[\]]*\.length|EmptyState|empty state|no (?:data|records|results|items|tickets|properties|units|documents|payments|messages|jobs|requests|notifications|contracts|tenants|owners|technicians|commissions|referrals|leads)/i.test(text);
}

function hasError(text) {
  return /\bsetError\b|\berror\b|catch\s*(?:\([^)]*\))?\s*\{|<Alert\b|Snackbar|enqueueSnackbar|ErrorBoundary/i.test(text);
}

function hasSuccess(text) {
  return /return\s*\(|return\s*<|<Box\b|<Container\b|<main\b|<div\b/.test(text);
}

function mobileStatus(text, router) {
  if (/useMediaQuery|\bxs\s*:|\bsm\s*:|\bmd\s*:|@media|Grid\b|flexWrap|overflowX|width:\s*\{/.test(text)) return 'PASS:screen-responsive';
  if (/<Container\b[^>]*maxWidth=|\bmaxWidth\s*:\s*\d+|\bmaxWidth\s*:\s*['"][^'"]+['"]/.test(text)) return 'PASS:bounded-responsive-layout';
  if (router.layout) return 'PASS:responsive-shell';
  return 'REVIEW:no-explicit-responsive-marker';
}

function arabicStatus(text, router) {
  if (/useLanguage|\btx\s*\(|\bt\s*\(|\bisRTL\b|lang\s*===?\s*['"]ar['"]|dir=|[\u0600-\u06FF]/.test(text)) return 'PASS:screen-i18n';
  if (router.layout && router.surface === 'consumer') return 'PARTIAL:rtl-shell-only';
  if (router.surface === 'admin') return 'PARTIAL:admin-language-shell';
  return 'REVIEW:no-arabic-marker';
}

function backStatus(text, router, route) {
  if (route === '/' || route.endsWith('/dashboard')) return 'N/A:home';
  if (/navigate\(\s*-1\s*\)|history\.back\s*\(|window\.history\.back\s*\(/.test(text)) return 'PASS:screen-back';
  if (router.layout) return 'PASS:shell-navigation';
  return 'PASS:browser-back';
}

function quote(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

const firebase = JSON.parse(read('firebase.json'));
const hosting = Array.isArray(firebase.hosting) ? firebase.hosting : [];
const consumerHosting = hosting.find((item) => item.target === 'app');
const adminHosting = hosting.find((item) => item.target === 'admin');
const hasSpaRewrite = (item) => Boolean(item?.rewrites?.some((rule) => rule.source === '**' && rule.destination === '/index.html'));

const rows = [];
const failures = [];
const warnings = [];
const routeKeys = new Set();

for (const router of ROUTERS) {
  const routerSource = read(router.file);
  const imports = parseImports(router.file, routerSource);
  const routeLines = routerSource.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.includes('<Route') && line.includes('path='));

  for (const line of routeLines) {
    const pathMatch = line.match(/path=["']([^"']+)["']/);
    if (!pathMatch) continue;
    const localRoute = pathMatch[1];
    const route = fullRoute(router.prefix, localRoute);
    const component = componentFromRouteLine(line);
    const redirect = component === 'Navigate';
    const permission = parsePermission(router, line, route);
    const key = router.surface + ':' + route;

    if (routeKeys.has(key)) failures.push(key + ': duplicate registered route');
    routeKeys.add(key);

    const specifier = imports.get(component) || null;
    const externalInline = Boolean(specifier && !specifier.startsWith('.'));
    const localInline = !specifier && component !== 'inline' && routerSource.includes(component);
    const screenFile = redirect || externalInline ? null : resolveRelativeFile(router.file, specifier) || ((component === 'inline' || localInline) ? router.file : null);

    if (!redirect && !externalInline && !screenFile) failures.push(key + ': unresolved component source for ' + component);

    const screenText = externalInline ? line : (screenFile ? read(screenFile) : '');
    const combinedText = screenFile && screenFile !== router.file ? relatedText(screenFile, screenText) : screenText;
    const uiText = screenFile && screenFile !== router.file ? uiEvidenceText(screenFile, screenText) : screenText;
    const dataSources = redirect ? [] : detectDataSources(combinedText);
    const dataDriven = dataSources.length > 0;
    const nestedRouter = isNestedRouter(screenText);
    const asyncRead = !nestedRouter && hasAsyncRead(screenText);
    const collectionState = asyncRead && hasCollectionState(screenText);
    const detailLike = /:[A-Za-z_$]/.test(route) || /(?:Detail|Verification|Invite|Feedback|Activation|Profile|Settings|Error)/.test(component);

    const loadingRequired = asyncRead;
    const errorRequired = asyncRead;
    const emptyRequired = collectionState && !detailLike;

    const loading = redirect ? 'N/A:redirect' : nestedRouter ? 'N/A:nested-router' : loadingRequired ? (hasLoading(screenText) ? 'PASS' : 'MISSING') : 'N/A:not-required';
    const empty = redirect ? 'N/A:redirect' : nestedRouter ? 'N/A:nested-router' : emptyRequired ? (hasEmpty(screenText) ? 'PASS' : 'MISSING') : 'N/A:not-required';
    const error = redirect ? 'N/A:redirect' : nestedRouter ? 'N/A:nested-router' : errorRequired ? (hasError(screenText) ? 'PASS' : 'MISSING') : 'N/A:not-required';
    const success = redirect ? 'PASS:redirect' : hasSuccess(screenText) ? 'PASS' : 'REVIEW';
    const mobile = redirect ? 'PASS:redirect' : mobileStatus(uiText, router);
    const arabic = redirect ? 'PASS:redirect' : arabicStatus(uiText, router);
    const back = redirect ? 'PASS:redirect' : backStatus(screenText, router, route);
    const directUrl = router.surface === 'admin' ? (hasSpaRewrite(adminHosting) ? 'PASS' : 'FAIL') : (hasSpaRewrite(consumerHosting) ? 'PASS' : 'FAIL');
    const refresh = directUrl;

    const findings = [];
    if (loadingRequired && loading === 'MISSING') findings.push('loading');
    if (emptyRequired && empty === 'MISSING') findings.push('empty');
    if (errorRequired && error === 'MISSING') findings.push('error');
    if (mobile.startsWith('REVIEW')) findings.push('mobile-review');
    if (arabic.startsWith('REVIEW')) findings.push('arabic-review');
    if (arabic.startsWith('PARTIAL')) findings.push('arabic-shell-only');
    if (success === 'REVIEW') findings.push('success-review');
    if (directUrl === 'FAIL') findings.push('direct-url');
    if (refresh === 'FAIL') findings.push('refresh');

    if (loadingRequired && loading === 'MISSING') failures.push(key + ': async-read screen missing loading state (' + component + ')');
    if (errorRequired && error === 'MISSING') failures.push(key + ': async-read screen missing error state (' + component + ')');
    if (emptyRequired && empty === 'MISSING') failures.push(key + ': collection screen missing empty state (' + component + ')');
    if (directUrl === 'FAIL' || refresh === 'FAIL') failures.push(key + ': Firebase Hosting SPA rewrite missing');
    if (mobile.startsWith('REVIEW')) warnings.push(key + ': mobile behavior needs visual review');
    if (arabic.startsWith('REVIEW') || arabic.startsWith('PARTIAL')) warnings.push(key + ': Arabic coverage is not screen-local');

    rows.push({
      surface: router.surface,
      router: router.file,
      route,
      localRoute,
      role: permission.role,
      permission: permission.permission,
      declaredAdminOnly: router.surface === 'admin' && line.includes('adminOnly'),
      component,
      source: screenFile || (redirect ? 'redirect' : externalInline ? 'inline-external' : 'UNRESOLVED'),
      dataSource: dataSources.length ? dataSources.join(', ') : 'static/local/indirect',
      loading,
      empty,
      error,
      success,
      mobile,
      arabic,
      back,
      directUrl,
      refresh,
      findings,
    });
  }
}

if (!hasSpaRewrite(consumerHosting)) failures.push('consumer hosting: wildcard SPA rewrite to /index.html is required');
if (!hasSpaRewrite(adminHosting)) failures.push('admin hosting: wildcard SPA rewrite to /index.html is required');

fs.mkdirSync(outDir, { recursive: true });

const summary = {
  generatedAt: new Date().toISOString(),
  routeCount: rows.length,
  consumerRoutes: rows.filter((row) => row.surface === 'consumer').length,
  adminRoutes: rows.filter((row) => row.surface === 'admin').length,
  dataDrivenRoutes: rows.filter((row) => row.dataSource !== 'static/local/indirect').length,
  redirects: rows.filter((row) => row.component === 'Navigate').length,
  failures: failures.length,
  warnings: warnings.length,
};

fs.writeFileSync(path.join(outDir, 'route-screen-matrix.json'), JSON.stringify({ summary, rows, failures, warnings }, null, 2) + '\n');

const columns = ['Surface','Route','Role','Permission','Component','Source','Data source','Loading','Empty','Error','Success','Mobile','Arabic','Back','Direct URL','Refresh','Findings'];
const md = [
  '# Phase 2 — Route and Every-Screen Inventory',
  '',
  '> Generated by `scripts/phase2-route-screen-inventory.mjs`. Do not hand-maintain this matrix.',
  '',
  '- Routes: **' + summary.routeCount + '**',
  '- Consumer routes: **' + summary.consumerRoutes + '**',
  '- Admin-site routes: **' + summary.adminRoutes + '**',
  '- Data-driven routes detected: **' + summary.dataDrivenRoutes + '**',
  '- Redirects/aliases: **' + summary.redirects + '**',
  '- Strict failures: **' + summary.failures + '**',
  '- Review warnings: **' + summary.warnings + '**',
  '',
  '| ' + columns.join(' | ') + ' |',
  '| ' + columns.map(() => '---').join(' | ') + ' |',
  ...rows.map((row) => '| ' + [
    row.surface,
    row.route,
    row.role,
    row.permission + (row.declaredAdminOnly ? ' (route declares adminOnly)' : ''),
    row.component,
    row.source,
    row.dataSource,
    row.loading,
    row.empty,
    row.error,
    row.success,
    row.mobile,
    row.arabic,
    row.back,
    row.directUrl,
    row.refresh,
    row.findings.join(', ') || 'none',
  ].map(quote).join(' | ') + ' |'),
  '',
  '## Strict failures',
  '',
  ...(failures.length ? failures.map((item) => '- ' + item) : ['- None']),
  '',
  '## Review warnings',
  '',
  ...(warnings.length ? warnings.map((item) => '- ' + item) : ['- None']),
  '',
];
fs.writeFileSync(path.join(outDir, 'route-screen-matrix.md'), md.join('\n') + '\n');

console.log(JSON.stringify(summary));
console.log('Phase 2 matrix written to .phase2-route-inventory/');
if (failures.length) {
  console.error('\nPhase 2 strict failures:');
  failures.forEach((item) => console.error('- ' + item));
}
if (warnings.length) {
  console.warn('\nPhase 2 review warnings:');
  warnings.forEach((item) => console.warn('- ' + item));
}
if (strict && failures.length) process.exit(1);
