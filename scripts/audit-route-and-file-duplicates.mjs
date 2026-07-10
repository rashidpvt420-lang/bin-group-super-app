import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, normalize, relative, resolve } from 'node:path';

const ROOT = process.cwd();
const OUTPUT_DIR = resolve(ROOT, 'artifacts', 'route-consolidation');
const SOURCE_ROOTS = ['src', 'apps', 'packages'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const IGNORE_DIRS = new Set(['node_modules', 'build', 'dist', 'coverage', '.git', '.firebase', 'android', 'ios']);

const normalizePath = (path) => path.replaceAll('\\', '/');
const routeContext = (path) => {
  if (path === 'src/App.tsx') return 'unified-root';
  if (path === 'src/owner/OwnerApp.tsx') return 'unified-owner';
  if (path === 'src/tenant/TenantApp.tsx') return 'unified-tenant';
  if (path === 'src/technician/TechnicianApp.tsx') return 'unified-technician';
  if (path === 'src/broker/BrokerApp.tsx') return 'unified-broker';
  if (path.startsWith('apps/admin-panel/')) return 'dedicated-admin';
  if (path.startsWith('apps/owner-app/')) return 'legacy-owner-workspace';
  return 'other';
};

function walk(dir, output = []) {
  if (!existsSync(dir)) return output;
  for (const entry of readdirSync(dir)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) walk(full, output);
    else if (SOURCE_EXTENSIONS.has(extname(entry))) output.push(normalizePath(relative(ROOT, full)));
  }
  return output;
}

const files = SOURCE_ROOTS.flatMap((root) => walk(resolve(ROOT, root))).sort();
const fileRecords = files.map((path) => {
  const source = readFileSync(resolve(ROOT, path), 'utf8').replace(/\r\n/g, '\n');
  const contentHash = createHash('sha256').update(source.trim()).digest('hex');
  const normalizedHash = createHash('sha256')
    .update(source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ').trim())
    .digest('hex');
  return {
    path,
    source,
    bytes: Buffer.byteLength(source),
    basename: basename(path),
    contentHash,
    normalizedHash,
    context: routeContext(path),
  };
});

function importedSymbols(source) {
  const map = new Map();
  const patterns = [
    /import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/g,
    /const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:React\.)?lazy\(\s*\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) map.set(match[1], match[2]);
  }
  return map;
}

function routeEntries(record) {
  const routes = [];
  const importMap = importedSymbols(record.source);
  const routeRegex = /<Route\b([\s\S]*?)\/?>(?=\s*<|\s*\{|\s*\)|\s*$)/g;
  let match;
  while ((match = routeRegex.exec(record.source))) {
    const attrs = match[1];
    const pathMatch = attrs.match(/\bpath\s*=\s*(?:['"]([^'"]+)['"]|\{\s*['"]([^'"]+)['"]\s*\})/);
    if (!pathMatch) continue;
    const path = pathMatch[1] || pathMatch[2];
    const componentMatch = attrs.match(/\belement\s*=\s*\{\s*<([A-Za-z_$][\w$]*)/) || attrs.match(/\bComponent\s*=\s*\{?([A-Za-z_$][\w$]*)/);
    const component = componentMatch?.[1] || null;
    routes.push({
      path,
      normalizedPath: path.replace(/\/+$/, '') || '/',
      component,
      importSource: component ? importMap.get(component) || null : null,
      routerFile: record.path,
      context: record.context,
      index: routes.length,
    });
  }
  return routes;
}

const routes = fileRecords.flatMap(routeEntries);
const byContextAndPath = new Map();
for (const route of routes) {
  const key = `${route.context}::${route.normalizedPath}`;
  const group = byContextAndPath.get(key) || [];
  group.push(route);
  byContextAndPath.set(key, group);
}
const routeCollisions = [...byContextAndPath.entries()]
  .filter(([, group]) => group.length > 1)
  .map(([key, group]) => ({ key, routes: group }));

const byGlobalPath = new Map();
for (const route of routes) {
  const group = byGlobalPath.get(route.normalizedPath) || [];
  group.push(route);
  byGlobalPath.set(route.normalizedPath, group);
}
const crossRouterDuplicates = [...byGlobalPath.entries()]
  .filter(([, group]) => new Set(group.map((route) => route.context)).size > 1)
  .map(([path, group]) => ({ path, routes: group }));

const groupBy = (items, keyOf) => {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }
  return [...groups.entries()].filter(([, group]) => group.length > 1);
};

const exactContentDuplicates = groupBy(fileRecords, (record) => record.contentHash)
  .map(([hash, group]) => ({ hash, files: group.map(({ path, bytes, context }) => ({ path, bytes, context })) }));
const normalizedContentDuplicates = groupBy(fileRecords, (record) => record.normalizedHash)
  .filter(([hash]) => !exactContentDuplicates.some((entry) => entry.hash === hash))
  .map(([hash, group]) => ({ hash, files: group.map(({ path, bytes, context }) => ({ path, bytes, context })) }));
const duplicateBasenames = groupBy(fileRecords, (record) => record.basename.toLowerCase())
  .map(([name, group]) => ({ name, files: group.map(({ path, bytes, context }) => ({ path, bytes, context })) }))
  .sort((a, b) => b.files.length - a.files.length || a.name.localeCompare(b.name));

const PURPOSE_NOISE = /(simple|resolved|full|legacy|modern|new|old|standalone|unified|portal|page|screen|view|component|dashboard)/gi;
const purposeKey = (record) => record.basename
  .replace(/\.(tsx?|jsx?)$/i, '')
  .replace(PURPOSE_NOISE, '')
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase();
const samePurposeCandidates = groupBy(fileRecords.filter((record) => purposeKey(record).length >= 4), purposeKey)
  .map(([purpose, group]) => ({ purpose, files: group.map(({ path, basename: name, bytes, context }) => ({ path, name, bytes, context })) }))
  .filter((entry) => new Set(entry.files.map((file) => file.name.toLowerCase())).size > 1)
  .sort((a, b) => b.files.length - a.files.length || a.purpose.localeCompare(b.purpose));

const legacyOwnerFiles = fileRecords.filter((record) => record.path.startsWith('apps/owner-app/'));
const unifiedOwnerFiles = fileRecords.filter((record) => record.path.startsWith('src/owner/') || record.path.startsWith('src/pages/Owner') || record.path.startsWith('src/components/owner/'));
const ownerWorkspaceOverlap = [];
for (const legacy of legacyOwnerFiles) {
  const stem = legacy.basename.replace(/\.(tsx?|jsx?)$/i, '').toLowerCase();
  const matches = unifiedOwnerFiles.filter((candidate) => candidate.basename.replace(/\.(tsx?|jsx?)$/i, '').toLowerCase() === stem);
  if (matches.length) ownerWorkspaceOverlap.push({ legacy: legacy.path, unified: matches.map((match) => match.path) });
}

const report = {
  generatedAt: new Date().toISOString(),
  totals: {
    sourceFiles: fileRecords.length,
    routes: routes.length,
    routeCollisions: routeCollisions.length,
    crossRouterDuplicatePaths: crossRouterDuplicates.length,
    exactDuplicateGroups: exactContentDuplicates.length,
    normalizedDuplicateGroups: normalizedContentDuplicates.length,
    duplicateBasenameGroups: duplicateBasenames.length,
    samePurposeCandidateGroups: samePurposeCandidates.length,
    ownerWorkspaceOverlapGroups: ownerWorkspaceOverlap.length,
  },
  routeCollisions,
  crossRouterDuplicates,
  exactContentDuplicates,
  normalizedContentDuplicates,
  duplicateBasenames,
  samePurposeCandidates,
  ownerWorkspaceOverlap,
  routes,
};

mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(join(OUTPUT_DIR, 'duplicate-route-audit.json'), JSON.stringify(report, null, 2));

const lines = [
  '# Route and Duplicate Implementation Audit',
  '',
  `Generated: ${report.generatedAt}`,
  '',
  '## Totals',
  '',
  ...Object.entries(report.totals).map(([key, value]) => `- **${key}:** ${value}`),
  '',
  '## Active Route Collisions',
  '',
  ...(routeCollisions.length ? routeCollisions.flatMap((entry) => [
    `### ${entry.key}`,
    ...entry.routes.map((route) => `- \`${route.routerFile}\` → \`${route.component || 'inline/unknown'}\` (${route.importSource || 'no import resolved'})`),
    '',
  ]) : ['None.', '']),
  '## Cross-Router Duplicate Paths',
  '',
  ...(crossRouterDuplicates.length ? crossRouterDuplicates.flatMap((entry) => [
    `### ${entry.path}`,
    ...entry.routes.map((route) => `- ${route.context}: \`${route.routerFile}\` → \`${route.component || 'inline/unknown'}\``),
    '',
  ]) : ['None.', '']),
  '## Legacy Owner Workspace Overlap',
  '',
  ...(ownerWorkspaceOverlap.length ? ownerWorkspaceOverlap.flatMap((entry) => [
    `- Legacy: \`${entry.legacy}\``,
    ...entry.unified.map((path) => `  - Unified candidate: \`${path}\``),
  ]) : ['None.']),
  '',
  '## Exact Duplicate Content',
  '',
  ...(exactContentDuplicates.length ? exactContentDuplicates.flatMap((entry) => entry.files.map((file) => `- \`${file.path}\``).concat('')) : ['None.']),
  '',
  '## Same-Purpose Candidates',
  '',
  ...(samePurposeCandidates.length ? samePurposeCandidates.slice(0, 100).flatMap((entry) => [
    `### ${entry.purpose}`,
    ...entry.files.map((file) => `- \`${file.path}\` (${file.context}, ${file.bytes} bytes)`),
    '',
  ]) : ['None.']),
];
writeFileSync(join(OUTPUT_DIR, 'duplicate-route-audit.md'), `${lines.join('\n')}\n`);

console.log(JSON.stringify(report.totals, null, 2));
console.log(`Audit written to ${normalizePath(relative(ROOT, OUTPUT_DIR))}`);

if (routeCollisions.length > 0) {
  console.error('Duplicate route paths exist inside the same active router context.');
  process.exit(1);
}
