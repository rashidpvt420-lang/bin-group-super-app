import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import test from 'node:test';

const roots = [
  'src',
  'apps/admin-panel/src',
  'apps/owner-app/src',
];

const sourceExtensions = new Set(['.tsx', '.jsx']);
const ignoredDirectoryNames = new Set(['node_modules', 'dist', 'build', 'coverage']);

function walk(root) {
  const files = [];
  for (const entry of readdirSync(root)) {
    if (ignoredDirectoryNames.has(entry)) continue;
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walk(path));
    else if (sourceExtensions.has(extname(path))) files.push(path);
  }
  return files;
}

const files = roots.flatMap((root) => walk(root));

const forbidden = [
  {
    name: 'empty click handler',
    pattern: /onClick\s*=\s*\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/g,
  },
  {
    name: 'javascript no-op link',
    pattern: /href\s*=\s*["']javascript:\s*(?:void\s*\(\s*0\s*\)|;?)["']/gi,
  },
  {
    name: 'hash-only interactive link',
    pattern: /<(?:a|Link)\b[^>]*\bhref\s*=\s*["']#["'][^>]*>/gi,
  },
  {
    name: 'explicit not-connected placeholder click',
    pattern: /onClick\s*=\s*\{[^}]*\b(?:comingSoon|notConnected|notImplemented)\b[^}]*\}/gi,
  },
];

test('launch-facing React surfaces contain no obvious dead interactive controls', () => {
  const violations = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const rule of forbidden) {
      rule.pattern.lastIndex = 0;
      for (const match of source.matchAll(rule.pattern)) {
        const before = source.slice(0, match.index).split('\n');
        violations.push(`${relative('.', file)}:${before.length} ${rule.name}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Dead/placeholder launch controls must be implemented, removed, or explicitly feature-flagged:\n${violations.join('\n')}`,
  );
});