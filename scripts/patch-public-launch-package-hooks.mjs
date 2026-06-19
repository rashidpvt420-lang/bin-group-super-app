import { readFileSync, writeFileSync } from 'node:fs';

const updateJson = (path, updater) => {
  const json = JSON.parse(readFileSync(path, 'utf8'));
  updater(json);
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`);
};

updateJson('package.json', (pkg) => {
  pkg.scripts = pkg.scripts || {};
  const prebuild = pkg.scripts.prebuild || 'vite build';
  if (!prebuild.includes('wire-public-launch-command-center.mjs')) {
    pkg.scripts.prebuild = `${prebuild} && node scripts/wire-public-launch-command-center.mjs`;
  }
  pkg.scripts['test:public-launch-command'] = 'node scripts/verify-public-launch-command-center.mjs';
});

updateJson('apps/admin-panel/package.json', (pkg) => {
  pkg.scripts = pkg.scripts || {};
  const prebuild = pkg.scripts.prebuild || '';
  if (!prebuild.includes('wire-public-launch-command-center.mjs')) {
    pkg.scripts.prebuild = prebuild ? `${prebuild} && node ../../scripts/wire-public-launch-command-center.mjs` : 'node ../../scripts/wire-public-launch-command-center.mjs';
  }
});

console.log('Public launch package hooks patched.');
