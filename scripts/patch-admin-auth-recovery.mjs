import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = resolve(repoRoot, 'apps/admin-panel/src/App.tsx');
let source = readFileSync(path, 'utf8');

const start = source.indexOf('    if (error && !isAuthenticated) {');
const endMarker = '    return (\n        <Routes>';
const end = source.indexOf(endMarker, start);

if (start === -1 || end === -1) {
  if (source.includes('Auth error surfaced to login form')) {
    console.log('Admin auth recovery already patched.');
    process.exit(0);
  }
  throw new Error('Admin auth recovery patch target not found.');
}

const replacement = "    if (error && !isAuthenticated) {\n        console.warn('[ADMIN-SHELL] Auth error surfaced to login form instead of blocking recovery:', error);\n    }\n\n";
source = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
writeFileSync(path, source);
console.log('Admin auth recovery patched.');
