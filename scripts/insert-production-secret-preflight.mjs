import fs from 'node:fs';

const path = '.github/workflows/firebase-production-deploy.yml';
let source = fs.readFileSync(path, 'utf8');
const before = `      - name: Install dependencies with retry
        run: bash scripts/npm-install-retry.sh

      - name: Verify predeploy hard-clearance run provenance`;
const after = `      - name: Install dependencies with retry
        run: bash scripts/npm-install-retry.sh

      - name: Verify required Firebase production function secrets
        run: node scripts/verify-firebase-production-secrets.mjs

      - name: Verify predeploy hard-clearance run provenance`;
if (!source.includes(before)) throw new Error('Authenticated deployment insertion point not found.');
if (source.includes('Verify required Firebase production function secrets')) throw new Error('Production secret preflight already exists.');
source = source.replace(before, after);
fs.writeFileSync(path, source);
console.log('Inserted Firebase production secret preflight.');
