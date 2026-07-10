import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';

const root = process.cwd();
const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const ignoredDirectories = new Set(['node_modules', 'dist', 'build', 'coverage', '.git']);

function walk(directory, files = []) {
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory)) {
    if (ignoredDirectories.has(entry)) continue;
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) walk(fullPath, files);
    else if (sourceExtensions.includes(extname(entry))) files.push(normalize(fullPath));
  }
  return files;
}

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const candidate = resolve(dirname(fromFile), specifier);
  const attempts = [
    candidate,
    ...sourceExtensions.map((extension) => `${candidate}${extension}`),
    ...sourceExtensions.map((extension) => join(candidate, `index${extension}`)),
  ];
  return attempts.find((attempt) => existsSync(attempt) && statSync(attempt).isFile()) || null;
}

function importsOf(file) {
  const source = readFileSync(file, 'utf8');
  const specifiers = new Set();
  const patterns = [
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /import\(\s*["']([^"']+)["']\s*\)/g,
    /require\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.add(match[1]);
  }
  return [...specifiers];
}

function reachableFrom(entrypoints) {
  const visited = new Set();
  const queue = entrypoints.map((entry) => resolve(root, entry)).filter(existsSync);
  while (queue.length) {
    const file = normalize(queue.shift());
    if (visited.has(file)) continue;
    visited.add(file);
    for (const specifier of importsOf(file)) {
      const dependency = resolveImport(file, specifier);
      if (dependency && !visited.has(normalize(dependency))) queue.push(dependency);
    }
  }
  return visited;
}

const runtimeScopes = [
  'src/pages',
  'src/components',
  'src/owner',
  'src/tenant',
  'src/technician',
  'src/broker',
  'src/admin',
  'apps/admin-panel/src',
  'packages/shared/src',
];

const allRuntimeFiles = runtimeScopes.flatMap((scope) => walk(resolve(root, scope)));
const rootReachable = reachableFrom(['src/main.tsx']);
const adminReachable = reachableFrom(['apps/admin-panel/src/index.tsx']);
const reachable = new Set([...rootReachable, ...adminReachable]);

const unreachable = allRuntimeFiles
  .filter((file) => !reachable.has(file))
  .map((file) => relative(root, file).replaceAll('\\', '/'))
  .filter((file) => !file.includes('/__tests__/') && !/\.(test|spec)\.[jt]sx?$/.test(file))
  .sort();

const basenameGroups = new Map();
for (const file of allRuntimeFiles) {
  const basename = file.split(/[\\/]/).pop();
  const paths = basenameGroups.get(basename) || [];
  paths.push(relative(root, file).replaceAll('\\', '/'));
  basenameGroups.set(basename, paths);
}
const duplicateBasenames = [...basenameGroups.entries()]
  .filter(([, paths]) => paths.length > 1)
  .map(([basename, paths]) => ({ basename, paths: paths.sort() }))
  .sort((a, b) => a.basename.localeCompare(b.basename));

const report = {
  generatedAt: new Date().toISOString(),
  entrypoints: ['src/main.tsx', 'apps/admin-panel/src/index.tsx'],
  runtimeFileCount: allRuntimeFiles.length,
  reachableFileCount: reachable.size,
  unreachableCount: unreachable.length,
  unreachable,
  duplicateBasenameCount: duplicateBasenames.length,
  duplicateBasenames,
};

writeFileSync('runtime-architecture-audit.json', JSON.stringify(report, null, 2) + '\n');

console.log(`[runtime-architecture] runtime files=${report.runtimeFileCount}`);
console.log(`[runtime-architecture] reachable graph files=${report.reachableFileCount}`);
console.log(`[runtime-architecture] unreachable runtime files=${report.unreachableCount}`);
for (const file of unreachable) console.log(`[runtime-architecture][unreachable] ${file}`);
console.log(`[runtime-architecture] duplicate basenames=${report.duplicateBasenameCount}`);
for (const group of duplicateBasenames) console.log(`[runtime-architecture][duplicate-name] ${group.basename}: ${group.paths.join(' | ')}`);

const forbiddenUnreachable = unreachable.filter((file) =>
  file.startsWith('src/pages/') && /(?:Portal|Dashboard|TicketDetail|SOS)Page\.tsx$/.test(file)
);
if (forbiddenUnreachable.length) {
  console.error('[runtime-architecture] Unreachable legacy portal/dashboard files must be removed or routed:');
  for (const file of forbiddenUnreachable) console.error(`- ${file}`);
  process.exit(1);
}
