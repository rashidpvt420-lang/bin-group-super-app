#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const violations = [];
const root = process.cwd();
const resolve = (file) => path.join(root, file);

if (fs.existsSync(resolve('firebase.json'))) {
  const config = JSON.parse(fs.readFileSync(resolve('firebase.json'), 'utf8'));
  const extensions = config.extensions;
  if (Array.isArray(extensions) ? extensions.length > 0 : Boolean(extensions && Object.keys(extensions).length > 0)) {
    violations.push('firebase.json contains a Firebase Extensions manifest.');
  }
}

if (fs.existsSync(resolve('extensions'))) {
  const entries = fs.readdirSync(resolve('extensions')).filter((name) => !name.startsWith('.'));
  if (entries.length > 0) violations.push('extensions/ contains Firebase Extension instance configuration.');
}

const filesToCheck = ['package.json', 'firebase.json'];
for (const directory of ['.github/workflows', 'scripts']) {
  const absolute = resolve(directory);
  if (!fs.existsSync(absolute)) continue;
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (/\.(json|yml|yaml|mjs|js|ts|tsx|sh)$/i.test(entry.name)) filesToCheck.push(path.relative(root, full));
    }
  };
  visit(absolute);
}

const managementWorkflow = path.normalize('.github/workflows/firebase-extensions-decommission.yml');
const forbidden = ['ext:install', 'ext:configure', 'ext:update', '--only extensions'];
for (const file of [...new Set(filesToCheck)]) {
  if (!fs.existsSync(resolve(file)) || path.normalize(file) === managementWorkflow) continue;
  const source = fs.readFileSync(resolve(file), 'utf8').toLowerCase();
  for (const token of forbidden) {
    if (source.includes(token)) violations.push(`${file} contains forbidden Firebase Extensions command: ${token}`);
  }
}

if (violations.length > 0) {
  console.error('Firebase Extensions decommission guard failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('Firebase Extensions decommission guard passed.');
