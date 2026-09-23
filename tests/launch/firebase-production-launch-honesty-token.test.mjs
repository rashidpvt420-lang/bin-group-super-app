import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');

test('production Launch Honesty receives authenticated read-only GitHub token', () => {
  assert.match(workflow, /permissions:\s*\n\s*contents: read\s*\n\s*actions: read\s*\n\s*id-token: write/);

  const marker = '      - name: Launch honesty and hard-launch control regressions';
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, 'production workflow must run Launch Honesty');

  const nextStep = workflow.indexOf('\n      - name:', start + marker.length);
  const step = workflow.slice(start, nextStep === -1 ? workflow.length : nextStep);

  assert.match(step, /env:\s*\n\s*GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(step, /run: npm run test:launch-honesty/);
});
