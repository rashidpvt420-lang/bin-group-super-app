import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const selfPath = 'scripts/repo-hygiene-guard.mjs';
const ignoredDirs = new Set(['.git', 'node_modules', 'dist', 'build', 'admin-build', '.firebase', '.netlify', 'coverage']);
const checkedExtensions = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json', '.yml', '.yaml', '.rules', '.html', '.css', '.scss', '.ps1', '.bat'
]);

const conflictPrefixes = [
  '<'.repeat(7),
  '='.repeat(7),
  '>'.repeat(7),
];

const branchResidueNeedles = [
  ['stabilize', 'fast', 'startup'].join('-'),
  ['theme', 'token', 'compat'].join('-'),
  ['fix', 'security', 'rbac', 'rules', 'hardening'].join('/'),
];

const suspiciousStandaloneWords = new Set(['main']);
const violations = [];

function relative(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

function shouldCheck(filePath) {
  const rel = relative(filePath);
  if (rel === selfPath) return false;
  if (rel === 'package-lock.json') return true;
  return checkedExtensions.has(path.extname(filePath));
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!entry.isFile() || !shouldCheck(fullPath)) continue;
    inspectFile(fullPath);
  }
}

function inspectFile(filePath) {
  const rel = relative(filePath);
  const content = fs.readFileSync(filePath, 'utf8');

  if (rel === 'package-lock.json') {
    const trimmedFile = content.trim();
    if (trimmedFile === '{}' || trimmedFile.length < 100) {
      violations.push(`${rel}: invalid placeholder package-lock.json detected. Delete it or generate a real workspace lockfile.`);
    }
  }

  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (conflictPrefixes.some((prefix) => trimmed.startsWith(prefix))) {
      violations.push(`${rel}:${index + 1}: unresolved merge conflict marker found.`);
    }

    for (const needle of branchResidueNeedles) {
      if (trimmed === needle) {
        violations.push(`${rel}:${index + 1}: branch-name residue found in source.`);
      }
    }

    if (suspiciousStandaloneWords.has(trimmed)) {
      violations.push(`${rel}:${index + 1}: suspicious standalone token "${trimmed}" found. This often indicates merge residue.`);
    }
  });
}

walk(root);

if (violations.length) {
  console.error('\nRepository hygiene guard failed:\n');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  console.error('\nFix these repository-level issues before running build/deploy workflows.\n');
  process.exit(1);
}

console.log('Repository hygiene guard passed.');
